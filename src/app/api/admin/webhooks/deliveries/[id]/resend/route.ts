import { db } from '@/lib/db'
import {
  requireRole, jsonError, HttpError, logActivity,
} from '@/lib/auth'
import { deliverToEndpoint } from '../../../_deliver'

// ── Admin: re-deliver a past webhook delivery ────────────────────────────────
// POST → resolves endpoint/store URL + secret, re-POSTs the same payload,
//        records a fresh delivery row → { delivery }

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(['ADMIN'])
    const { id } = await params
    const delivery = await db.webhookDelivery.findUnique({ where: { id } })
    if (!delivery) throw new HttpError(404, 'Delivery not found')

    // Resolve target: endpoint URL if linked, else the store's legacy webhook URL
    let url: string | null = null
    let secret: string | null = null
    if (delivery.endpointId) {
      const ep = await db.webhookEndpoint.findUnique({ where: { id: delivery.endpointId } })
      url = ep?.url ?? null
      secret = ep?.secret ?? null
    }
    if (!url) {
      const store = await db.store.findUnique({ where: { id: delivery.storeId } })
      url = store?.webhookUrl ?? null
      secret = store?.secret ?? null
    }
    if (!url || !secret) throw new HttpError(400, 'Endpoint removed — no URL to deliver to')

    const result = await deliverToEndpoint(
      delivery.storeId, delivery.endpointId, url, secret, delivery.event, delivery.payload
    )
    await logActivity(user, 'webhook.delivery_resent', `delivery:${delivery.id}`, {
      event: delivery.event, status: result.status, httpCode: result.httpCode,
    })
    return Response.json({ delivery: result })
  } catch (err) {
    return jsonError(err)
  }
}
