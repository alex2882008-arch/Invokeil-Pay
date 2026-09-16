// ── Admin: per-brand message templates (SMS/EMAIL) ──────────────────
// GET  ?brandId=default|<id>&channel=SMS|EMAIL → template list
// POST → upsert {brandId?, channel, event, locale, subject?, body, enabled?}
import { db } from '@/lib/db'
import { requireRole, HttpError, jsonError, logActivity } from '@/lib/auth'

export const TEMPLATE_EVENTS = [
  'PAYMENT_SUCCESS',
  'PAYMENT_FAILED',
  'PAYMENT_CANCEL',
  'PAYMENT_DUE',
  'INVOICE_CREATED',
  'INVOICE_OVERDUE',
  'SUBSCRIPTION_RENEWED',
  'REFUND_PROCESSED',
  'DISPUTE_OPENED',
  'OTP',
  'CUSTOM',
] as const

const CHANNELS = ['SMS', 'EMAIL'] as const
const LOCALES = ['en', 'bn'] as const

export function normalizeBrandId(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return !s || s === 'default' ? null : s
}

export async function GET(req: Request) {
  try {
    await requireRole(['OWNER', 'ADMIN', 'DEVELOPER', 'FINANCE', 'SUPPORT', 'AGENT', 'VIEWER'])
    const url = new URL(req.url)
    const brandId = normalizeBrandId(url.searchParams.get('brandId'))
    const channel = url.searchParams.get('channel')?.trim()

    const where: Record<string, unknown> = { brandId }
    if (channel && (CHANNELS as readonly string[]).includes(channel)) where.channel = channel

    const items = await db.messageTemplate.findMany({ where, orderBy: [{ event: 'asc' }, { locale: 'asc' }] })
    return Response.json({ ok: true, items, events: TEMPLATE_EVENTS })
  } catch (err) {
    return jsonError(err)
  }
}

export async function POST(req: Request) {
  try {
    const me = await requireRole(['OWNER', 'ADMIN', 'DEVELOPER'])
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>

    const brandId = normalizeBrandId(b.brandId)
    if (brandId) {
      const brand = await db.brand.findUnique({ where: { id: brandId }, select: { id: true } })
      if (!brand) throw new HttpError(400, 'Brand not found')
    }

    const channel = typeof b.channel === 'string' ? b.channel.toUpperCase() : ''
    if (!(CHANNELS as readonly string[]).includes(channel)) throw new HttpError(400, 'Channel must be SMS or EMAIL')

    const event = typeof b.event === 'string' ? b.event.toUpperCase() : ''
    if (!(TEMPLATE_EVENTS as readonly string[]).includes(event)) throw new HttpError(400, 'Unknown event')

    const locale = typeof b.locale === 'string' && (LOCALES as readonly string[]).includes(b.locale) ? b.locale : 'en'
    const body = typeof b.body === 'string' ? b.body.trim() : ''
    if (!body) throw new HttpError(400, 'Message body is required')
    const subject = typeof b.subject === 'string' && b.subject.trim() ? b.subject.trim().slice(0, 200) : null
    const enabled = typeof b.enabled === 'boolean' ? b.enabled : true

    // Compound unique is (brandId, channel, event, locale) and brandId is
    // nullable — findUnique cannot target null there, so findFirst + upsert.
    const existing = await db.messageTemplate.findFirst({
      where: { brandId, channel, event, locale },
    })

    const row = existing
      ? await db.messageTemplate.update({
          where: { id: existing.id },
          data: { body, subject, enabled },
        })
      : await db.messageTemplate.create({
          data: { brandId, channel, event, locale, body, subject, enabled },
        })

    await logActivity(me, 'message_template.saved', `message_template:${row.id}`, {
      channel,
      event,
      locale,
      brandId: brandId ?? 'default',
    })
    return Response.json({ ok: true, item: row })
  } catch (err) {
    return jsonError(err)
  }
}
