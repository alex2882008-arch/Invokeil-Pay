import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError, logActivity } from '@/lib/auth'
import { OPS_ROLES } from '@/lib/roles'

const STATUSES = ['OPERATIONAL', 'DEGRADED', 'PARTIAL', 'OUTAGE', 'MAINTENANCE'] as const

function str(v: unknown, max = 200): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

/** GET /api/admin/status-components — ordered for the public status page. */
export async function GET() {
  try {
    await requireRole(['OWNER', 'ADMIN', 'SUPPORT', 'AGENT', 'VIEWER'])
    const items = await db.statusComponent.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] })
    return Response.json({ ok: true, data: { items } })
  } catch (e) {
    return jsonError(e)
  }
}

/** POST /api/admin/status-components — { name, status?, sortOrder? }. */
export async function POST(req: Request) {
  try {
    const me = await requireRole(OPS_ROLES)
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const name = str(b.name, 120)
    if (!name) throw new HttpError(400, 'name is required')
    const statusRaw = str(b.status, 20).toUpperCase()
    const status = (STATUSES as readonly string[]).includes(statusRaw) ? statusRaw : 'OPERATIONAL'
    const sortOrderNum = Number(b.sortOrder)
    const sortOrder = Number.isFinite(sortOrderNum) ? Math.trunc(sortOrderNum) : 0

    const row = await db.statusComponent.create({ data: { name, status, sortOrder } })
    await logActivity(me, 'status-component.created', `statusComponent:${row.id}`, { name })
    return Response.json({ ok: true, data: { id: row.id } }, { status: 201 })
  } catch (e) {
    return jsonError(e)
  }
}
