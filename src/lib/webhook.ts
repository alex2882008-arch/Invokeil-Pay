import { createHmac } from 'crypto'
import { db } from '@/lib/db'
import { ssrfGuardUrl } from '@/lib/ssrf'

export const WEBHOOK_EVENTS = [
  'checkout.paid',
  'checkout.created',
  'checkout.cancelled',
  'invoice.paid',
  'payment_link.paid',
  'transaction.matched',
  'transaction.reversed',
  'device.online',
  'test',
] as const

const MAX_ATTEMPTS = 5
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000] // 1m,5m,30m,2h

export interface DeliveryResult {
  deliveryId: string
  status: string
  httpCode: number | null
}

/** Fire event to every active endpoint of the store (+ legacy store.webhookUrl). */
export async function dispatchWebhook(
  storeId: string,
  event: string,
  data: Record<string, unknown>
): Promise<void> {
  const store = await db.store.findUnique({
    where: { id: storeId },
    include: { webhookEndpoints: true },
  })
  if (!store || !store.active) return

  const payload = JSON.stringify({ event, sentAt: new Date().toISOString(), data })

  const targets: Array<{ endpointId: string | null; url: string; secret: string }> = []
  for (const ep of store.webhookEndpoints) {
    if (!ep.active) continue
    if (ep.events !== '*' && !ep.events.split(',').map((s) => s.trim()).includes(event)) continue
    targets.push({ endpointId: ep.id, url: ep.url, secret: ep.secret })
  }
  if (targets.length === 0 && store.webhookUrl) {
    targets.push({ endpointId: null, url: store.webhookUrl, secret: store.secret })
  }

  await Promise.all(targets.map((t) => deliverOnce(storeId, t.endpointId, t.url, t.secret, event, payload)))
}

async function deliverOnce(
  storeId: string,
  endpointId: string | null,
  url: string,
  secret: string,
  event: string,
  payload: string,
  attempt = 1
): Promise<DeliveryResult> {
  const timestamp = Date.now()
  const signature = createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`)
    .digest('hex')

  let status = 'FAILED'
  let httpCode: number | null = null
  let error: string | null = null

  if (!ssrfGuardUrl(url)) {
    error = 'URL blocked (must be http(s) to a public host)'
  } else {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Invokeil-Event': event,
          'X-Invokeil-Signature': `t=${timestamp},v1=${signature}`,
          'X-Invokeil-Delivery': `${attempt}`,
        },
        body: payload,
        signal: AbortSignal.timeout(8000),
      })
      httpCode = res.status
      status = res.ok ? 'SUCCESS' : 'FAILED'
      if (!res.ok) error = `HTTP ${res.status}`
    } catch (e) {
      error = e instanceof Error ? e.message : 'Request failed'
    }
  }

  const nextRetryAt =
    status === 'FAILED' && attempt < MAX_ATTEMPTS
      ? new Date(Date.now() + (RETRY_DELAYS_MS[Math.min(attempt - 1, RETRY_DELAYS_MS.length - 1)] ?? 0))
      : null

  const delivery = await db.webhookDelivery.create({
    data: {
      storeId,
      endpointId,
      event,
      payload,
      signature: `t=${timestamp},v1=${signature}`,
      status,
      httpCode,
      error,
      attempts: attempt,
      nextRetryAt,
      responseAt: new Date(),
    },
  })

  return { deliveryId: delivery.id, status, httpCode }
}

/** Process due webhook retries (called from stats polling & explicit endpoint). */
export async function processWebhookRetries(limit = 5): Promise<number> {
  const due = await db.webhookDelivery.findMany({
    where: { status: 'FAILED', nextRetryAt: { not: null, lte: new Date() } },
    orderBy: { nextRetryAt: 'asc' },
    take: limit,
  })
  let processed = 0
  for (const d of due) {
    if (d.attempts >= MAX_ATTEMPTS) {
      await db.webhookDelivery.update({ where: { id: d.id }, data: { nextRetryAt: null } })
      continue
    }
    // Resolve the URL: endpoint URL if linked, else the store's legacy webhook URL
    let url: string | null = null
    let secret: string | null = null
    if (d.endpointId) {
      const ep = await db.webhookEndpoint.findUnique({ where: { id: d.endpointId } })
      url = ep?.url ?? null
      secret = ep?.secret ?? null
    }
    if (!url) {
      const store = await db.store.findUnique({ where: { id: d.storeId } })
      url = store?.webhookUrl ?? null
      secret = store?.secret ?? null
    }
    if (!url || !secret) {
      await db.webhookDelivery.update({ where: { id: d.id }, data: { nextRetryAt: null, error: 'Endpoint removed' } })
      continue
    }
    await deliverOnce(d.storeId, d.endpointId, url, secret, d.event, d.payload, d.attempts + 1)
    processed++
  }
  return processed
}

export function buildCheckoutPaidPayload(checkout: {
  token: string
  title: string
  amount: number
  currency?: string | null
  mfs: string
  status: string
  paidAt: Date | null
  paidTrxId: string | null
  customerName: string | null
  customerPhone: string | null
}) {
  return {
    checkout_token: checkout.token,
    title: checkout.title,
    amount: checkout.amount,
    currency: checkout.currency ?? 'BDT',
    mfs: checkout.mfs,
    status: checkout.status,
    paid_at: checkout.paidAt?.toISOString() ?? null,
    trx_id: checkout.paidTrxId,
    customer: { name: checkout.customerName, phone: checkout.customerPhone },
  }
}

export function buildInvoicePaidPayload(invoice: {
  number: string
  token: string
  title: string
  total: number
  currency: string
  status: string
  paidAt: Date | null
  paidTrxId: string | null
  customerName: string | null
  customerEmail: string | null
}) {
  return {
    invoice_number: invoice.number,
    invoice_token: invoice.token,
    title: invoice.title,
    amount: invoice.total,
    currency: invoice.currency,
    status: invoice.status,
    paid_at: invoice.paidAt?.toISOString() ?? null,
    trx_id: invoice.paidTrxId,
    customer: { name: invoice.customerName, email: invoice.customerEmail },
  }
}
