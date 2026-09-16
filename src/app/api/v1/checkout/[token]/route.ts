import { db } from '@/lib/db'
import { authenticateApiKey, jsonError } from '@/lib/auth'

/**
 * Merchant API v1 — verify / inspect a payment.
 * GET /api/v1/checkout/[token]
 * Auth: Authorization: Bearer <key with scope verify_payment>
 */
export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  try {
    const auth = await authenticateApiKey(req, 'verify_payment')
    if (!auth.ok) {
      return Response.json({ error: auth.error, code: auth.code }, { status: auth.status })
    }
    const { token } = await ctx.params
    const checkout = await db.checkoutPage.findUnique({
      where: { token },
      include: { transactions: { orderBy: { occurredAt: 'desc' }, take: 1 } },
    })
    if (!checkout || (checkout.storeId && checkout.storeId !== auth.storeId)) {
      return Response.json({ error: 'Payment not found', code: 'NOT_FOUND' }, { status: 404 })
    }
    const tx = checkout.transactions[0]
    return Response.json({
      payment_id: checkout.id,
      token: checkout.token,
      status: checkout.status,
      amount: checkout.amount,
      currency: checkout.currency,
      title: checkout.title,
      customer: { name: checkout.customerName, phone: checkout.customerPhone },
      paid_at: checkout.paidAt?.toISOString() ?? null,
      trx_id: checkout.paidTrxId ?? tx?.trxId ?? null,
      mfs: checkout.mfs,
      metadata: checkout.metadata ? safeJson(checkout.metadata) : null,
    })
  } catch (err) {
    return jsonError(err)
  }
}

function safeJson(s: string): unknown {
  try { return JSON.parse(s) } catch { return null }
}
