import { db } from '@/lib/db'
import { parseReceivedSms } from '@/lib/sms-parser'
import { dispatchWebhook, buildCheckoutPaidPayload } from '@/lib/webhook'
import { withinTolerance } from '@/lib/charges'

export interface IngestMessage {
  sender: string
  body: string
  simNumber?: string
  receivedAt?: string
}

export interface IngestResult {
  smsId: string
  parsed: boolean
  transactionId?: string
  matched?: boolean
  matchedKind?: 'checkout' | 'link' | 'invoice'
  note?: string
}

async function getTolerance(): Promise<number> {
  const s = await db.setting.findUnique({ where: { key: 'paymentTolerance' } })
  const n = s ? parseFloat(s.value) : 0
  return Number.isFinite(n) && n > 0 ? n : 0
}

/**
 * Pipeline: raw SMS → parse → Transaction → auto-match (checkout → link → invoice) → webhook.
 * Dedupes by (mfs, trxId) so the Android app can retry safely.
 */
export async function processIncomingSms(
  deviceId: string,
  msg: IngestMessage,
  source: 'APP' | 'WEB' | 'SIMULATOR' = 'APP'
): Promise<IngestResult> {
  const receivedAt = msg.receivedAt ? new Date(msg.receivedAt) : new Date()

  // 1. Always store the raw SMS (audit trail)
  const raw = await db.rawSms.create({
    data: {
      deviceId,
      simNumber: msg.simNumber ?? null,
      sender: msg.sender || 'unknown',
      body: msg.body,
      receivedAt: isNaN(receivedAt.getTime()) ? new Date() : receivedAt,
      source,
    },
  })

  // 2. Parse
  const parsed = parseReceivedSms(msg.body, msg.sender)
  if (!parsed) {
    await db.rawSms.update({
      where: { id: raw.id },
      data: { processed: true, parsed: false, review: 'ERROR', note: 'Not a money-received SMS' },
    })
    return { smsId: raw.id, parsed: false, note: 'Not a money-received SMS' }
  }

  // 3. Dedupe on (mfs, trxId) when a TrxID exists
  if (parsed.trxId) {
    const dup = await db.transaction.findUnique({
      where: { mfs_trxId: { mfs: parsed.mfs, trxId: parsed.trxId } },
    })
    if (dup) {
      await db.rawSms.update({
        where: { id: raw.id },
        data: { processed: true, parsed: true, note: `Duplicate of ${dup.id}` },
      })
      return { smsId: raw.id, parsed: true, transactionId: dup.id, matched: !!dup.checkoutId, note: 'Duplicate TrxID' }
    }
  }

  // 4. Auto-match: checkouts first, then payment links, then invoices
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
      deviceId,
      rawSmsId: raw.id,
      checkoutId: match?.kind === 'checkout' ? match.id : null,
      linkId: match?.kind === 'link' ? match.id : null,
      invoiceId: match?.kind === 'invoice' ? match.id : null,
      occurredAt: raw.receivedAt,
    },
  })

  await db.rawSms.update({
    where: { id: raw.id },
    data: { processed: true, parsed: true, note: match ? `Auto-matched ${match.kind}` : 'No open target matched' },
  })

  // 5. Finalize target + webhook
  if (match?.kind === 'checkout') {
    await db.checkoutPage.update({
      where: { id: match.id },
      data: { status: 'PAID', paidAt: new Date(), paidTrxId: parsed.trxId ?? tx.id },
    })
    if (match.storeId) {
      const updated = await db.checkoutPage.findUnique({ where: { id: match.id } })
      if (updated) {
        await dispatchWebhook(match.storeId, 'checkout.paid', buildCheckoutPaidPayload(updated))
      }
    }
  } else if (match?.kind === 'link') {
    await db.paymentLink.update({
      where: { id: match.id },
      data: { usedCount: { increment: 1 } },
    })
  } else if (match?.kind === 'invoice') {
    await db.invoice.update({
      where: { id: match.id },
      data: { status: 'PAID', paidAt: new Date(), paidTrxId: parsed.trxId ?? tx.id },
    })
  }

  return { smsId: raw.id, parsed: true, transactionId: tx.id, matched: !!match, matchedKind: match?.kind }
}

type Target =
  | { kind: 'checkout'; id: string; storeId: string | null; amount: number; mfs: string; customerPhone: string | null }
  | { kind: 'link'; id: string; amount: number; mfs: string; customerPhone: null }
  | { kind: 'invoice'; id: string; amount: number; mfs: string; customerPhone: null }

/**
 * Match rule: open target with amount within tolerance.
 * Priority: same MFS + same customer phone → same MFS → any (mfs ANY first).
 */
export async function findMatchingTarget(
  amount: number,
  mfs: string,
  senderNumber?: string,
  tolerance = 0
): Promise<Target | null> {
  const now = new Date()

  // ── Checkouts ──
  const checkouts = await db.checkoutPage.findMany({
    where: {
      status: { in: ['PENDING', 'AWAITING'] },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: { createdAt: 'asc' },
  })
  const co = checkouts.filter((c) => withinTolerance(c.amount, amount, tolerance))
  if (co.length > 0) {
    const score = (c: (typeof checkouts)[number]) => {
      let s = 0
      if (senderNumber && c.customerPhone && c.customerPhone.replace(/^\+?88/, '') === senderNumber) s += 4
      if (c.mfs === mfs) s += 2
      if (c.mfs === 'ANY') s += 1
      return s
    }
    const best = co.reduce((b, c) => (score(c) > score(b) ? c : b), co[0])
    return { kind: 'checkout', id: best.id, storeId: best.storeId, amount: best.amount, mfs: best.mfs, customerPhone: best.customerPhone }
  }

  // ── Payment links (fixed or variable-amount within bounds) ──
  const links = await db.paymentLink.findMany({
    where: {
      status: 'ACTIVE',
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: { createdAt: 'asc' },
  })
  for (const l of links) {
    if (l.usageLimit != null && l.usedCount >= l.usageLimit) continue
    const ok = l.amountType === 'FIXED'
      ? withinTolerance(l.amount, amount, tolerance)
      : amount >= (l.minAmount ?? 0)
    if (!ok) continue
    return { kind: 'link', id: l.id, amount: l.amount, mfs: l.gatewayCode ?? 'ANY', customerPhone: null }
  }

  // ── Invoices (SENT/OVERDUE, exact amount within tolerance) ──
  const invoices = await db.invoice.findMany({
    where: { status: { in: ['SENT', 'OVERDUE'] } },
    orderBy: { createdAt: 'asc' },
  })
  const inv = invoices.find((i) => withinTolerance(i.total, amount, tolerance))
  if (inv) {
    return { kind: 'invoice', id: inv.id, amount: inv.total, mfs: 'ANY', customerPhone: null }
  }

  return null
}

/** Back-compat helper for existing callers. */
export async function findMatchingCheckout(
  amount: number,
  mfs: string,
  senderNumber?: string,
  tolerance = 0
) {
  const t = await findMatchingTarget(amount, mfs, senderNumber, tolerance)
  if (t?.kind === 'checkout') {
    return db.checkoutPage.findUnique({ where: { id: t.id } })
  }
  return null
}
