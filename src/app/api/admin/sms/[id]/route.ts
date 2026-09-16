import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError, logActivity } from '@/lib/auth'
import { parseReceivedSms } from '@/lib/sms-parser'
import { findMatchingTarget } from '@/lib/matcher'
import { dispatchWebhook, buildCheckoutPaidPayload } from '@/lib/webhook'
import { isAdminRole } from '@/lib/roles'

async function getTolerance(): Promise<number> {
  const s = await db.setting.findUnique({ where: { key: 'paymentTolerance' } })
  const n = s ? parseFloat(s.value) : 0
  return Number.isFinite(n) && n > 0 ? n : 0
}

async function assertCanAccessSms(
  sms: { deviceId: string },
  userId: string,
  role: string
): Promise<void> {
  if (isAdminRole(role)) return
  const device = await db.device.findUnique({ where: { id: sms.deviceId }, select: { ownerId: true } })
  if (!device || device.ownerId !== userId) throw new HttpError(403, 'Not your device')
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(['ADMIN', 'AGENT'])
    const { id } = await params
    const body = await req.json().catch(() => null)
    const action = body?.action
    if (action !== 'approve' && action !== 'retry') {
      throw new HttpError(400, "action must be 'approve' or 'retry'")
    }

    const sms = await db.rawSms.findUnique({
      where: { id },
      include: { transaction: { select: { id: true, checkoutId: true } } },
    })
    if (!sms) throw new HttpError(404, 'SMS not found')
    await assertCanAccessSms(sms, user.id, user.role)

    if (action === 'approve' && sms.review !== 'AWAITING_REVIEW') {
      throw new HttpError(400, 'Only AWAITING_REVIEW SMS can be approved')
    }
    if (sms.transaction) throw new HttpError(400, 'This SMS already produced a transaction')

    // Re-parse the stored body with the current parser
    const parsed = parseReceivedSms(sms.body, sms.sender)
    if (!parsed) {
      throw new HttpError(400, 'Could not parse this SMS as a money-received message')
    }

    // Dedupe on (mfs, trxId) — same rule as the live pipeline
    if (parsed.trxId) {
      const dup = await db.transaction.findUnique({
        where: { mfs_trxId: { mfs: parsed.mfs, trxId: parsed.trxId } },
      })
      if (dup) {
        await db.rawSms.update({
          where: { id: sms.id },
          data: { processed: true, parsed: true, review: 'APPROVED', note: `Duplicate of ${dup.id}` },
        })
        await logActivity(user, 'sms.approved', `sms:${sms.id}`, { transactionId: dup.id, duplicate: true })
        return Response.json({ ok: true, transactionId: dup.id, matched: !!dup.checkoutId, note: 'Duplicate TrxID' })
      }
    }

    // Create the transaction manually (pipeline minus the raw insert — this row exists)
    const tolerance = await getTolerance()
    const match = await findMatchingTarget(parsed.amount, parsed.mfs, parsed.senderNumber, tolerance)

    const tx = await db.transaction.create({
      data: {
        mfs: parsed.mfs,
        method: parsed.method,
        bankName: parsed.bankName,
        amount: parsed.amount,
        fee: parsed.fee ?? 0,
        balance: parsed.balance,
        senderNumber: parsed.senderNumber,
        senderName: parsed.senderName,
        trxId: parsed.trxId,
        status: match ? 'PAID' : 'UNMATCHED',
        deviceId: sms.deviceId,
        rawSmsId: sms.id,
        checkoutId: match?.kind === 'checkout' ? match.id : null,
        linkId: match?.kind === 'link' ? match.id : null,
        invoiceId: match?.kind === 'invoice' ? match.id : null,
        occurredAt: sms.receivedAt,
      },
    })

    await db.rawSms.update({
      where: { id: sms.id },
      data: {
        processed: true,
        parsed: true,
        review: 'APPROVED',
        note: match ? `Approved & auto-matched ${match.kind}` : 'Approved — no open target matched',
      },
    })

    // Finalize the matched target + webhook (mirrors matcher.processIncomingSms)
    if (match?.kind === 'checkout') {
      await db.checkoutPage.update({
        where: { id: match.id },
        data: { status: 'PAID', paidAt: new Date(), paidTrxId: parsed.trxId ?? tx.id },
      })
      if (match.storeId) {
        const updated = await db.checkoutPage.findUnique({ where: { id: match.id } })
        if (updated) await dispatchWebhook(match.storeId, 'checkout.paid', buildCheckoutPaidPayload(updated))
      }
    } else if (match?.kind === 'link') {
      await db.paymentLink.update({ where: { id: match.id }, data: { usedCount: { increment: 1 } } })
    } else if (match?.kind === 'invoice') {
      await db.invoice.update({
        where: { id: match.id },
        data: { status: 'PAID', paidAt: new Date(), paidTrxId: parsed.trxId ?? tx.id },
      })
    }

    await logActivity(user, 'sms.approved', `sms:${sms.id}`, { transactionId: tx.id, matched: !!match })
    return Response.json({ ok: true, transactionId: tx.id, matched: !!match, matchedKind: match?.kind })
  } catch (err) {
    return jsonError(err)
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(['ADMIN', 'AGENT'])
    const { id } = await params
    const sms = await db.rawSms.findUnique({ where: { id }, select: { id: true, deviceId: true } })
    if (!sms) throw new HttpError(404, 'SMS not found')
    await assertCanAccessSms(sms, user.id, user.role)
    await db.rawSms.delete({ where: { id } })
    await logActivity(user, 'sms.deleted', `sms:${id}`)
    return Response.json({ ok: true })
  } catch (err) {
    return jsonError(err)
  }
}
