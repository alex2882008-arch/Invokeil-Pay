import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError, logActivity } from '@/lib/auth'
import { DEV_ROLES } from '@/lib/roles'

function str(v: unknown, max = 320): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

function rollout(v: unknown): number {
  const n = Number(v)
  if (!Number.isFinite(n)) return 0
  return Math.min(Math.max(Math.trunc(n), 0), 100)
}

type Ctx = { params: Promise<{ id: string }> }

/** PATCH /api/admin/flags/[id] — { name?, description?, enabled?, rolloutPercent? }. */
export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const me = await requireRole(DEV_ROLES)
    const { id } = await ctx.params
    const existing = await db.featureFlag.findUnique({ where: { id } })
    if (!existing) throw new HttpError(404, 'Flag not found')

    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const data: { name?: string; description?: string | null; enabled?: boolean; rolloutPercent?: number } = {}
    if (b.name !== undefined) {
      const name = str(b.name, 120)
      if (!name) throw new HttpError(400, 'name cannot be empty')
      data.name = name
    }
    if (b.description !== undefined) data.description = str(b.description, 500) || null
    if (b.enabled !== undefined) data.enabled = Boolean(b.enabled)
    if (b.rolloutPercent !== undefined) data.rolloutPercent = rollout(b.rolloutPercent)
    if (Object.keys(data).length === 0) throw new HttpError(400, 'Nothing to update')

    const row = await db.featureFlag.update({ where: { id }, data })
    await logActivity(me, 'flag.updated', `featureFlag:${existing.key}`, data as Record<string, unknown>)
    return Response.json({ ok: true, data: row })
  } catch (e) {
    return jsonError(e)
  }
}

/** DELETE /api/admin/flags/[id] */
export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const me = await requireRole(DEV_ROLES)
    const { id } = await ctx.params
    const existing = await db.featureFlag.findUnique({ where: { id } })
    if (!existing) throw new HttpError(404, 'Flag not found')
    await db.featureFlag.delete({ where: { id } })
    await logActivity(me, 'flag.deleted', `featureFlag:${existing.key}`)
    return Response.json({ ok: true, data: { id } })
  } catch (e) {
    return jsonError(e)
  }
}
