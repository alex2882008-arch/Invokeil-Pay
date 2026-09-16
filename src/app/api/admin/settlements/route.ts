import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError, safeInt, logActivity } from '@/lib/auth'
import { FINANCE_ROLES } from '@/lib/roles'

/**
 * Settlements API
 * GET  ?status&period&page → paged list + aggregate cards
 * POST {period:'YYYY-MM', provider: ALL|BKASH|NAGAD|ROCKET|UPAY}
 *   → aggregate unsettled MATCHED/PAID transactions of that month into a PENDING settlement
 */

const PAGE_SIZE = 20
const READ_ROLES = [...FINANCE_ROLES, 'SUPPORT'] as Array<'OWNER' | 'ADMIN' | 'FINANCE' | 'SUPPORT'>
const PROVIDERS = ['ALL', 'BKASH', 'NAGAD', 'ROCKET', 'UPAY']

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

/** Month range from 'YYYY-MM' → [start, end) using server-local time (matches occurredAt writes). */
function monthRange(period: string): { start: Date; end: Date } | null {
  if (!/^\d{4}-\d{2}$/.test(period)) return null
  const [y, m] = period.split('-').map(Number)
  if (m < 1 || m > 12) return null
  return { start: new Date(y, m - 1, 1), end: new Date(y, m, 1) }
}

// ── GET: list + card aggregates ──────────────────────────────────────────────
export async function GET(req: Request) {
  try {
    await requireRole(READ_ROLES)
    const sp = new URL(req.url).searchParams
    const status = sp.get('status')
    const period = sp.get('period')
    const page = safeInt(sp.get('page'), 1)

    const where: Record<string, unknown> = {}
    if (status && ['PENDING', 'RECONCILED', 'MISMATCH'].includes(status)) where.status = status
    if (period && /^\d{4}-\d{2}$/.test(period)) where.period = period

    const [total, settlements, agg] = await Promise.all([
      db.settlement.count({ where }),
      db.settlement.findMany({
        where,
        orderBy: [{ period: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      db.settlement.aggregate({
        where,
        _sum: { expected: true, actual: true, fees: true, adjustments: true, missingCount: true },
        _count: { _all: true },
      }),
    ])

    // How many included transactions are already settled (per listed settlement)
    const allIds = settlements.flatMap((s) => parseTrxIds(s.trxIds))
    const settledGroups = allIds.length
      ? await db.transaction.groupBy({
          by: ['settlementId'],
          where: { id: { in: allIds }, settled: true },
          _count: { _all: true },
        })
      : []
    const settledMap = new Map(settledGroups.map((g) => [g.settlementId, g._count._all]))

    return Response.json({
      settlements: settlements.map((s) => ({
        ...s,
        trxCount: parseTrxIds(s.trxIds).length,
        settledCount: settledMap.get(s.id) ?? 0,
      })),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      stats: {
        count: agg._count._all,
        expected: round2(agg._sum.expected ?? 0),
        actual: round2(agg._sum.actual ?? 0),
        fees: round2(agg._sum.fees ?? 0),
        adjustments: round2(agg._sum.adjustments ?? 0),
        missing: agg._sum.missingCount ?? 0,
      },
    })
  } catch (err) {
    return jsonError(err)
  }
}

// ── POST: generate a settlement for a period/provider ────────────────────────
export async function POST(req: Request) {
  try {
    const me = await requireRole(FINANCE_ROLES)
    const body: unknown = await req.json().catch(() => ({}))
    const b = (body ?? {}) as Record<string, unknown>

    const period = typeof b.period === 'string' ? b.period.trim() : ''
    const range = monthRange(period)
    if (!range) throw new HttpError(400, "Period must be in 'YYYY-MM' format")
    const provider = typeof b.provider === 'string' && PROVIDERS.includes(b.provider) ? b.provider : 'ALL'

    const existing = await db.settlement.findFirst({ where: { period, provider } })
    if (existing && existing.status !== 'MISMATCH') {
      throw new HttpError(409, `A ${existing.status.toLowerCase()} settlement for ${period} / ${provider} already exists`)
    }

    const where = {
      status: { in: ['MATCHED', 'PAID'] },
      occurredAt: { gte: range.start, lt: range.end },
      settled: false,
      ...(provider === 'ALL' ? {} : { mfs: provider }),
    }

    const [agg, txs] = await Promise.all([
      db.transaction.aggregate({ where, _sum: { amount: true, fee: true, charge: true }, _count: { _all: true } }),
      db.transaction.findMany({ where, select: { id: true } }),
    ])

    const itemCount = agg._count._all
    if (itemCount === 0) {
      throw new HttpError(400, 'No unsettled matched/paid transactions found for this period and provider')
    }

    const expected = round2(agg._sum.amount ?? 0)
    const fees = round2((agg._sum.fee ?? 0) + (agg._sum.charge ?? 0))
    const actual = round2(expected - fees)

    const settlement = await db.settlement.create({
      data: {
        period,
        provider,
        expected,
        actual,
        fees,
        adjustments: 0,
        status: 'PENDING',
        itemCount,
        missingCount: 0,
        trxIds: JSON.stringify(txs.map((t) => t.id)),
      },
    })

    await logActivity(me, 'settlement.generated', settlement.id, { period, provider, itemCount, expected })
    return Response.json({ ok: true, settlement: { ...settlement, trxCount: itemCount, settledCount: 0 } }, { status: 201 })
  } catch (err) {
    return jsonError(err)
  }
}
