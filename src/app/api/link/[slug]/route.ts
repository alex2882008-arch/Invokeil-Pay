import { db } from '@/lib/db'
import { jsonError, HttpError, randomToken } from '@/lib/auth'
import { getMergedSettings } from '@/lib/settings-defaults'
import { safeJsonParse } from '@/lib/links-server'

// ── Public payment link API (no auth — slug is the capability) ───────────────
// GET  /[slug]                    → link info + brand + pay-to numbers
// POST /[slug] { claim }          → validate & create AWAITING checkout → { ok, token }

type RouteCtx = { params: Promise<{ slug: string }> }

const MAX_ANSWER_LEN = 300

export async function GET(_req: Request, ctx: RouteCtx) {
  try {
    const { slug } = await ctx.params
    const link = await db.paymentLink.findUnique({ where: { slug } })
    if (!link) return Response.json({ error: 'not_found' }, { status: 404 })

    const settings = await getMergedSettings()

    return Response.json({
      link: {
        title: link.title,
        description: link.description,
        amountType: link.amountType,
        amount: link.amount,
        minAmount: link.minAmount,
        maxAmount: link.maxAmount,
        currency: link.currency,
        gatewayCode: link.gatewayCode,
        customFields: safeJsonParse(link.customFields, []),
        status: link.status,
        expiresAt: link.expiresAt,
        usageLimit: link.usageLimit,
        usedCount: link.usedCount,
      },
      brand: { name: settings.brandName || 'Invokeil Pay' },
      payTo: {
        bkash: settings.number_bkash || '',
        nagad: settings.number_nagad || '',
        rocket: settings.number_rocket || '',
        upay: settings.number_upay || '',
        bank: settings.bank_hint || '',
      },
    })
  } catch (err) {
    return jsonError(err)
  }
}

interface ClaimBody {
  amount?: unknown
  answers?: unknown
  senderNumber?: unknown
  trxId?: unknown
}

function cleanNumber(v: string): string | null {
  const n = v.replace(/[\s-]/g, '')
  return /^[+]?[0-9]{6,15}$/.test(n) ? n : null
}

export async function POST(req: Request, ctx: RouteCtx) {
  try {
    const { slug } = await ctx.params
    const link = await db.paymentLink.findUnique({ where: { slug } })
    if (!link) throw new HttpError(404, 'Payment link not found')

    if (link.status !== 'ACTIVE') throw new HttpError(400, 'This payment link is disabled')
    if (link.expiresAt && link.expiresAt < new Date()) throw new HttpError(400, 'This payment link has expired')
    if (link.usageLimit != null && link.usedCount >= link.usageLimit) {
      throw new HttpError(400, 'This payment link has reached its usage limit')
    }

    const body = (await req.json().catch(() => null)) as ClaimBody | null
    if (!body || typeof body !== 'object') throw new HttpError(400, 'Invalid JSON body')

    // ── Amount ──
    const amount = typeof body.amount === 'string' ? Number(body.amount) : typeof body.amount === 'number' ? body.amount : NaN
    if (!Number.isFinite(amount) || amount <= 0) throw new HttpError(400, 'Enter a valid amount')

    const claimed =
      link.amountType === 'FIXED'
        ? link.amount
        : Math.round(amount * 100) / 100

    if (link.amountType === 'FIXED') {
      if (Math.abs(claimed - amount) > 0.01) throw new HttpError(400, 'Amount does not match this link')
    } else {
      const min = link.minAmount ?? 0
      const max = link.maxAmount
      if (claimed < min) throw new HttpError(400, `Minimum amount is ${min}`)
      if (max != null && claimed > max) throw new HttpError(400, `Maximum amount is ${max}`)
    }

    // ── Sender number (required — used for auto-matching) ──
    const senderRaw = String(body.senderNumber ?? '').trim()
    if (!senderRaw) throw new HttpError(400, 'Your payment number is required')
    const senderNumber = cleanNumber(senderRaw)
    if (!senderNumber) throw new HttpError(400, 'Enter a valid mobile number')

    const trxIdRaw = String(body.trxId ?? '').trim() || null

    // ── Answers: validated against the link's customFields ──
    const fieldDefs = safeJsonParse<Array<{ name: string; label: string; required: boolean }>>(link.customFields, [])
    const answersIn = body.answers && typeof body.answers === 'object' && !Array.isArray(body.answers)
      ? (body.answers as Record<string, unknown>)
      : {}

    const cleanAnswers: Record<string, string> = {}
    for (const f of fieldDefs) {
      const val = String(answersIn[f.name] ?? '').trim().slice(0, MAX_ANSWER_LEN)
      if (f.required && !val) throw new HttpError(400, `Missing required field: ${f.label}`)
      if (val) cleanAnswers[f.name] = val
    }
    // ignore unknown keys in answersIn — only defined fields are stored

    // ── Checkout row: the SMS matcher picks AWAITING checkouts first, so the
    //    incoming payment SMS auto-verifies this claim and flips it to PAID. ──
    const checkout = await db.checkoutPage.create({
      data: {
        token: randomToken(16),
        title: `Link: ${link.title}`,
        description: link.description,
        amount: claimed,
        currency: link.currency,
        gatewayCode: link.gatewayCode,
        mfs: 'ANY',
        customFields: link.customFields,
        answers: JSON.stringify(cleanAnswers),
        customerPhone: senderNumber,
        note: trxIdRaw ? `TrxID: ${trxIdRaw}` : null,
        successUrl: link.successUrl,
        cancelUrl: link.cancelUrl,
        status: 'AWAITING',
        storeId: null,
      },
    })

    await db.paymentLink.update({
      where: { id: link.id },
      data: { usedCount: { increment: 1 } },
    })

    return Response.json({ ok: true, token: checkout.token }, { status: 201 })
  } catch (err) {
    return jsonError(err)
  }
}
