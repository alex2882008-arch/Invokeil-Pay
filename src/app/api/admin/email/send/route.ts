import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError, logActivity } from '@/lib/auth'
import { sendEmail, sendTemplatedEmail } from '@/lib/providers/email'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function textToHtml(text: string): string {
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const paras = esc.split(/\n{2,}/).map((p) => `<p style="margin:0 0 12px">${p.replace(/\n/g, '<br/>')}</p>`)
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#111">${paras.join('')}</div>`
}

/**
 * POST /api/admin/email/send — { to, subject?, html?, body?, templateKey?, vars?,
 *                                 identityId?, relatedType?, relatedId?, customerRef? }
 * templateKey → sendTemplatedEmail ({{var}} interpolation), otherwise plain send
 * with body wrapped into simple HTML.
 */
export async function POST(req: Request) {
  try {
    const me = await requireRole(['OWNER', 'ADMIN', 'SUPPORT', 'DEVELOPER'])
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>

    const to = typeof b.to === 'string' ? b.to.trim() : ''
    if (!EMAIL_RE.test(to)) throw new HttpError(400, 'A valid "to" email address is required')

    const templateKey = typeof b.templateKey === 'string' && b.templateKey.trim() ? b.templateKey.trim() : null
    const identityId = typeof b.identityId === 'string' && b.identityId ? b.identityId : null
    const vars: Record<string, string> = {}
    if (b.vars && typeof b.vars === 'object' && !Array.isArray(b.vars)) {
      for (const [k, v] of Object.entries(b.vars as Record<string, unknown>)) {
        if (v == null) continue
        vars[k] = typeof v === 'string' ? v : String(v)
      }
    }

    if (identityId) {
      const identity = await db.emailIdentity.findUnique({ where: { id: identityId }, select: { id: true, email: true, active: true } })
      if (!identity) throw new HttpError(404, 'Identity not found')
      if (!identity.active) throw new HttpError(400, 'This identity is inactive')
    }

    let result
    if (templateKey) {
      const tpl = await db.emailTemplate.findUnique({ where: { key: templateKey }, select: { id: true } })
      if (!tpl) throw new HttpError(404, `Template "${templateKey}" not found`)
      const overrides: { subject?: string; html?: string } = {}
      if (typeof b.subject === 'string' && b.subject.trim()) overrides.subject = b.subject.trim().slice(0, 300)
      if (typeof b.html === 'string' && b.html.trim()) overrides.html = b.html.slice(0, 100_000)
      result = await sendTemplatedEmail({
        key: templateKey,
        to,
        vars,
        identityId,
        relatedType: typeof b.relatedType === 'string' ? b.relatedType.slice(0, 60) : null,
        relatedId: typeof b.relatedId === 'string' ? b.relatedId.slice(0, 60) : null,
        customerRef: typeof b.customerRef === 'string' ? b.customerRef.slice(0, 60) : null,
        overrides,
      })
    } else {
      const subject = typeof b.subject === 'string' ? b.subject.trim() : ''
      if (!subject) throw new HttpError(400, 'subject is required when no templateKey is given')
      const html = typeof b.html === 'string' && b.html.trim()
        ? b.html.slice(0, 100_000)
        : textToHtml(typeof b.body === 'string' ? b.body : '')
      if (!html.trim()) throw new HttpError(400, 'body (or html) is required when no templateKey is given')
      result = await sendEmail({
        to,
        subject: subject.slice(0, 300),
        html,
        identityId,
        relatedType: typeof b.relatedType === 'string' ? b.relatedType.slice(0, 60) : null,
        relatedId: typeof b.relatedId === 'string' ? b.relatedId.slice(0, 60) : null,
        customerRef: typeof b.customerRef === 'string' ? b.customerRef.slice(0, 60) : null,
      })
    }

    await logActivity(me, 'email.sent', `emailMessage:${result.messageId}`, {
      to,
      templateKey,
      provider: result.provider,
      ok: result.ok,
      simulated: result.simulated,
    })
    return Response.json({ ok: true, data: result })
  } catch (e) {
    return jsonError(e)
  }
}
