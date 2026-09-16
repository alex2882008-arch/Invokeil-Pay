import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError, safeInt, isAdminRole, logActivity } from '@/lib/auth'
import { FINANCE_ROLES } from '@/lib/roles'
import { getMergedSettings } from '@/lib/settings-defaults'

/**
 * Refunds API (maker-checker)
 * GET  ?status&q&page  → paged list + pipeline stats
 * POST {transactionId, type FULL|PARTIAL, amount?, reason, evidence?: string[]}
 *   - enforces refundWindowDays (admins override)
 *   - amount ≥ approvalThresholdAmount → linked ApprovalRequest row (agent 8-E renders it)
 */

const PAGE_SIZE = 20
const READ_ROLES = [...FINANCE_ROLES, 'SUPPORT'] as Array<'OWNER' | 'ADMIN' | 'FINANCE' | 'SUPPORT'>

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function parseNotes(raw: string | null): Array<{ by: string; at: string; body: string }> {
  if (!raw) return []
  try {
    const arr = JSON.parse(raw) as unknown
    if (!Array.isArray(arr)) return []
    return arr.filter(
      (n): n is { by: string; at: string; body: string } =>
        !!n && typeof n === 'object' && typeof (n as { body?: unknown }).body === 'string',
    )
  } catch {
    return raw ? [{ by: 'System', at: new Date().toISOString(), body: raw }] : []
  }
}

function parseEvidence(raw: string | null): string[] {
  if (!raw) return []
  try {
    const arr = JSON.parse(raw) as unknown
    return Array.isArray(arr) ? arr.filter((e): e is string => typeof e === 'string') : []
  } catch {
    return []
  }
}

// ── GET: list + stats ────────────────────────────────────────────────────────
export async function GET(req: Request) {
  try {
    await requireRole(READ_ROLES)
    const sp = new URL(req.url).searchParams
    const status = sp.get('status')
    const q = sp.get('q')?.trim() || null
    const page = safeInt(sp.get('page'), 1)

    const where: Record<string, unknown> = {}
    if (status && ['PENDING', 'APPROVED', 'PROCESSED', 'REJECTED'].includes(status)) where.status = status
    if (q) {
      where.OR = [
        { trxRef: { contains: q } },
        { customerRef: { contains: q } },
        { requestedByName: { contains: q } },
        { reason: { contains: q } },
        { transaction: { OR: [{ trxId: { contains: q } }, { senderNumber: { contains: q } }] } },
      ]
    }

    const [total, refunds, statusGroups, refundedAgg] = await Promise.all([
      db.refund.count({ where }),
      db.refund.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: {
          transaction: {
            select: { id: true, trxId: true, mfs: true, amount: true, status: true, senderNumber: true, refundAmount: true, occurredAt: true },
          },
        },
      }),
      db.refund.groupBy({ by: ['status'], _count: { _all: true } }),
      db.refund.aggregate({ where: { status: 'PROCESSED' }, _sum: { amount: true } }),
    ])

    const stats: Record<string, number> = { PENDING: 0, APPROVED: 0, PROCESSED: 0, REJECTED: 0 }
    for (const g of statusGroups) stats[g.status] = g._count._all

    return Response.json({
      refunds: refunds.map((r) => ({
        id: r.id,
        transactionId: r.transactionId,
        trxRef: r.trxRef,
        customerRef: r.customerRef,
        type: r.type,
        amount: r.amount,
        reason: r.reason,
        status: r.status,
        evidence: parseEvidence(r.evidence),
        notes: parseNotes(r.notes),
        requestedByName: r.requestedByName,
        approvedByName: r.approvedByName,
        processedByName: r.processedByName,
        approvalId: r.approvalId,
        decidedAt: r.decidedAt,
        processedAt: r.processedAt,
        createdAt: r.createdAt,
        trx: r.transaction,
      })),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      stats: { ...stats, refundedTotal: round2(refundedAgg._sum.amount ?? 0) },
    })
  } catch (err) {
    return jsonError(err)
  }
}

// ── POST: create refund (window rule + maker-checker) ───────────────────────
export async function POST(req: Request) {
  try {
    const me = await requireRole(FINANCE_ROLES)
    const body: unknown = await req.json().catch(() => ({}))
    const b = (body ?? {}) as Record<string, unknown>

    const transactionId = typeof b.transactionId === 'string' ? b.transactionId.trim() : ''
    if (!transactionId) throw new HttpError(400, 'A transaction is required')
    const type = b.type === 'PARTIAL' ? 'PARTIAL' : 'FULL'
    const reason = typeof b.reason === 'string' ? b.reason.trim() : ''
    if (!reason) throw new HttpError(400, 'A reason is required')
    const evidence = Array.isArray(b.evidence)
      ? b.evidence.filter((e): e is string => typeof e === 'string' && e.trim() !== '').map((e) => e.trim()).slice(0, 10)
      : []

    const tx = await db.transaction.findUnique({ where: { id: transactionId } })
    if (!tx) throw new HttpError(404, 'Transaction not found')
    if (!['PAID', 'MATCHED'].includes(tx.status)) {
      throw new HttpError(400, 'Only paid or matched transactions can be refunded')
    }

    const remaining = round2(tx.amount - tx.refundAmount)
    if (remaining <= 0) throw new HttpError(400, 'This transaction is already fully refunded')

    // Refund window (admins may override)
    const settings = await getMergedSettings()
    const windowDays = Number(settings.refundWindowDays ?? '0')
    if (windowDays > 0 && !isAdminRole(me.role)) {
      const ageDays = (Date.now() - tx.occurredAt.getTime()) / 86_400_000
      if (ageDays > windowDays) {
        throw new HttpError(403, `The refund window of ${windowDays} days has passed for this transaction — ask an admin to override`)
      }
    }

    let amount: number
    if (type === 'FULL') {
      amount = remaining
    } else {
      const raw = Number(b.amount)
      if (!Number.isFinite(raw) || raw <= 0) throw new HttpError(400, 'A partial refund amount is required')
      amount = round2(raw)
      if (amount > remaining + 0.009) {
        throw new HttpError(400, `Partial refund cannot exceed the refundable remaining ৳ ${remaining.toFixed(2)}`)
      }
    }

    const threshold = Number(settings.approvalThresholdAmount ?? '0') || 0
    const needsApproval = threshold > 0 && amount >= threshold
    const now = new Date()

    let approvalId: string | null = null
    if (needsApproval) {
      const approval = await db.approvalRequest.create({
        data: {
          type: 'REFUND',
          summary: `Refund ৳${amount.toFixed(2)} (${type}) for ${tx.trxId ?? tx.id}`,
          payload: JSON.stringify({
            refundDraft: { transactionId: tx.id, type, amount, reason, evidence },
          }),
          thresholdAmount: threshold,
          status: 'PENDING',
          requestedByName: me.name,
        },
      })
      approvalId = approval.id
    }

    const refund = await db.refund.create({
      data: {
        transactionId: tx.id,
        trxRef: tx.trxId,
        customerRef: tx.customerId ?? tx.senderNumber,
        type,
        amount,
        reason,
        evidence: JSON.stringify(evidence),
        status: 'PENDING',
        notes: JSON.stringify([{ by: me.name, at: now.toISOString(), body: `Refund requested (${type.toLowerCase()}): ${reason}` }]),
        requestedByName: me.name,
        approvalId,
      },
    })

    await logActivity(me, 'refund.created', refund.id, { amount, type, trxId: tx.trxId, needsApproval })

    return Response.json({ ok: true, refund: { ...refund, notes: parseNotes(refund.notes), evidence: parseEvidence(refund.evidence) }, needsApproval, threshold }, { status: 201 })
  } catch (err) {
    return jsonError(err)
  }
}
