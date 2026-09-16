import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError } from '@/lib/auth'
import { FINANCE_ROLES } from '@/lib/roles'

/**
 * Settlement CSV export — the included transaction list.
 * GET /api/admin/settlements/:id/export → text/csv attachment
 */

type RouteCtx = { params: Promise<{ id: string }> }
const READ_ROLES = [...FINANCE_ROLES, 'SUPPORT'] as Array<'OWNER' | 'ADMIN' | 'FINANCE' | 'SUPPORT'>

function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
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

export async function GET(_req: Request, { params }: RouteCtx) {
  try {
    await requireRole(READ_ROLES)
    const { id } = await params
    const settlement = await db.settlement.findUnique({ where: { id } })
    if (!settlement) throw new HttpError(404, 'Settlement not found')

    const trxIds = parseTrxIds(settlement.trxIds)
    const rows = trxIds.length
      ? await db.transaction.findMany({
          where: { id: { in: trxIds } },
          orderBy: { occurredAt: 'asc' },
          select: {
            trxId: true, mfs: true, gatewayCode: true, amount: true, fee: true, charge: true,
            netAmount: true, senderNumber: true, status: true, settled: true, occurredAt: true,
          },
        })
      : []

    const header = 'trxId,mfs,gateway,amount,fee,charge,net,senderNumber,status,settled,occurredAt'
    const body = rows
      .map((r) =>
        [
          r.trxId,
          r.mfs,
          r.gatewayCode,
          r.amount,
          r.fee,
          r.charge,
          r.netAmount,
          r.senderNumber,
          r.status,
          r.settled ? 'yes' : 'no',
          r.occurredAt.toISOString(),
        ]
          .map(csvCell)
          .join(','),
      )
      .join('\n')

    return new Response(`${header}\n${body}\n`, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="settlement-${settlement.period}-${settlement.provider}.csv"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    return jsonError(err)
  }
}
