import { db } from '@/lib/db'
import {
  authenticateApiKey, jsonError, randomToken, isDomainAllowed, logActivity, safeInt,
} from '@/lib/auth'
import { dispatchWebhook } from '@/lib/webhook'
import { getMergedSettings } from '@/lib/settings-defaults'

function bad(status: number, code: string, message: string) {
  return Response.json({ error: message, code }, { status })
}

/**
 * Merchant API v1 — create a payment (hosted checkout).
 * POST /api/v1/checkout
 * Auth: Authorization: Bearer <store master key or scoped ApiKey with scope create_payment>
 */
export async function POST(req: Request) {
  try {
    const auth = await authenticateApiKey(req, 'create_payment')
    if (!auth.ok) return bad(auth.status, auth.code, auth.error)

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') return bad(400, 'INVALID_JSON_PAYLOAD', 'Body must be valid JSON')

    const amount = Number(body.amount)
    if (!Number.isFinite(amount) || amount <= 0) return bad(400, 'MISSING_FIELD', "'amount' must be a positive number")
    if (amount > 10_000_000) return bad(400, 'INVALID_AMOUNT', 'amount exceeds the maximum allowed')

    const customerName = typeof body.customer_name === 'string' ? body.customer_name.trim().slice(0, 120) : undefined
    const customerEmail = typeof body.customer_email === 'string' ? body.customer_email.trim().slice(0, 160) : undefined
    const customerMobile = typeof body.customer_mobile === 'string' ? body.customer_mobile.trim().slice(0, 20) : undefined
    if (!customerName && !customerMobile) {
      return bad(400, 'MISSING_FIELD', "Provide at least 'customer_name' or 'customer_mobile'")
    }
    const emailOk = customerEmail ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail) : true
    if (!emailOk) return bad(400, 'INVALID_EMAIL', 'customer_email is not a valid email')

    const redirectUrl = typeof body.redirect_url === 'string' ? body.redirect_url : undefined
    const cancelUrl = typeof body.cancel_url === 'string' ? body.cancel_url : undefined
    const webhookUrl = typeof body.webhook_url === 'string' ? body.webhook_url : undefined
    for (const [label, url] of [['redirect_url', redirectUrl], ['cancel_url', cancelUrl], ['webhook_url', webhookUrl]] as const) {
      if (url !== undefined && !/^https?:\/\//i.test(url)) return bad(400, 'INVALID_URL', `${label} must be an http(s) URL`)
    }

    // Domain whitelist enforcement (store-level)
    const store = await db.store.findUnique({ where: { id: auth.storeId } })
    if (!store) return bad(401, 'INVALID_API_KEY', 'Store not found for this key')
    for (const [label, url] of [['redirect_url', redirectUrl], ['cancel_url', cancelUrl], ['webhook_url', webhookUrl]] as const) {
      if (url && !isDomainAllowed(url, store.domainWhitelist)) {
        return bad(400, 'DOMAIN_NOT_WHITELISTED', `${label} host is not whitelisted for this store`)
      }
    }

    const metadata = body.metadata
    if (metadata !== undefined && metadata !== null && typeof metadata !== 'object') {
      return bad(400, 'INVALID_METADATA', 'metadata must be a JSON object')
    }

    // Suspended-customer blocking (PipraPay behavior)
    if (customerMobile) {
      const existing = await db.customer.findFirst({ where: { phone: customerMobile } })
      if (existing?.suspended) {
        return bad(403, 'CUSTOMER_SUSPENDED', `Customer is suspended: ${existing.suspendReason ?? 'contact support'}`)
      }
    }

    const settings = await getMergedSettings()
    const expiryHours = safeInt(settings.checkoutExpiryHours ?? '24', 24)

    const token = randomToken(16)
    const expiresAt = new Date(Date.now() + expiryHours * 3600_000)

    const checkout = await db.checkoutPage.create({
      data: {
        token,
        title: (typeof body.title === 'string' && body.title.trim()) ? body.title.trim().slice(0, 160) : `Payment from ${customerName ?? customerMobile}`,
        description: typeof body.description === 'string' ? body.description.slice(0, 500) : null,
        customerName: customerName ?? null,
        customerPhone: customerMobile ?? null,
        amount: Math.round(amount * 100) / 100,
        currency: typeof body.currency === 'string' && body.currency.trim() ? body.currency.trim().slice(0, 8) : (settings.currency ?? 'BDT'),
        mfs: 'ANY',
        status: 'PENDING',
        expiresAt,
        storeId: auth.storeId,
        successUrl: redirectUrl ?? null,
        cancelUrl: cancelUrl ?? null,
        metadata: metadata ? JSON.stringify(metadata) : null,
      },
    })

    // Link/create customer record
    if (customerMobile || customerEmail) {
      const found = customerMobile
        ? await db.customer.findFirst({ where: { phone: customerMobile } })
        : await db.customer.findFirst({ where: { email: customerEmail! } })
      if (found) {
        await db.checkoutPage.update({ where: { id: checkout.id }, data: { customerId: found.id } })
      } else {
        const created = await db.customer.create({
          data: {
            name: customerName ?? customerMobile ?? 'API customer',
            email: customerEmail ?? null,
            phone: customerMobile ?? null,
            insertedVia: 'API',
          },
        })
        await db.checkoutPage.update({ where: { id: checkout.id }, data: { customerId: created.id } })
      }
    }

    await logActivity(null, 'api.checkout.created', `checkout:${token}`, { storeId: auth.storeId })

    return Response.json({
      payment_id: checkout.id,
      token,
      checkout_url: `/pay/${token}`,
      status: 'PENDING',
      amount: checkout.amount,
      currency: checkout.currency,
      expires_at: expiresAt.toISOString(),
    }, { status: 201 })
  } catch (err) {
    return jsonError(err)
  }
}
