import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError, logActivity } from '@/lib/auth'

const PURPOSES = ['GENERAL', 'SALES', 'PAYMENTS', 'INVOICES', 'SUPPORT', 'REFUNDS', 'SECURITY', 'OTP', 'BILLING', 'NOREPLY', 'CUSTOM']

/** The 11 suggested identities — presets for one-click quick-add. */
const PRESETS = [
  { label: 'Sales manager', local: 'sales-manager', purpose: 'SALES' },
  { label: 'General', local: 'hello', purpose: 'GENERAL' },
  { label: 'Sales', local: 'sales', purpose: 'SALES' },
  { label: 'Payments', local: 'payment', purpose: 'PAYMENTS' },
  { label: 'Invoices', local: 'invoice', purpose: 'INVOICES' },
  { label: 'Support', local: 'support', purpose: 'SUPPORT' },
  { label: 'Refunds', local: 'refund', purpose: 'REFUNDS' },
  { label: 'Security', local: 'security', purpose: 'SECURITY' },
  { label: 'OTP', local: 'otp', purpose: 'OTP' },
  { label: 'Billing', local: 'billing', purpose: 'BILLING' },
  { label: 'No Reply', local: 'noreply', purpose: 'NOREPLY' },
]

function str(v: unknown, max = 320): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

/** GET — identities list + quick-add presets. */
export async function GET() {
  try {
    await requireRole(['OWNER', 'ADMIN', 'DEVELOPER', 'SUPPORT', 'FINANCE', 'AGENT'])
    const [items, count] = await Promise.all([
      db.emailIdentity.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], include: { _count: { select: { messages: true } } } }),
      db.emailIdentity.count(),
    ])
    return Response.json({
      ok: true,
      data: {
        items: items.map((i) => ({
          id: i.id,
          label: i.label,
          email: i.email,
          purpose: i.purpose,
          signature: i.signature,
          verified: i.verified,
          active: i.active,
          messageCount: i._count.messages,
        })),
        presets: PRESETS,
        total: count,
      },
    })
  } catch (e) {
    return jsonError(e)
  }
}

/** POST — create an identity. */
export async function POST(req: Request) {
  try {
    const me = await requireRole(['OWNER', 'ADMIN'])
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const label = str(b.label, 120)
    const email = str(b.email, 200).toLowerCase()
    const purpose = str(b.purpose, 40).toUpperCase() || 'CUSTOM'
    if (!label) throw new HttpError(400, 'label is required')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'A valid email address is required')
    if (!PURPOSES.includes(purpose)) throw new HttpError(400, `purpose must be one of ${PURPOSES.join(', ')}`)

    const dup = await db.emailIdentity.findUnique({ where: { email } })
    if (dup) throw new HttpError(400, 'This email address is already used by another identity')

    const row = await db.emailIdentity.create({
      data: {
        label,
        email,
        purpose,
        signature: str(b.signature, 2000) || null,
        verified: Boolean(b.verified),
        active: b.active == null ? true : Boolean(b.active),
      },
    })
    await logActivity(me, 'email.identity.created', `emailIdentity:${row.id}`, { email, purpose })
    return Response.json({ ok: true, data: row })
  } catch (e) {
    return jsonError(e)
  }
}
