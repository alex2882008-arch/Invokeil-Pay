import { db } from '@/lib/db'
import { requireRole, jsonError, safeInt } from '@/lib/auth'

// ── Admin: Risk review queue ─────────────────────────────────────────────────
// GET ?status&q&page → { items(+rule), total, page, pages, counts }

const CASE_STATUSES = ['OPEN', 'CLEARED', 'BLOCKED'] as const
const RISK_READ_ROLES = ['OWNER', 'ADMIN', 'FINANCE', 'SUPPORT', 'DEVELOPER'] as const
const PAGE_SIZE = 20

export async function GET(req: Request) {
  try {
    await requireRole([...RISK_READ_ROLES])
    const url = new URL(req.url)

    const status = url.searchParams.get('status')
    const q = url.searchParams.get('q')?.trim()
    const page = safeInt(url.searchParams.get('page'), 1)

    const where: Record<string, unknown> = {}
    if (status && (CASE_STATUSES as readonly string[]).includes(status)) where.status = status
    if (q) where.OR = [{ subjectRef: { contains: q } }, { reason: { contains: q } }]

    const [total, open, cleared, blocked, items] = await Promise.all([
      db.riskCase.count({ where }),
      db.riskCase.count({ where: { status: 'OPEN' } }),
      db.riskCase.count({ where: { status: 'CLEARED' } }),
      db.riskCase.count({ where: { status: 'BLOCKED' } }),
      db.riskCase.findMany({
        where,
        orderBy: [{ status: 'asc' }, { score: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: { rule: { select: { name: true, type: true, action: true } } },
      }),
    ])

    return Response.json({
      items,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      counts: { open, cleared, blocked },
    })
  } catch (err) {
    return jsonError(err)
  }
}
