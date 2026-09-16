import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError, logActivity } from '@/lib/auth'
import { notify } from '@/lib/notifier'

// ── POST: dunning step for a failed/succeeded payment retry ──────────────────
// Body: { subscriptionId, failed?: boolean }
//   failed=true   → retryCount+1, status PAST_DUE; retryCount >= maxRetries →
//                   CANCELLED + PAYMENT_FAILED notification event
//   failed=false  → payment recovered: retryCount=0, status ACTIVE
// (Called by invoice payment-fail / payment-success paths later.)

export async function POST(req: Request) {
  try {
    const me = await requireRole(['OWNER', 'ADMIN', 'FINANCE', 'AGENT'])

    const body: unknown = await req.json().catch(() => ({}))
    const b = (body ?? {}) as Record<string, unknown>

    const subscriptionId = typeof b.subscriptionId === 'string' ? b.subscriptionId.trim() : ''
    if (!subscriptionId) throw new HttpError(400, 'subscriptionId is required')
    const failed = Boolean(b.failed)

    const sub = await db.subscription.findUnique({
      where: { id: subscriptionId },
      include: { customer: { select: { id: true, name: true, email: true, phone: true } } },
    })
    if (!sub) throw new HttpError(404, 'Subscription not found')

    if (sub.status === 'CANCELLED') throw new HttpError(400, 'Subscription is already cancelled')

    if (!failed) {
      // Payment recovered
      const updated = await db.subscription.update({
        where: { id: sub.id },
        data: { retryCount: 0, status: 'ACTIVE' },
      })
      await logActivity(me, 'subscription.dunning_recovered', `subscription:${sub.id}`, { planName: sub.planName })
      return Response.json({ ok: true, subscription: updated, cancelled: false })
    }

    // Payment failed — record the retry
    const retryCount = sub.retryCount + 1
    const exhausted = retryCount >= sub.maxRetries

    const updated = await db.subscription.update({
      where: { id: sub.id },
      data: {
        retryCount,
        status: exhausted ? 'CANCELLED' : 'PAST_DUE',
      },
    })

    if (exhausted) {
      await notify({
        event: 'PAYMENT_FAILED',
        customerName: sub.customer?.name ?? sub.customerName ?? 'Customer',
        customerEmail: sub.customer?.email ?? undefined,
        customerPhone: sub.customer?.phone ?? undefined,
        customerId: sub.customerId ?? undefined,
        customerRef: sub.customerId ?? undefined,
        amount: sub.amount,
        currency: sub.currency,
        planName: sub.planName,
        relatedType: 'subscription',
        relatedId: sub.id,
        idempotencyKey: `dunning-cancel:${sub.id}:${retryCount}`,
      })
    }

    await logActivity(me, exhausted ? 'subscription.dunning_cancelled' : 'subscription.dunning_retry', `subscription:${sub.id}`, {
      planName: sub.planName,
      retryCount,
      maxRetries: sub.maxRetries,
    })

    return Response.json({ ok: true, subscription: updated, cancelled: exhausted, retryCount })
  } catch (err) {
    return jsonError(err)
  }
}
