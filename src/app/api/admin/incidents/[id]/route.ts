import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError, logActivity } from '@/lib/auth'
import { OPS_ROLES } from '@/lib/roles'

const IMPACTS = ['CRITICAL', 'MAJOR', 'MINOR', 'MAINTENANCE'] as const
const STATUSES = ['INVESTIGATING', 'IDENTIFIED', 'MONITORING', 'RESOLVED'] as const

function str(v: unknown, max = 2000): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

function parseUpdates(raw: string | null | undefined): Array<Record<string, unknown>> {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? (v as Array<Record<string, unknown>>) : []
  } catch {
    return []
  }
}

type Ctx = { params: Promise<{ id: string }> }

/**
 * PATCH /api/admin/incidents/[id]
 * - { action:'status', status, note? } → append timeline update, set resolvedAt when RESOLVED
 * - { action:'edit', title?, body?, impact?, components? } → edit fields
 */
export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const me = await requireRole(OPS_ROLES)
    const { id } = await ctx.params
    const incident = await db.incident.findUnique({ where: { id } })
    if (!incident) throw new HttpError(404, 'Incident not found')

    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const action = str(b.action, 20) || 'status'
    const updates = parseUpdates(incident.updates)

    if (action === 'status') {
      const statusRaw = str(b.status, 20).toUpperCase()
      if (!(STATUSES as readonly string[]).includes(statusRaw)) {
        throw new HttpError(400, `status must be one of ${STATUSES.join(', ')}`)
      }
      const note = str(b.note, 2000)
      if (statusRaw === 'RESOLVED' && incident.status === 'RESOLVED') {
        throw new HttpError(400, 'Incident is already resolved')
      }
      const resolvedAt = statusRaw === 'RESOLVED' ? new Date() : null
      if (note) updates.push({ at: new Date().toISOString(), body: note, status: statusRaw })
      else if (statusRaw !== incident.status) updates.push({ at: new Date().toISOString(), body: `Status changed to ${statusRaw}`, status: statusRaw })

      const row = await db.incident.update({
        where: { id },
        data: { status: statusRaw, updates: JSON.stringify(updates), resolvedAt },
      })
      await logActivity(me, 'incident.status', `incident:${id}`, { status: statusRaw })
      return Response.json({ ok: true, data: { id: row.id, status: row.status, resolvedAt: row.resolvedAt } })
    }

    if (action === 'edit') {
      const title = b.title !== undefined ? str(b.title, 200) : incident.title
      const body = b.body !== undefined ? str(b.body, 5000) : incident.body
      if (!title || !body) throw new HttpError(400, 'title and body cannot be empty')
      let impact = incident.impact
      if (b.impact !== undefined) {
        const impactRaw = str(b.impact, 20).toUpperCase()
        if (!(IMPACTS as readonly string[]).includes(impactRaw)) throw new HttpError(400, `impact must be one of ${IMPACTS.join(', ')}`)
        impact = impactRaw
      }
      let components = incident.components
      if (b.components !== undefined) {
        if (!Array.isArray(b.components)) throw new HttpError(400, 'components must be an array')
        components = JSON.stringify(
          b.components.filter((c): c is string => typeof c === 'string').map((c) => c.trim()).filter(Boolean).slice(0, 20)
        )
      }
      await db.incident.update({ where: { id }, data: { title, body, impact, components } })
      await logActivity(me, 'incident.updated', `incident:${id}`, { title })
      return Response.json({ ok: true, data: { id } })
    }

    throw new HttpError(400, 'action must be "status" or "edit"')
  } catch (e) {
    return jsonError(e)
  }
}

/** DELETE /api/admin/incidents/[id] */
export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const me = await requireRole(['OWNER', 'ADMIN'])
    const { id } = await ctx.params
    const existing = await db.incident.findUnique({ where: { id } })
    if (!existing) throw new HttpError(404, 'Incident not found')
    await db.incident.delete({ where: { id } })
    await logActivity(me, 'incident.deleted', `incident:${id}`, { title: existing.title })
    return Response.json({ ok: true, data: { id } })
  } catch (e) {
    return jsonError(e)
  }
}
