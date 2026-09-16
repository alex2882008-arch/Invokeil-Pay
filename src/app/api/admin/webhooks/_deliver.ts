import { createHmac } from 'crypto'
import { db } from '@/lib/db'
import { ssrfGuardUrl } from '@/lib/ssrf'

// ── Shared admin-side delivery runner (clone of lib/webhook deliverOnce) ────
// Used by endpoint Test and delivery Resend, which target ONE endpoint and
// must return the created delivery row (dispatchWebhook fans out silently).

const MAX_ATTEMPTS = 5
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60 * 1000, 2 * 60 * 60 * 1000] // 1m,5m,30m,2h

export async function deliverToEndpoint(
  storeId: string,
  endpointId: string | null,
  url: string,
  secret: string,
  event: string,
  payload: string,
  attempt = 1
): Promise<{ id: string; status: string; httpCode: number | null; error: string | null }> {
  const timestamp = Date.now()
  const signature = createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`)
    .digest('hex')
  const signatureHeader = `t=${timestamp},v1=${signature}`

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
          'X-Invokeil-Signature': signatureHeader,
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
      signature: signatureHeader,
      status,
      httpCode,
      error,
      attempts: attempt,
      nextRetryAt,
      responseAt: new Date(),
    },
  })

  return { id: delivery.id, status, httpCode, error }
}
