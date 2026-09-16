import { db } from '@/lib/db'
import { requireRole, jsonError, safeInt } from '@/lib/auth'

// ── Security Center v2: audit log tail ───────────────────────────────────────
// GET ?page → { items(+actor name), total, page, pages }

const PAGE_SIZE = 25
const AUDIT_ROLES = ['OWNER', 'ADMIN', 'DEVELOPER'] as const

export async function GET(req: Request) {
  try {
    await requireRole([...AUDIT_ROLES])
    const url = new URL(req.url)
    const page = safeInt(url.searchParams.get('page'), 1)

    const [total, items] = await Promise.all([
      db.activityLog.count(),
      db.activityLog.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: { user: { select: { name: true } } },
      }),
    ])

    return Response.json({
      items: items.map((a) => ({ ...a, actorName: a.user?.name ?? a.actorName })),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    })
  } catch (err) {
    return jsonError(err)
  }
}
