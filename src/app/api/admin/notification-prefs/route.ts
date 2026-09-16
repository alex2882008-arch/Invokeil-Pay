// ── Admin: notification preference center (event × channel matrix) ──
// GET    ?audience=MERCHANT|CUSTOMER&customerRef= → rows for all events
//          (defaults are materialized in the response, not persisted)
// PUT    {audience, customerRef?, event, email, sms, webhook, inapp} → upsert
// DELETE ?audience=&subjectRef=&event= → drop an override (back to defaults)
import { db } from '@/lib/db'
import { requireRole, HttpError, jsonError, logActivity } from '@/lib/auth'

export const PREF_EVENTS = [
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
] as const

const AUDIENCES = ['MERCHANT', 'CUSTOMER'] as const

/** Response-level defaults when no row is persisted yet. */
function defaultsFor(audience: string) {
  return audience === 'CUSTOMER'
    ? { email: true, sms: true, webhook: false, inapp: true }
    : { email: true, sms: false, webhook: true, inapp: true }
}

export async function GET(req: Request) {
  try {
    await requireRole(['OWNER', 'ADMIN', 'DEVELOPER', 'FINANCE', 'SUPPORT', 'AGENT', 'VIEWER'])
    const url = new URL(req.url)
    const audience = (url.searchParams.get('audience') ?? 'MERCHANT').toUpperCase()
    if (!(AUDIENCES as readonly string[]).includes(audience)) throw new HttpError(400, 'Unknown audience')
    const subjectRef = url.searchParams.get('customerRef')?.trim() || null
    if (audience === 'MERCHANT' && subjectRef) throw new HttpError(400, 'Merchant matrix takes no customerRef')

    const rows = await db.notificationPref.findMany({
      where: { audience, subjectRef },
    })
    const byEvent = new Map(rows.map((r) => [r.event, r]))
    const def = defaultsFor(audience)

    return Response.json({
      ok: true,
      events: PREF_EVENTS,
      rows: PREF_EVENTS.map((event) => {
        const row = byEvent.get(event)
        return {
          event,
          email: row?.email ?? def.email,
          sms: row?.sms ?? def.sms,
          webhook: row?.webhook ?? def.webhook,
          inapp: row?.inapp ?? def.inapp,
          custom: Boolean(row), // persisted override exists in DB
        }
      }),
    })
  } catch (err) {
    return jsonError(err)
  }
}

export async function PUT(req: Request) {
  try {
    const me = await requireRole(['OWNER', 'ADMIN', 'DEVELOPER'])
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>

    const audience = typeof b.audience === 'string' ? b.audience.toUpperCase() : 'MERCHANT'
    if (!(AUDIENCES as readonly string[]).includes(audience)) throw new HttpError(400, 'Unknown audience')
    const event = typeof b.event === 'string' ? b.event.toUpperCase() : ''
    if (!(PREF_EVENTS as readonly string[]).includes(event)) throw new HttpError(400, 'Unknown event')

    // audience CUSTOMER + customerRef → per-customer override row;
    // MERCHANT (or no ref) → subjectRef null = the merchant default row.
    const subjectRef = audience === 'CUSTOMER' && typeof b.customerRef === 'string' && b.customerRef.trim()
      ? b.customerRef.trim()
      : null
    if (audience === 'CUSTOMER' && !subjectRef) throw new HttpError(400, 'customerRef is required for customer overrides')

    const bool = (v: unknown, dflt: boolean) => (typeof v === 'boolean' ? v : dflt)
    const def = defaultsFor(audience)

    // subjectRef is nullable in the compound unique — findFirst + create/update.
    const existing = await db.notificationPref.findFirst({
      where: { audience, subjectRef, event },
    })

    // Unspecified channels keep the current row's value (never reset other channels).
    const values = {
      email: bool(b.email, existing?.email ?? def.email),
      sms: bool(b.sms, existing?.sms ?? def.sms),
      webhook: bool(b.webhook, existing?.webhook ?? def.webhook),
      inapp: bool(b.inapp, existing?.inapp ?? def.inapp),
    }

    const row = existing
      ? await db.notificationPref.update({ where: { id: existing.id }, data: values })
      : await db.notificationPref.create({ data: { audience, subjectRef, event, ...values } })

    await logActivity(me, 'notification_pref.updated', `pref:${audience}:${subjectRef ?? 'merchant'}:${event}`, values)
    return Response.json({ ok: true, item: { ...row, custom: true } })
  } catch (err) {
    return jsonError(err)
  }
}

export async function DELETE(req: Request) {
  try {
    const me = await requireRole(['OWNER', 'ADMIN', 'DEVELOPER'])
    const url = new URL(req.url)
    const audience = (url.searchParams.get('audience') ?? '').toUpperCase()
    if (!(AUDIENCES as readonly string[]).includes(audience)) throw new HttpError(400, 'Unknown audience')
    const event = (url.searchParams.get('event') ?? '').toUpperCase()
    if (!(PREF_EVENTS as readonly string[]).includes(event)) throw new HttpError(400, 'Unknown event')
    const subjectRef = url.searchParams.get('subjectRef')?.trim() || null

    const res = await db.notificationPref.deleteMany({ where: { audience, subjectRef, event } })
    await logActivity(me, 'notification_pref.reset', `pref:${audience}:${subjectRef ?? 'merchant'}:${event}`, {
      deleted: res.count,
    })
    return Response.json({ ok: true, deleted: res.count })
  } catch (err) {
    return jsonError(err)
  }
}
