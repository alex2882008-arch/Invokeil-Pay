import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError, logActivity } from '@/lib/auth'
import { DEV_ROLES } from '@/lib/roles'
import { deliverToEndpoint } from '../../webhooks/_deliver'

// ── Developer Console: POST webhook replay ───────────────────────────────────
// Re-dispatches a stored WebhookDelivery payload to its original endpoint with
// a FRESH signature. Signing follows lib/webhook.ts deliverOnce exactly
// (HMAC-SHA256 of "<timestamp>.<raw payload>", header "t=<ts>,v1=<hex>") via
// the shared manual-delivery runner — a new delivery row is created so the
// original is preserved.

export async function POST(req: Request) {
  try {
    const user = await requireRole(DEV_ROLES)
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>

    const deliveryId = typeof b.deliveryId === 'string' ? b.deliveryId.trim() : ''
    if (!deliveryId) throw new HttpError(400, 'deliveryId is required')

    const delivery = await db.webhookDelivery.findUnique({
      where: { id: deliveryId },
      include: { store: true },
    })
    if (!delivery) throw new HttpError(404, 'Delivery not found')

    // Resolve URL + secret: linked endpoint first, else the store's legacy webhook URL
    let url: string | null = null
    let secret: string | null = null
    if (delivery.endpointId) {
      const ep = await db.webhookEndpoint.findUnique({ where: { id: delivery.endpointId } })
      url = ep?.url ?? null
      secret = ep?.secret ?? null
    }
    if (!url || !secret) {
      url = delivery.store?.webhookUrl ?? null
      secret = delivery.store?.secret ?? null
    }
    if (!url || !secret) throw new HttpError(400, 'Endpoint removed — nowhere to replay to')

    const result = await deliverToEndpoint(
      delivery.storeId,
      delivery.endpointId,
      url,
      secret,
      delivery.event,
      delivery.payload,
      delivery.attempts + 1,
    )

    await logActivity(user, 'dev.webhook.replay', delivery.event, { deliveryId, replayedAs: result.id })
    return Response.json({ ok: true, replay: result })
  } catch (err) {
    return jsonError(err)
  }
}
