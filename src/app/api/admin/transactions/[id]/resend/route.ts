import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError, logActivity } from '@/lib/auth'
import { dispatchWebhook, buildCheckoutPaidPayload } from '@/lib/webhook'

/**
 * POST /api/admin/transactions/[id]/resend
 * Re-dispatches the checkout.paid webhook for the transaction's linked checkout.
 * Returns the fresh delivery rows so the UI can show the delivery status.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(['ADMIN', 'AGENT'])
    const { id } = await params

    const tx = await db.transaction.findUnique({
      where: { id },
      select: { id: true, trxId: true, checkoutId: true, device: { select: { ownerId: true } } },
    })
    if (!tx) throw new HttpError(404, 'Transaction not found')
    if (user.role === 'AGENT' && tx.device?.ownerId !== user.id) {
      throw new HttpError(404, 'Transaction not found')
    }

    const checkout = tx.checkoutId
      ? await db.checkoutPage.findUnique({ where: { id: tx.checkoutId } })
      : null
    if (!checkout?.storeId) throw new HttpError(400, 'No linked checkout with a store to notify')

    const startedAt = new Date()
    await dispatchWebhook(checkout.storeId, 'checkout.paid', buildCheckoutPaidPayload(checkout))
    await db.transaction.update({ where: { id }, data: { ipnSentAt: new Date() } })
    await logActivity(user, 'transaction.ipn_resent', `tx:${tx.trxId ?? tx.id}`)

    const deliveries = await db.webhookDelivery.findMany({
      where: { storeId: checkout.storeId, event: 'checkout.paid', createdAt: { gte: startedAt } },
      select: { id: true, status: true, httpCode: true, error: true },
      orderBy: { createdAt: 'asc' },
    })

    return Response.json({ ok: true, dispatched: deliveries.length, deliveries })
  } catch (err) {
    return jsonError(err)
  }
}
