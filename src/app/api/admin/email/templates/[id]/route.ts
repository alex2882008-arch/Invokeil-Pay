import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError, logActivity } from '@/lib/auth'

/** PATCH — edit subject / bodyHtml / active (builtin templates are editable). */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const me = await requireRole(['OWNER', 'ADMIN', 'SUPPORT'])
    const { id } = await params
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>

    const existing = await db.emailTemplate.findUnique({ where: { id } })
    if (!existing) throw new HttpError(404, 'Template not found')

    const data: Record<string, unknown> = {}
    if (typeof b.subject === 'string' && b.subject.trim()) data.subject = b.subject.trim().slice(0, 300)
    if (typeof b.bodyHtml === 'string' && b.bodyHtml.trim()) data.bodyHtml = b.bodyHtml.slice(0, 100_000)
    if (b.active !== undefined) data.active = Boolean(b.active)
    if (Object.keys(data).length === 0) throw new HttpError(400, 'Nothing to update — send subject, bodyHtml or active')

    const row = await db.emailTemplate.update({ where: { id }, data })
    await logActivity(me, 'email.template.updated', `emailTemplate:${id}`, { key: existing.key, fields: Object.keys(data) })
    return Response.json({
      ok: true,
      data: { ...row, variables: safeParseArray(row.variables) },
    })
  } catch (e) {
    return jsonError(e)
  }
}

/** DELETE — only non-builtin (custom) templates can be deleted. */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const me = await requireRole(['OWNER', 'ADMIN'])
    const { id } = await params
    const existing = await db.emailTemplate.findUnique({ where: { id }, select: { id: true, key: true, builtin: true } })
    if (!existing) throw new HttpError(404, 'Template not found')
    if (existing.builtin) throw new HttpError(400, 'Built-in templates cannot be deleted — set active=false instead')
    await db.emailTemplate.delete({ where: { id } })
    await logActivity(me, 'email.template.deleted', `emailTemplate:${id}`, { key: existing.key })
    return Response.json({ ok: true })
  } catch (e) {
    return jsonError(e)
  }
}

function safeParseArray(json: string | null): string[] {
  if (!json) return []
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? v.map(String) : []
  } catch {
    return []
  }
}
