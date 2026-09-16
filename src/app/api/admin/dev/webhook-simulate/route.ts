import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError, logActivity } from '@/lib/auth'
import { DEV_ROLES } from '@/lib/roles'
import {
  WEBHOOK_EVENTS, dispatchWebhook, buildCheckoutPaidPayload, buildInvoicePaidPayload,
} from '@/lib/webhook'
import { deliverToEndpoint } from '../../webhooks/_deliver'

// ── Developer Console: POST webhook simulator ────────────────────────────────
// Builds a realistic sample payload per event (shapes mirror lib/webhook.ts
// builders) and dispatches it. endpointId omitted → fans out to every matching
// endpoint of the store (dispatchWebhook); endpointId given → single targeted
// delivery reusing the shared manual-delivery runner (same signing scheme).

const DEMO_TOKEN = `demo_${Date.now().toString(36)}`
const DEMO_TRX = `DEMO${Date.now().toString(36).toUpperCase().slice(-6)}`

function samplePayloadFor(event: string): Record<string, unknown> {
  const now = new Date()
  switch (event) {
    case 'checkout.paid':
    case 'checkout.created':
    case 'checkout.cancelled': {
      const status = event === 'checkout.paid' ? 'PAID' : event === 'checkout.cancelled' ? 'CANCELLED' : 'PENDING'
      return buildCheckoutPaidPayload({
        token: DEMO_TOKEN,
        title: 'Demo checkout — Premium subscription',
        amount: 1500,
        currency: 'BDT',
        mfs: 'BKASH',
        status,
        paidAt: status === 'PAID' ? now : null,
        paidTrxId: status === 'PAID' ? DEMO_TRX : null,
        customerName: 'Rahim Uddin',
        customerPhone: '01711111101',
      })
    }
    case 'invoice.paid':
      return buildInvoicePaidPayload({
        number: `INV-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}042`,
        token: DEMO_TOKEN,
        title: 'Monthly service invoice',
        total: 2500,
        currency: 'BDT',
        status: 'PAID',
        paidAt: now,
        paidTrxId: DEMO_TRX,
        customerName: 'Nusrat Jahan',
        customerEmail: 'nusrat@example.com',
      })
    case 'payment_link.paid':
      return {
        link_id: `plink_${DEMO_TOKEN.slice(5)}`,
        title: 'Supporter badge',
        amount: 500,
        currency: 'BDT',
        trx_id: DEMO_TRX,
        paid_at: now.toISOString(),
        customer: { name: 'Karim Hossain', phone: '01933333303' },
      }
    case 'transaction.matched':
      return {
        trx_id: DEMO_TRX,
        mfs: 'BKASH',
        gateway_code: 'BKASH_PERSONAL',
        amount: 750,
        currency: 'BDT',
        sender_number: '01711111101',
        sender_name: 'Rahim Uddin',
        occurred_at: now.toISOString(),
        checkout_token: DEMO_TOKEN,
      }
    case 'transaction.reversed':
      return {
        trx_id: DEMO_TRX,
        mfs: 'BKASH',
        amount: 750,
        currency: 'BDT',
        reason: 'customer_refund',
        reversed_at: now.toISOString(),
      }
    case 'device.online':
      return {
        device_id: 'dev_demo01',
        name: 'Counter SIM 1',
        mfs: 'BKASH',
        battery: 92,
        signal: 'good',
        online_at: now.toISOString(),
      }
    case 'test':
    default:
      return {
        message: 'Test event from the Invokeil Pay developer console',
        sent_at: now.toISOString(),
      }
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireRole(DEV_ROLES)
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>

    const event = typeof b.event === 'string' ? b.event.trim() : ''
    if (!event) throw new HttpError(400, 'event is required')
    if (!(WEBHOOK_EVENTS as readonly string[]).includes(event)) {
      throw new HttpError(400, `Unknown event. Valid: ${WEBHOOK_EVENTS.join(', ')}`)
    }

    const storeId = typeof b.storeId === 'string' ? b.storeId.trim() : ''
    if (!storeId) throw new HttpError(400, 'storeId is required')
    const store = await db.store.findUnique({
      where: { id: storeId },
      include: { webhookEndpoints: true },
    })
    if (!store) throw new HttpError(404, 'Store not found')

    let data: Record<string, unknown>
    if (b.payload !== undefined && b.payload !== null && b.payload !== '') {
      if (typeof b.payload === 'string') {
        try {
          data = JSON.parse(b.payload) as Record<string, unknown>
        } catch {
          throw new HttpError(400, 'Custom payload is not valid JSON')
        }
      } else if (typeof b.payload === 'object') {
        data = b.payload as Record<string, unknown>
      } else {
        throw new HttpError(400, 'Custom payload must be a JSON object')
      }
    } else {
      data = samplePayloadFor(event)
    }

    const payloadString = JSON.stringify({ event, sentAt: new Date().toISOString(), data })

    // Targeted single-endpoint delivery (reuses the shared manual-delivery runner)
    const endpointId = typeof b.endpointId === 'string' && b.endpointId !== '' ? b.endpointId : null
    if (endpointId) {
      const ep = store.webhookEndpoints.find((e) => e.id === endpointId)
      if (!ep) throw new HttpError(400, 'Endpoint does not belong to this store')
      const result = await deliverToEndpoint(storeId, ep.id, ep.url, ep.secret, event, payloadString)
      await logActivity(user, 'dev.webhook.simulate', event, { storeId, endpointId })
      return Response.json({ ok: true, targets: 1, results: [result], payload: JSON.parse(payloadString) })
    }

    // Fan-out to every matching endpoint (lib/webhook handles matching + legacy URL)
    const startedAt = new Date(Date.now() - 1500)
    await dispatchWebhook(storeId, event, data)
    const created = await db.webhookDelivery.findMany({
      where: { storeId, event, createdAt: { gte: startedAt } },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, status: true, httpCode: true, error: true },
    })

    await logActivity(user, 'dev.webhook.simulate', event, { storeId, targets: created.length })
    return Response.json({
      ok: true,
      targets: created.length,
      results: created.map((d) => ({ deliveryId: d.id, status: d.status, httpCode: d.httpCode, error: d.error })),
      payload: JSON.parse(payloadString),
    })
  } catch (err) {
    return jsonError(err)
  }
}
