import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError, logActivity } from '@/lib/auth'
import { OPS_ROLES } from '@/lib/roles'

const STATUSES = ['OPERATIONAL', 'DEGRADED', 'PARTIAL', 'OUTAGE', 'MAINTENANCE'] as const

function str(v: unknown, max = 200): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

type Ctx = { params: Promise<{ id: string }> }

/** PATCH /api/admin/status-components/[id] — { name?, status?, sortOrder? }. */
export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const me = await requireRole(OPS_ROLES)
    const { id } = await ctx.params
    const existing = await db.statusComponent.findUnique({ where: { id } })
    if (!existing) throw new HttpError(404, 'Component not found')

    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const data: { name?: string; status?: string; sortOrder?: number } = {}
    if (b.name !== undefined) {
      const name = str(b.name, 120)
      if (!name) throw new HttpError(400, 'name cannot be empty')
      data.name = name
    }
    if (b.status !== undefined) {
      const statusRaw = str(b.status, 20).toUpperCase()
      if (!(STATUSES as readonly string[]).includes(statusRaw)) {
        throw new HttpError(400, `status must be one of ${STATUSES.join(', ')}`)
      }
      data.status = statusRaw
    }
    if (b.sortOrder !== undefined) {
      const n = Number(b.sortOrder)
      if (!Number.isFinite(n)) throw new HttpError(400, 'sortOrder must be a number')
      data.sortOrder = Math.trunc(n)
    }
    if (Object.keys(data).length === 0) throw new HttpError(400, 'Nothing to update')

    const row = await db.statusComponent.update({ where: { id }, data })
    await logActivity(me, 'status-component.updated', `statusComponent:${id}`, { name: row.name, status: row.status })
    return Response.json({ ok: true, data: { id: row.id, name: row.name, status: row.status, sortOrder: row.sortOrder } })
  } catch (e) {
    return jsonError(e)
  }
}

/** DELETE /api/admin/status-components/[id] */
export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const me = await requireRole(['OWNER', 'ADMIN'])
    const { id } = await ctx.params
    const existing = await db.statusComponent.findUnique({ where: { id } })
    if (!existing) throw new HttpError(404, 'Component not found')
    await db.statusComponent.delete({ where: { id } })
    await logActivity(me, 'status-component.deleted', `statusComponent:${id}`, { name: existing.name })
    return Response.json({ ok: true, data: { id } })
  } catch (e) {
    return jsonError(e)
  }
}
