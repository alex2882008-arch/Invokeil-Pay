import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError, safeInt, logActivity } from '@/lib/auth'
import { FINANCE_ROLES } from '@/lib/roles'

/**
 * Disputes API
 * GET  ?status&q&page → paged list + pipeline stats
 * POST {transactionId, reason, amount?, deadlineAt?} → OPEN dispute
 */

const PAGE_SIZE = 20
const READ_ROLES = [...FINANCE_ROLES, 'SUPPORT'] as Array<'OWNER' | 'ADMIN' | 'FINANCE' | 'SUPPORT'>

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback
  try {
    const v = JSON.parse(raw) as T
    return v ?? fallback
  } catch {
    return fallback
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
    if (status && ['OPEN', 'UNDER_REVIEW', 'WON', 'LOST', 'CANCELLED'].includes(status)) where.status = status
    if (q) {
      where.OR = [
        { trxRef: { contains: q } },
        { customerRef: { contains: q } },
        { reason: { contains: q } },
        { transaction: { OR: [{ trxId: { contains: q } }, { senderNumber: { contains: q } }] } },
      ]
    }

    const [total, disputes, statusGroups, atRiskAgg] = await Promise.all([
      db.dispute.count({ where }),
      db.dispute.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: {
          transaction: {
            select: { id: true, trxId: true, mfs: true, amount: true, status: true, senderNumber: true, occurredAt: true },
          },
        },
      }),
      db.dispute.groupBy({ by: ['status'], _count: { _all: true } }),
      db.dispute.aggregate({ where: { status: { in: ['OPEN', 'UNDER_REVIEW'] } }, _sum: { amount: true } }),
    ])

    const stats: Record<string, number> = { OPEN: 0, UNDER_REVIEW: 0, WON: 0, LOST: 0, CANCELLED: 0 }
    for (const g of statusGroups) stats[g.status] = g._count._all

    return Response.json({
      disputes: disputes.map((d) => ({
        ...d,
        evidence: parseJson<Array<{ name: string; url: string; ref?: string }>>(d.evidence, []),
        messages: parseJson<Array<{ by: string; at: string; body: string }>>(d.messages, []),
      })),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      stats: { ...stats, atRisk: round2(atRiskAgg._sum.amount ?? 0) },
    })
  } catch (err) {
    return jsonError(err)
  }
}

// ── POST: open a dispute ─────────────────────────────────────────────────────
export async function POST(req: Request) {
  try {
    const me = await requireRole(FINANCE_ROLES)
    const body: unknown = await req.json().catch(() => ({}))
    const b = (body ?? {}) as Record<string, unknown>

    const transactionId = typeof b.transactionId === 'string' ? b.transactionId.trim() : ''
    if (!transactionId) throw new HttpError(400, 'A transaction is required')
    const reason = typeof b.reason === 'string' ? b.reason.trim() : ''
    if (!reason) throw new HttpError(400, 'A reason is required')

    const tx = await db.transaction.findUnique({ where: { id: transactionId } })
    if (!tx) throw new HttpError(404, 'Transaction not found')

    let amount = round2(tx.amount)
    if (b.amount !== undefined && b.amount !== null && b.amount !== '') {
      const raw = Number(b.amount)
      if (!Number.isFinite(raw) || raw <= 0) throw new HttpError(400, 'Disputed amount must be a positive number')
      amount = round2(raw)
    }

    let deadlineAt: Date | null = null
    if (typeof b.deadlineAt === 'string' && b.deadlineAt.trim() !== '') {
      const d = new Date(b.deadlineAt)
      if (isNaN(d.getTime())) throw new HttpError(400, 'Deadline must be a valid date')
      deadlineAt = d
    }

    const dispute = await db.dispute.create({
      data: {
        transactionId: tx.id,
        trxRef: tx.trxId,
        customerRef: tx.customerId ?? tx.senderNumber,
        amount,
        reason,
        status: 'OPEN',
        evidence: '[]',
        messages: '[]',
        deadlineAt,
      },
    })

    await logActivity(me, 'dispute.created', dispute.id, { amount, trxId: tx.trxId })
    return Response.json({ ok: true, dispute: { ...dispute, evidence: [], messages: [] } }, { status: 201 })
  } catch (err) {
    return jsonError(err)
  }
}
