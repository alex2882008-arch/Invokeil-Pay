import { db } from '@/lib/db'
import { jsonError, HttpError } from '@/lib/auth'
import { getMergedSettings } from '@/lib/settings-defaults'

/**
 * POST /api/admin/email/inbound — provider-agnostic inbound webhook.
 * Body: { from, to, subject, text?, html?, secret? }
 * - When the `emailInboundSecret` setting is set, a matching secret is required.
 * - When no secret is configured, the endpoint accepts mail only in SANDBOX appMode
 *   (beginner-safe out-of-the-box; set a secret before going to PRODUCTION).
 * Records an EmailMessage row with direction/status RECEIVED.
 */
export async function POST(req: Request) {
  try {
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const from = typeof b.from === 'string' ? b.from.trim() : ''
    const to = typeof b.to === 'string' ? b.to.trim() : ''
    const subject = typeof b.subject === 'string' ? b.subject.trim() : ''
    if (!from || !to || !subject) throw new HttpError(400, 'from, to and subject are required')

    const settings = await getMergedSettings()
    if (settings.emailReceiveEnabled === 'false') throw new HttpError(403, 'Inbound email is disabled')

    const configuredSecret = settings.emailInboundSecret
    if (configuredSecret) {
      const provided = typeof b.secret === 'string' ? b.secret : (req.headers.get('x-inbound-secret') ?? '')
      if (provided !== configuredSecret) throw new HttpError(401, 'Invalid inbound secret')
    } else if (settings.appMode !== 'SANDBOX') {
      throw new HttpError(401, 'Inbound secret not configured — set the emailInboundSecret setting before accepting inbound email in PRODUCTION')
    }

    const text = typeof b.text === 'string' ? b.text.slice(0, 50_000) : null
    const html = typeof b.html === 'string' ? b.html.slice(0, 100_000) : null

    const row = await db.emailMessage.create({
      data: {
        direction: 'RECEIVED',
        toAddress: to.slice(0, 200),
        fromAddress: from.slice(0, 200),
        subject: subject.slice(0, 300),
        bodyHtml: html,
        bodyText: text,
        providerType: 'INBOUND',
        providerMessageId: typeof b.messageId === 'string' ? b.messageId.slice(0, 200) : null,
        status: 'RECEIVED',
        receivedAt: new Date(),
      },
    })

    return Response.json({ ok: true, id: row.id })
  } catch (e) {
    return jsonError(e)
  }
}

/** GET — POST only. */
export function GET() {
  return Response.json({ error: 'POST only' }, { status: 405 })
}
