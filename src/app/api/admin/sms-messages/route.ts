// ── Admin: SMS delivery log — list + analytics ──────────────────────
// GET ?status=&q=&page= → items + {sent, failed, costTotal, byProvider}
import { db } from '@/lib/db'
import { requireRole, jsonError, safeInt } from '@/lib/auth'

const MESSAGE_STATUSES = ['QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'RECEIVED']
const PAGE_SIZE = 20

export async function GET(req: Request) {
  try {
    await requireRole(['OWNER', 'ADMIN', 'DEVELOPER', 'FINANCE', 'SUPPORT', 'AGENT', 'VIEWER'])
    const url = new URL(req.url)
    const status = url.searchParams.get('status')?.trim()
    const q = url.searchParams.get('q')?.trim()
    const page = safeInt(url.searchParams.get('page'), 1)

    const where: Record<string, unknown> = {}
    if (status && MESSAGE_STATUSES.includes(status)) where.status = status
    if (q) {
      where.OR = [
        { toNumber: { contains: q } },
        { body: { contains: q } },
        { customerRef: { contains: q } },
        { relatedId: { contains: q } },
      ]
    }

    const [total, items, sent, failed, costAgg, byProvider] = await Promise.all([
      db.smsMessage.count({ where }),
      db.smsMessage.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      db.smsMessage.count({ where: { status: { in: ['SENT', 'DELIVERED'] } } }),
      db.smsMessage.count({ where: { status: 'FAILED' } }),
      db.smsMessage.aggregate({ _sum: { cost: true } }),
      db.smsMessage.groupBy({ by: ['providerType'], _count: { _all: true } }),
    ])

    return Response.json({
      ok: true,
      items,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      stats: {
        sent,
        failed,
        costTotal: costAgg._sum.cost ?? 0,
        byProvider: byProvider
          .map((g) => ({ provider: g.providerType ?? 'UNKNOWN', count: g._count._all }))
          .sort((a, b) => b.count - a.count),
      },
    })
  } catch (err) {
    return jsonError(err)
  }
}
