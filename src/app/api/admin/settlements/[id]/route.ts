import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError, logActivity } from '@/lib/auth'
import { FINANCE_ROLES } from '@/lib/roles'

/**
 * Settlement detail + reconcile / settle actions.
 * PATCH {action:'reconcile', actual, adjustments?, missingCount?, notes?}
 *   → status RECONCILED when |expected − actual| < 0.01, else MISMATCH
 * PATCH {action:'settle'}
 *   → marks included transactions settled=true, settledAt=now, settlementId=id
 */

type RouteCtx = { params: Promise<{ id: string }> }
const WRITE_ROLES = FINANCE_ROLES
const READ_ROLES = [...FINANCE_ROLES, 'SUPPORT'] as Array<'OWNER' | 'ADMIN' | 'FINANCE' | 'SUPPORT'>

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function parseTrxIds(raw: string | null): string[] {
  if (!raw) return []
  try {
    const arr = JSON.parse(raw) as unknown
    return Array.isArray(arr) ? arr.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

// ── GET: detail (parsed trxIds count) ────────────────────────────────────────
export async function GET(_req: Request, { params }: RouteCtx) {
  try {
    await requireRole(READ_ROLES)
    const { id } = await params
    const settlement = await db.settlement.findUnique({ where: { id } })
    if (!settlement) throw new HttpError(404, 'Settlement not found')
    const trxIds = parseTrxIds(settlement.trxIds)
    const settledCount = trxIds.length
      ? await db.transaction.count({ where: { id: { in: trxIds }, settled: true } })
      : 0
    return Response.json({ settlement: { ...settlement, trxCount: trxIds.length, settledCount } })
  } catch (err) {
    return jsonError(err)
  }
}

// ── PATCH: reconcile / settle ────────────────────────────────────────────────
export async function PATCH(req: Request, { params }: RouteCtx) {
  try {
    const me = await requireRole(WRITE_ROLES)
    const { id } = await params
    const body: unknown = await req.json().catch(() => ({}))
    const b = (body ?? {}) as Record<string, unknown>
    const action = typeof b.action === 'string' ? b.action : ''

    const settlement = await db.settlement.findUnique({ where: { id } })
    if (!settlement) throw new HttpError(404, 'Settlement not found')

    if (action === 'reconcile') {
      const trxIds = parseTrxIds(settlement.trxIds)
      const settledCount = trxIds.length
        ? await db.transaction.count({ where: { id: { in: trxIds }, settled: true } })
        : 0
      if (settledCount > 0) throw new HttpError(400, 'This settlement is already settled')

      const actual = round2(Number(b.actual))
      if (!Number.isFinite(actual) || actual < 0) throw new HttpError(400, 'Actual received must be a non-negative number')
      const adjustments = b.adjustments === undefined || b.adjustments === '' ? 0 : round2(Number(b.adjustments))
      if (!Number.isFinite(adjustments)) throw new HttpError(400, 'Adjustments must be a number')
      const missingCount = b.missingCount === undefined || b.missingCount === '' ? 0 : Math.max(0, Math.round(Number(b.missingCount)))
      if (!Number.isFinite(missingCount)) throw new HttpError(400, 'Missing count must be a number')
      const notes = typeof b.notes === 'string' && b.notes.trim() !== '' ? b.notes.trim() : null

      const status = Math.abs(settlement.expected - actual) < 0.01 ? 'RECONCILED' : 'MISMATCH'
      const updated = await db.settlement.update({
        where: { id },
        data: { actual, adjustments, missingCount, notes, status, reconciledAt: new Date() },
      })
      await logActivity(me, 'settlement.reconciled', id, { status, actual, adjustments, missingCount })
      return Response.json({ ok: true, settlement: updated })
    }

    if (action === 'settle') {
      if (settlement.status === 'PENDING') {
        throw new HttpError(400, 'Reconcile this settlement before marking it settled')
      }
      const trxIds = parseTrxIds(settlement.trxIds)
      const result = await db.transaction.updateMany({
        where: { id: { in: trxIds }, settled: false },
        data: { settled: true, settledAt: new Date(), settlementId: settlement.id },
      })
      await logActivity(me, 'settlement.settled', id, { updated: result.count })
      return Response.json({ ok: true, updated: result.count })
    }

    throw new HttpError(400, 'Unknown action')
  } catch (err) {
    return jsonError(err)
  }
}
