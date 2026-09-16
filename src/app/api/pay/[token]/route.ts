import { db } from '@/lib/db'
import { jsonError, HttpError } from '@/lib/auth'
import { getMergedSettings } from '@/lib/settings-defaults'
import { safeJsonParse } from '@/lib/links-server'

// ── Public checkout API (no auth — token is the capability) ──────────────────
// GET  /api/pay/[token]         → checkout + brand + payTo + gateways + faqs
//                                 (auto-expires PENDING/AWAITING past expiresAt)
// POST /api/pay/[token]         → { action: 'claim' | 'cancel', ... }
//   claim  { senderNumber, trxId?, answers? } → AWAITING (+ link/create Customer)
//   cancel {}                                 → CANCELLED (only PENDING/AWAITING)
//
// The legacy sub-route /api/pay/[token]/claim re-exports the same POST handler.

type RouteCtx = { params: Promise<{ token: string }> }

interface FieldDef {
  name: string
  label?: string
  required?: boolean
}

const MAX_ANSWER_LEN = 300
const MAX_TRX_LEN = 40

/** BD mobile guard: after stripping +88/88 and separators, must be 01XXXXXXXXX. */
function normalizeBdNumber(raw: unknown): string | null {
  const s = String(raw ?? '').trim()
  if (!s) return null
  let n = s.replace(/[^0-9+]/g, '')
  n = n.replace(/^\+?88/, '').replace(/\D/g, '')
  return /^01\d{9}$/.test(n) ? n : null
}

// ─────────────────────────────────────────────────────────────────── GET ──

export async function GET(_req: Request, ctx: RouteCtx) {
  try {
    const { token } = await ctx.params
    const checkout = await db.checkoutPage.findUnique({ where: { token } })
    if (!checkout) return Response.json({ error: 'Payment page not found' }, { status: 404 })

    // Auto-expire: persist EXPIRED for stale PENDING/AWAITING checkouts.
    let status = checkout.status
    if (
      (status === 'PENDING' || status === 'AWAITING') &&
      checkout.expiresAt &&
      checkout.expiresAt < new Date()
    ) {
      const updated = await db.checkoutPage
        .update({ where: { id: checkout.id }, data: { status: 'EXPIRED' } })
        .catch(() => null)
      status = updated?.status ?? 'EXPIRED'
    }

    const [settings, gateways, faqs] = await Promise.all([
      getMergedSettings(),
      db.gateway.findMany({ where: { enabled: true }, orderBy: { sortOrder: 'asc' } }),
      db.faqItem.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
    ])

    return Response.json({
      checkout: {
        token: checkout.token,
        title: checkout.title,
        description: checkout.description,
        amount: checkout.amount,
        currency: checkout.currency,
        status,
        mfs: checkout.mfs,
        gatewayCode: checkout.gatewayCode,
        customFields: safeJsonParse<FieldDef[] | null>(checkout.customFields, null),
        answers: safeJsonParse<Record<string, string> | null>(checkout.answers, null),
        expiresAt: checkout.expiresAt,
        paidAt: checkout.paidAt,
        paidTrxId: checkout.paidTrxId,
        customerName: checkout.customerName,
        successUrl: checkout.successUrl,
      },
      brand: {
        name: settings.brandName || 'Invokeil Pay',
        tagline: settings.brandTagline || '',
        supportPhone: settings.supportPhone || '',
        supportEmail: settings.supportEmail || '',
        supportWhatsApp: settings.supportWhatsApp || '',
        supportTelegram: settings.supportTelegram || '',
      },
      payTo: {
        bkash: settings.number_bkash || '',
        nagad: settings.number_nagad || '',
        rocket: settings.number_rocket || '',
        upay: settings.number_upay || '',
        bank_hint: settings.bank_hint || '',
        number_tap: settings.number_tap || '',
        number_telecash: settings.number_telecash || '',
        number_mcash: settings.number_mcash || '',
        number_okwallet: settings.number_okwallet || '',
      },
      gateways: gateways.map((g) => ({
        code: g.code,
        name: g.name,
        mfs: g.mfs,
        category: g.category,
        type: g.type,
        accountType: g.accountType,
        color: g.color,
        textColor: g.textColor || '#FFFFFF',
        icon: g.icon,
        accountNumber: g.accountNumber,
        instructions: g.instructions,
        minAmount: g.minAmount,
        maxAmount: g.maxAmount,
        chargeFixed: g.chargeFixed,
        chargePercent: g.chargePercent,
        discountFixed: g.discountFixed,
        discountPercent: g.discountPercent,
      })),
      faqs: faqs.map((f) => ({ question: f.question, answer: f.answer })),
    })
  } catch (err) {
    return jsonError(err)
  }
}

// ─────────────────────────────────────────────────────────────────── POST ──

interface PayActionBody {
  action?: unknown
  senderNumber?: unknown
  trxId?: unknown
  answers?: unknown
}

export async function POST(req: Request, ctx: RouteCtx) {
  try {
    const { token } = await ctx.params
    const checkout = await db.checkoutPage.findUnique({ where: { token } })
    if (!checkout) throw new HttpError(404, 'Payment page not found')

    const body = (await req.json().catch(() => null)) as PayActionBody | null
    const action = String(body?.action ?? 'claim').toLowerCase()

    if (action === 'cancel') return await handleCancel(checkout.id, checkout.status)
    return await handleClaim(checkout, body)
  } catch (err) {
    return jsonError(err)
  }
}

async function handleCancel(id: string, status: string) {
  if (status === 'PAID') throw new HttpError(400, 'This payment is already completed')
  if (status !== 'PENDING' && status !== 'AWAITING') {
    throw new HttpError(400, `This payment is ${status.toLowerCase()}`)
  }
  await db.checkoutPage.update({ where: { id }, data: { status: 'CANCELLED' } })
  return Response.json({ ok: true, status: 'CANCELLED' })
}

async function handleClaim(
  checkout: {
    id: string
    status: string
    expiresAt: Date | null
    customFields: string | null
    answers: string | null
    customerPhone: string | null
    metadata: string | null
  },
  body: PayActionBody | null
) {
  // Already done — idempotent success so the UI can jump to the paid screen.
  if (checkout.status === 'PAID') return Response.json({ ok: true, status: 'PAID' })

  if (checkout.status !== 'PENDING' && checkout.status !== 'AWAITING') {
    throw new HttpError(400, `This payment is ${checkout.status.toLowerCase()}`)
  }

  if (checkout.expiresAt && checkout.expiresAt < new Date()) {
    await db.checkoutPage
      .update({ where: { id: checkout.id }, data: { status: 'EXPIRED' } })
      .catch(() => undefined)
    throw new HttpError(400, 'This payment has expired')
  }

  // ── Sender number (required — used for SMS auto-matching) ──
  const senderNumber = normalizeBdNumber(body?.senderNumber)
  if (!senderNumber) throw new HttpError(400, 'Enter a valid 11-digit mobile number (e.g. 01712345678)')

  const trxId = String(body?.trxId ?? '').trim().slice(0, MAX_TRX_LEN) || null

  // ── Suspended customer guard ──
  const existing = await db.customer.findFirst({ where: { phone: senderNumber } })
  if (existing?.suspended) {
    return Response.json(
      { error: 'This number is blocked from paying. Contact support.' },
      { status: 403 }
    )
  }

  // ── Answers: validated against the checkout's customFields ──
  const fieldDefs = safeJsonParse<FieldDef[]>(checkout.customFields, [])
  const answersIn =
    body?.answers && typeof body.answers === 'object' && !Array.isArray(body.answers)
      ? (body.answers as Record<string, unknown>)
      : {}

  const cleanAnswers: Record<string, string> = {}
  for (const f of fieldDefs) {
    if (!f || typeof f.name !== 'string' || !f.name) continue
    const val = String(answersIn[f.name] ?? '').trim().slice(0, MAX_ANSWER_LEN)
    if (f.required && !val) throw new HttpError(400, `Missing required field: ${f.label || f.name}`)
    if (val) cleanAnswers[f.name] = val
  }
  const answersJson = fieldDefs.length > 0 ? JSON.stringify(cleanAnswers) : null

  // ── Link or create the customer (CHECKOUT-inserted) ──
  const customerId =
    existing?.id ??
    (
      await db.customer.create({
        data: {
          name: `Customer ${senderNumber.slice(-4)}`,
          phone: senderNumber,
          insertedVia: 'CHECKOUT',
        },
        select: { id: true },
      })
    ).id

  // Keep any claimed TrxID in metadata (paidTrxId stays reserved for verified payment).
  let metadata: string | null = checkout.metadata
  if (trxId) {
    const prev = safeJsonParse<Record<string, unknown>>(checkout.metadata, {})
    metadata = JSON.stringify({ ...prev, claimedTrxId: trxId, claimedSender: senderNumber })
  }

  await db.checkoutPage.update({
    where: { id: checkout.id },
    data: {
      status: 'AWAITING',
      answers: answersJson,
      customerId,
      customerPhone: senderNumber,
      metadata,
    },
  })

  // The SMS matcher picks AWAITING checkouts first, so the incoming payment
  // SMS auto-verifies this claim and flips it to PAID.
  return Response.json({ ok: true, status: 'AWAITING' })
}
