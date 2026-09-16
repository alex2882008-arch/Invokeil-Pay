import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError, safeInt } from '@/lib/auth'

// ── Admin: automation run history ────────────────────────────────────────────
// GET ?automationId=&status=&page= → { runs (+automation name), total, page, pages }
// status ∈ RUNNING | WAITING | SUCCESS | FAILED | CANCELLED

const PAGE_SIZE = 15
const RUN_STATUSES = ['RUNNING', 'WAITING', 'SUCCESS', 'FAILED', 'CANCELLED'] as const

export async function GET(req: Request) {
  try {
    await requireRole(['OWNER', 'ADMIN', 'DEVELOPER', 'FINANCE', 'SUPPORT', 'AGENT', 'VIEWER'])
    const url = new URL(req.url)

    const where: Record<string, unknown> = {}
    const automationId = url.searchParams.get('automationId')?.trim()
    if (automationId) where.automationId = automationId
    const status = url.searchParams.get('status')?.trim()
    if (status && status !== 'ALL') {
      if (!(RUN_STATUSES as readonly string[]).includes(status)) {
        throw new HttpError(400, `Unknown status — expected one of: ${RUN_STATUSES.join(', ')}`)
      }
      where.status = status
    }
    const page = safeInt(url.searchParams.get('page'), 1)

    const [total, runs] = await Promise.all([
      db.automationRun.count({ where }),
      db.automationRun.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: { automation: { select: { id: true, name: true, trigger: true } } },
      }),
    ])

    return Response.json({
      runs,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    })
  } catch (err) {
    return jsonError(err)
  }
}
