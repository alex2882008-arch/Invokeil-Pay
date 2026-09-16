import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError, logActivity } from '@/lib/auth'

function str(v: unknown, max = 320): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

const COLOR_RE = /^#[0-9a-fA-F]{6}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type Ctx = { params: Promise<{ id: string }> }

/** PATCH /api/admin/brands/[id] — edit brand fields (slug stays stable). */
export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const me = await requireRole(['OWNER', 'ADMIN'])
    const { id } = await ctx.params
    const existing = await db.brand.findUnique({ where: { id } })
    if (!existing) throw new HttpError(404, 'Brand not found')

    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const data: Record<string, unknown> = {}

    if (b.name !== undefined) {
      const name = str(b.name, 120)
      if (!name) throw new HttpError(400, 'name cannot be empty')
      data.name = name
    }
    if (b.color !== undefined) {
      const color = str(b.color, 7)
      if (!COLOR_RE.test(color)) throw new HttpError(400, 'color must be a hex value like #2563EB')
      data.color = color
    }
    if (b.domain !== undefined) data.domain = str(b.domain, 200) || null
    if (b.supportEmail !== undefined) {
      const supportEmail = str(b.supportEmail, 200) || null
      if (supportEmail && !EMAIL_RE.test(supportEmail)) throw new HttpError(400, 'supportEmail must be a valid email address')
      data.supportEmail = supportEmail
    }
    if (b.supportPhone !== undefined) data.supportPhone = str(b.supportPhone, 40) || null
    if (b.emailFromName !== undefined) data.emailFromName = str(b.emailFromName, 120) || null
    if (b.currency !== undefined) data.currency = (str(b.currency, 8) || 'BDT').toUpperCase()
    if (b.locale !== undefined) data.locale = str(b.locale, 8) || 'en'
    if (b.active !== undefined) data.active = Boolean(b.active)

    if (Object.keys(data).length === 0) throw new HttpError(400, 'Nothing to update')

    const row = await db.brand.update({ where: { id }, data })
    await logActivity(me, 'brand.updated', `brand:${id}`, { name: row.name })
    return Response.json({ ok: true, data: { id: row.id } })
  } catch (e) {
    return jsonError(e)
  }
}

/** DELETE /api/admin/brands/[id] — per-brand gateway configs cascade away; records keep their brandId strings. */
export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const me = await requireRole(['OWNER', 'ADMIN'])
    const { id } = await ctx.params
    const existing = await db.brand.findUnique({ where: { id } })
    if (!existing) throw new HttpError(404, 'Brand not found')
    await db.brand.delete({ where: { id } })
    await logActivity(me, 'brand.deleted', `brand:${id}`, { name: existing.name })
    return Response.json({ ok: true, data: { id } })
  } catch (e) {
    return jsonError(e)
  }
}
