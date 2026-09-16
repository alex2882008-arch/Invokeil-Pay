import { db } from '@/lib/db'
import { authenticateApiKey, jsonError, HttpError } from '@/lib/auth'

/**
 * Merchant API v1 — verify a payment by token (POST style, PipraPay-compatible).
 * POST /api/v1/verify-payment { token } | { pp_id: token }
 */
export async function POST(req: Request) {
  try {
    const auth = await authenticateApiKey(req, 'verify_payment')
    if (!auth.ok) {
      return Response.json({ error: auth.error, code: auth.code }, { status: auth.status })
    }
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') throw new HttpError(400, 'Body must be valid JSON')
    const token = typeof body.token === 'string' ? body.token : typeof body.pp_id === 'string' ? body.pp_id : null
    if (!token) throw new HttpError(400, "Provide 'token' (payment token)")

    const checkout = await db.checkoutPage.findUnique({ where: { token } })
    if (!checkout || (checkout.storeId && checkout.storeId !== auth.storeId)) {
      return Response.json({ error: 'Payment not found', code: 'NOT_FOUND' }, { status: 404 })
    }
    return Response.json({
      payment_id: checkout.id,
      token: checkout.token,
      status: checkout.status,
      amount: checkout.amount,
      currency: checkout.currency,
      paid_at: checkout.paidAt?.toISOString() ?? null,
      trx_id: checkout.paidTrxId,
      customer: { name: checkout.customerName, phone: checkout.customerPhone },
      metadata: checkout.metadata ? safeJson(checkout.metadata) : null,
    })
  } catch (err) {
    return jsonError(err)
  }
}

function safeJson(s: string): unknown {
  try { return JSON.parse(s) } catch { return null }
}
