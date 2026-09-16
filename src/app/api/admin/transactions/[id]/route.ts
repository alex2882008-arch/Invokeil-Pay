import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError, logActivity } from '@/lib/auth'
import { dispatchWebhook, buildCheckoutPaidPayload } from '@/lib/webhook'

/** Load a transaction with everything the detail page needs. */
async function loadDetail(id: string) {
  return db.transaction.findUnique({
    where: { id },
    include: {
      rawSms: { select: { id: true, sender: true, body: true, receivedAt: true, simNumber: true } },
      device: { select: { id: true, name: true } },
      checkout: { select: { id: true, token: true, title: true, status: true, amount: true } },
      link: { select: { id: true, slug: true, title: true } },
      invoice: { select: { id: true, number: true, token: true, title: true } },
      customer: { select: { id: true, name: true, phone: true } },
    },
  })
}

/** AGENTs can only see/manage transactions captured by their own devices. */
async function assertAccess(
  user: { role: string; id: string },
  txId: string
) {
  const tx = await db.transaction.findUnique({
    where: { id: txId },
    select: { id: true, device: { select: { ownerId: true } } },
  })
  if (!tx) throw new HttpError(404, 'Transaction not found')
  if (user.role === 'AGENT' && tx.device?.ownerId !== user.id) {
    throw new HttpError(404, 'Transaction not found')
  }
}

// ── GET: full detail ─────────────────────────────────────────────────────────

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(['ADMIN', 'AGENT', 'VIEWER'])
    const { id } = await params
    await assertAccess(user, id)
    const transaction = await loadDetail(id)
    if (!transaction) throw new HttpError(404, 'Transaction not found')
    return Response.json({ transaction })
  } catch (err) {
    return jsonError(err)
  }
}

// ── PATCH: match / reverse / resend_ipn ──────────────────────────────────────

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(['ADMIN', 'AGENT'])
    const { id } = await params
    await assertAccess(user, id)
    const tx = await loadDetail(id)
    if (!tx) throw new HttpError(404, 'Transaction not found')

    const body = await req.json().catch(() => null)
    const action = body?.action as 'match' | 'reverse' | 'resend_ipn' | undefined
    const target = `tx:${tx.trxId ?? tx.id}`

    if (action === 'reverse') {
      const updated = await db.transaction.update({ where: { id }, data: { status: 'REVERSED' } })
      // Reopen the linked checkout if there is one
      if (tx.checkoutId) {
        await db.checkoutPage.update({
          where: { id: tx.checkoutId },
          data: { status: 'PENDING', paidAt: null, paidTrxId: null },
        }).catch(() => undefined)
      }
      await logActivity(user, 'transaction.reversed', target)
      return Response.json({ transaction: updated })
    }

    if (action === 'match') {
      const checkoutId = typeof body?.checkoutId === 'string' ? body.checkoutId : null
      if (!checkoutId) throw new HttpError(400, 'checkoutId is required')
      const checkout = await db.checkoutPage.findUnique({ where: { id: checkoutId } })
      if (!checkout) throw new HttpError(404, 'Checkout not found')
      if (checkout.status === 'PAID') throw new HttpError(409, 'Checkout already paid')

      const [updatedTx, updatedCheckout] = await Promise.all([
        db.transaction.update({ where: { id }, data: { status: 'MATCHED', checkoutId } }),
        db.checkoutPage.update({
          where: { id: checkoutId },
          data: { status: 'PAID', paidAt: new Date(), paidTrxId: tx.trxId ?? tx.id },
        }),
      ])
      if (updatedCheckout.storeId) {
        await dispatchWebhook(updatedCheckout.storeId, 'checkout.paid', buildCheckoutPaidPayload(updatedCheckout)).catch(() => undefined)
      }
      await logActivity(user, 'transaction.matched', target, { checkoutId })
      return Response.json({ transaction: updatedTx })
    }

    if (action === 'resend_ipn') {
      const checkout = tx.checkoutId
        ? await db.checkoutPage.findUnique({ where: { id: tx.checkoutId } })
        : null
      if (!checkout?.storeId) throw new HttpError(400, 'No linked checkout with a store to notify')
      await dispatchWebhook(checkout.storeId, 'checkout.paid', buildCheckoutPaidPayload(checkout))
      const updated = await db.transaction.update({ where: { id }, data: { ipnSentAt: new Date() } })
      await logActivity(user, 'transaction.ipn_resent', target)
      return Response.json({ transaction: updated })
    }

    throw new HttpError(400, 'Unknown action')
  } catch (err) {
    return jsonError(err)
  }
}

// ── DELETE: ADMIN only ───────────────────────────────────────────────────────

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(['ADMIN'])
    const { id } = await params
    const tx = await db.transaction.findUnique({ where: { id }, select: { trxId: true } })
    if (!tx) throw new HttpError(404, 'Transaction not found')
    await db.transaction.delete({ where: { id } })
    await logActivity(user, 'transaction.deleted', `tx:${tx.trxId ?? id}`)
    return Response.json({ ok: true })
  } catch (err) {
    return jsonError(err)
  }
}
