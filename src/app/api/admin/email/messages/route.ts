import { db } from '@/lib/db'
import { requireRole, jsonError, safeInt } from '@/lib/auth'

const DIRECTIONS = ['SENT', 'RECEIVED']
const STATUSES = ['QUEUED', 'SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'BOUNCED', 'FAILED', 'RECEIVED']

/**
 * GET /api/admin/email/messages — inbox list + aggregated stats.
 * Filters: direction, status, q, page, pageSize.
 */
export async function GET(req: Request) {
  try {
    await requireRole(['OWNER', 'ADMIN', 'DEVELOPER', 'SUPPORT', 'FINANCE', 'AGENT'])
    const url = new URL(req.url)
    const page = safeInt(url.searchParams.get('page'), 1)
    const pageSize = Math.min(safeInt(url.searchParams.get('pageSize'), 25), 200)
    const direction = (url.searchParams.get('direction') ?? '').toUpperCase()
    const status = (url.searchParams.get('status') ?? '').toUpperCase()
    const q = url.searchParams.get('q')?.trim()

    const where: Record<string, unknown> = {}
    if (DIRECTIONS.includes(direction)) where.direction = direction
    if (STATUSES.includes(status)) where.status = status
    if (q) {
      where.OR = [
        { toAddress: { contains: q } },
        { fromAddress: { contains: q } },
        { subject: { contains: q } },
      ]
    }

    const [total, items, sent, failed, bounced, delivered, received, costAgg] = await Promise.all([
      db.emailMessage.count({ where }),
      db.emailMessage.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true, direction: true, toAddress: true, fromAddress: true, subject: true,
          templateKey: true, status: true, providerType: true, error: true, cost: true,
          attempts: true, relatedType: true, relatedId: true, sentAt: true, receivedAt: true, createdAt: true,
        },
      }),
      db.emailMessage.count({ where: { direction: 'SENT' } }),
      db.emailMessage.count({ where: { status: 'FAILED' } }),
      db.emailMessage.count({ where: { status: 'BOUNCED' } }),
      db.emailMessage.count({ where: { status: { in: ['DELIVERED', 'OPENED', 'CLICKED'] } } }),
      db.emailMessage.count({ where: { direction: 'RECEIVED' } }),
      db.emailMessage.aggregate({ _sum: { cost: true } }),
    ])

    return Response.json({
      ok: true,
      data: {
        items,
        total,
        page,
        pages: Math.max(Math.ceil(total / pageSize), 1),
        stats: {
          sent,
          failed,
          bounced,
          delivered,
          received,
          costTotal: costAgg._sum.cost ?? 0,
        },
      },
    })
  } catch (e) {
    return jsonError(e)
  }
}
