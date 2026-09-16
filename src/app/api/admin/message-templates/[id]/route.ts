// ── Admin: single message template — PATCH & DELETE ─────────────────
import { db } from '@/lib/db'
import { requireRole, HttpError, jsonError, logActivity } from '@/lib/auth'

type Params = { params: Promise<{ id: string }> }

const LOCALES = ['en', 'bn']

export async function PATCH(req: Request, { params }: Params) {
  try {
    const me = await requireRole(['OWNER', 'ADMIN', 'DEVELOPER'])
    const { id } = await params
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const row = await db.messageTemplate.findUnique({ where: { id } })
    if (!row) throw new HttpError(404, 'Template not found')

    if (b.body !== undefined) {
      const body = typeof b.body === 'string' ? b.body.trim() : ''
      if (!body) throw new HttpError(400, 'Message body is required')
    }
    if (b.locale !== undefined && !(typeof b.locale === 'string' && LOCALES.includes(b.locale))) {
      throw new HttpError(400, 'Locale must be en or bn')
    }

    const updated = await db.messageTemplate.update({
      where: { id },
      data: {
        ...(typeof b.body === 'string' ? { body: b.body.trim() } : {}),
        ...(b.subject === undefined
          ? {}
          : typeof b.subject === 'string' && b.subject.trim()
            ? { subject: b.subject.trim().slice(0, 200) }
            : { subject: null }),
        ...(typeof b.enabled === 'boolean' ? { enabled: b.enabled } : {}),
        ...(typeof b.locale === 'string' ? { locale: b.locale } : {}),
      },
    })

    await logActivity(me, 'message_template.updated', `message_template:${id}`, {
      channel: updated.channel,
      event: updated.event,
    })
    return Response.json({ ok: true, item: updated })
  } catch (err) {
    return jsonError(err)
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const me = await requireRole(['OWNER', 'ADMIN'])
    const { id } = await params
    const row = await db.messageTemplate.findUnique({ where: { id } })
    if (!row) throw new HttpError(404, 'Template not found')
    await db.messageTemplate.delete({ where: { id } })
    await logActivity(me, 'message_template.deleted', `message_template:${id}`, {
      channel: row.channel,
      event: row.event,
    })
    return Response.json({ ok: true })
  } catch (err) {
    return jsonError(err)
  }
}
