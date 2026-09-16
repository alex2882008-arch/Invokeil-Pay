import { db } from '@/lib/db'
import { jsonError, HttpError } from '@/lib/auth'
import { getMergedSettings } from '@/lib/settings-defaults'
import { safeJsonParse } from '@/lib/links-server'
import { GATEWAY_CATALOG } from '@/lib/gateways'

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

    const [settings, gateways, faqs, defaultBrand] = await Promise.all([
      getMergedSettings(),
      db.gateway.findMany({ where: { enabled: true }, orderBy: { sortOrder: 'asc' } }),
      db.faqItem.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
      db.brand.findFirst({ where: { active: true }, orderBy: { createdAt: 'asc' }, select: { logoUrl: true, name: true } }),
    ])

    const brandLogo = settings.brandLogo || defaultBrand?.logoUrl || ''

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
        logo: brandLogo,
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
      gateways: gateways.map((g) => {
        // PipraPay-exact payment flow comes from the catalog (method + QR availability).
        const seed = GATEWAY_CATALOG.find((s) => s.code === g.code)
        const method = seed?.method ?? (g.category === 'MFS'
          ? g.accountType === 'AGENT' ? 'CASH_OUT' : g.accountType === 'MERCHANT' ? 'MAKE_PAYMENT' : 'SEND_MONEY'
          : g.category === 'BANK' ? 'BANK_TRANSFER' : g.type === 'API' ? 'API_CHECKOUT' : 'MANUAL_TRANSFER')
        // Public destination for instructions: accountNumber, or the Binance UID
        // from the config vault (public field, shown on the payment page).
        let destination = g.accountNumber
        if (!destination && (g.code === 'BINANCE_PERSONAL' || g.code === 'BINANCE_PAY')) {
          try {
            const cfg = g.config ? (JSON.parse(g.config) as Record<string, unknown>) : {}
            const uid = typeof cfg.binance_uid === 'string' ? cfg.binance_uid.trim() : ''
            if (uid) destination = uid
          } catch { /* ignore */ }
        }
        return {
          code: g.code,
          name: g.name,
          displayName: g.displayName,
          mfs: g.mfs,
          category: g.category,
          type: g.type,
          accountType: g.accountType,
          color: g.color,
          textColor: g.textColor || '#FFFFFF',
          buttonColor: g.buttonColor,
          buttonText: g.buttonText,
          logoUrl: g.logoUrl,
          icon: g.icon,
          accountNumber: destination,
          instructions: g.instructions,
          qrImage: g.qrImage,
          allowPending: g.allowPending === 'DISABLED' ? 'DISABLED' : 'ENABLED',
          method,
          hasQr: seed?.hasQr ?? g.category === 'MFS',
          minAmount: g.minAmount,
          maxAmount: g.maxAmount,
          chargeFixed: g.chargeFixed,
          chargePercent: g.chargePercent,
          discountFixed: g.discountFixed,
          discountPercent: g.discountPercent,
        }
      }),
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
  gatewayCode?: unknown
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
    amount: number
    expiresAt: Date | null
    customFields: string | null
    answers: string | null
    customerPhone: string | null
    gatewayCode: string | null
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

  // ── "Allow Pending Payment? Disable" — PipraPay-exact instant verify ──
  // When the selected gateway disables pending submissions, the claim only
  // succeeds if an already-received payment SMS matches right now; otherwise
  // the submission is rejected (no pending review state).
  const gwCode = String(body?.gatewayCode ?? checkout.gatewayCode ?? '')
  if (gwCode) {
    const gw = await db.gateway.findUnique({ where: { code: gwCode }, select: { allowPending: true, mfs: true, category: true } })
    if (gw?.allowPending === 'DISABLED') {
      const now = new Date()
      const windowStart = new Date(now.getTime() - 48 * 3_600_000)
      const amount = checkout.amount
      const mfsList = ['BKASH', 'NAGAD', 'ROCKET', 'UPAY', 'TAP', 'TELECASH', 'MCASH', 'OKWALLET', 'PATHAOPAY', 'CELLFIN', 'IPAY', 'SURECASH', 'MEGHNAPAY', 'TRUSTMONEY', 'DMONEY', 'AWALLET']
      const mfsFilter = mfsList.includes(gw.mfs) ? gw.mfs : undefined
      const match = await db.transaction.findFirst({
        where: {
          status: { in: ['PAID', 'MATCHED'] },
          checkoutId: null,
          occurredAt: { gte: windowStart },
          amount: { gte: amount - 0.01, lte: amount + 0.01 },
          ...(mfsFilter ? { mfs: mfsFilter } : {}),
        },
        orderBy: { occurredAt: 'desc' },
      })
      if (!match) {
        return Response.json(
          { error: 'PENDING_DISABLED' },
          { status: 422 }
        )
      }
      // Verified instantly — attach the transaction and flip to PAID.
      await db.$transaction([
        db.checkoutPage.update({
          where: { id: checkout.id },
          data: {
            status: 'PAID',
            answers: answersJson,
            customerId,
            customerPhone: senderNumber,
            paidAt: match.occurredAt,
            paidTrxId: match.trxId,
            metadata,
          },
        }),
        db.transaction.update({ where: { id: match.id }, data: { checkoutId: checkout.id } }),
      ])
      return Response.json({ ok: true, status: 'PAID' })
    }
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
