import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError, logActivity } from '@/lib/auth'
import { dispatchWebhook, buildCheckoutPaidPayload } from '@/lib/webhook'

/**
 * Bulk operations on transactions.
 * POST { ids: string[], action: 'reverse' | 'delete' | 'match', checkoutId? }
 * - reverse: mark REVERSED (linked checkouts reopen)
 * - delete:  ADMIN only, permanent
 * - match:   link every tx to checkoutId → tx PAID + checkout PAID + store webhook
 */

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as {
      ids?: unknown
      action?: unknown
      checkoutId?: unknown
    } | null

    const ids = Array.isArray(body?.ids) ? body.ids.filter((v): v is string => typeof v === 'string' && !!v) : []
    const action = body?.action
    if (ids.length === 0) throw new HttpError(400, 'ids must be a non-empty array')
    if (action !== 'reverse' && action !== 'delete' && action !== 'match') {
      throw new HttpError(400, 'Unknown action')
    }

    if (action === 'delete') {
      const user = await requireRole(['ADMIN'])
      const deleted = await db.transaction.deleteMany({ where: { id: { in: ids } } })
      await logActivity(user, 'transaction.bulk_deleted', `count:${deleted.count}`, { ids })
      return Response.json({ ok: true, action, count: deleted.count })
    }

    const user = await requireRole(['ADMIN', 'AGENT'])

    // AGENTs may only operate on transactions from their own devices
    const txs = await db.transaction.findMany({
      where: { id: { in: ids } },
      include: { device: { select: { ownerId: true } } },
    })
    const scoped =
      user.role === 'AGENT' ? txs.filter((t) => t.device?.ownerId === user.id) : txs
    if (scoped.length === 0) throw new HttpError(404, 'No matching transactions found')

    if (action === 'reverse') {
      await db.transaction.updateMany({
        where: { id: { in: scoped.map((t) => t.id) } },
        data: { status: 'REVERSED' },
      })
      // Reopen any linked checkouts
      const checkoutIds = [...new Set(scoped.map((t) => t.checkoutId).filter((v): v is string => !!v))]
      if (checkoutIds.length) {
        await db.checkoutPage.updateMany({
          where: { id: { in: checkoutIds } },
          data: { status: 'PENDING', paidAt: null, paidTrxId: null },
        }).catch(() => undefined)
      }
      await logActivity(user, 'transaction.bulk_reversed', `count:${scoped.length}`, { ids: scoped.map((t) => t.id) })
      return Response.json({ ok: true, action, count: scoped.length })
    }

    // ── match ──────────────────────────────────────────────────────
    const checkoutId = typeof body?.checkoutId === 'string' ? body.checkoutId : null
    if (!checkoutId) throw new HttpError(400, 'checkoutId is required for match')
    const checkout = await db.checkoutPage.findUnique({ where: { id: checkoutId } })
    if (!checkout) throw new HttpError(404, 'Checkout not found')
    if (checkout.status === 'PAID') throw new HttpError(409, 'Checkout already paid')

    const usable = scoped.filter((t) => t.status !== 'REVERSED')
    if (usable.length === 0) throw new HttpError(400, 'No reversible transactions to match')

    await db.transaction.updateMany({
      where: { id: { in: usable.map((t) => t.id) } },
      data: { status: 'PAID', checkoutId },
    })
    const updatedCheckout = await db.checkoutPage.update({
      where: { id: checkoutId },
      data: {
        status: 'PAID',
        paidAt: new Date(),
        paidTrxId: usable[0]?.trxId ?? usable[0]?.id ?? null,
      },
    })
    if (updatedCheckout.storeId) {
      await dispatchWebhook(updatedCheckout.storeId, 'checkout.paid', buildCheckoutPaidPayload(updatedCheckout)).catch(() => undefined)
    }
    await logActivity(user, 'transaction.bulk_matched', `checkout:${checkoutId}`, { count: usable.length })

    return Response.json({ ok: true, action, count: usable.length })
  } catch (err) {
    return jsonError(err)
  }
}
