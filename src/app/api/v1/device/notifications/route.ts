import { db } from '@/lib/db'
import { jsonError, HttpError } from '@/lib/auth'

/**
 * Device notification feed — merged recent activity for the Android app home screen.
 * Auth: `X-Device-Key` header (or JSON field deviceKey).
 * Returns the last 30 items across transactions, sent emails and sent SMS.
 */

export async function GET(req: Request) {
  try {
    const deviceKey = req.headers.get('x-device-key')
    if (!deviceKey) throw new HttpError(401, 'Missing device key')
    const device = await db.device.findUnique({ where: { deviceKey } })
    if (!device) throw new HttpError(401, 'Unknown device key')
    if (device.status === 'BLOCKED') throw new HttpError(403, 'Device is blocked')
    await db.device.update({
      where: { id: device.id },
      data: { lastSeen: new Date(), status: 'ONLINE' },
    })

    const [transactions, emails, smsList] = await Promise.all([
      db.transaction.findMany({
        orderBy: { occurredAt: 'desc' },
        take: 30,
        select: { id: true, trxId: true, mfs: true, amount: true, status: true, occurredAt: true },
      }),
      db.emailMessage.findMany({
        where: { direction: 'SENT' },
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: { id: true, toAddress: true, subject: true, status: true, createdAt: true },
      }),
      db.smsMessage.findMany({
        where: { direction: 'SENT' },
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: { id: true, toNumber: true, body: true, status: true, createdAt: true },
      }),
    ])

    type FeedItem = { kind: 'payment' | 'email' | 'sms'; title: string; detail: string; at: string; status: string }

    const payments: FeedItem[] = transactions.map((t) => ({
      kind: 'payment',
      title: t.trxId ? `Payment ${t.trxId}` : 'Payment received',
      detail: `${t.mfs} ৳${t.amount.toFixed(2)}`,
      at: t.occurredAt.toISOString(),
      status: t.status,
    }))

    const emailsFeed: FeedItem[] = emails.map((e) => ({
      kind: 'email',
      title: e.subject || '(no subject)',
      detail: `To ${e.toAddress}`,
      at: e.createdAt.toISOString(),
      status: e.status,
    }))

    const smsFeed: FeedItem[] = smsList.map((s) => ({
      kind: 'sms',
      title: `SMS to ${s.toNumber}`,
      detail: s.body.length > 80 ? `${s.body.slice(0, 80)}…` : s.body,
      at: s.createdAt.toISOString(),
      status: s.status,
    }))

    const notifications: FeedItem[] = [...payments, ...emailsFeed, ...smsFeed]
      .sort((a, b) => (a.at < b.at ? 1 : -1))
      .slice(0, 30)

    return Response.json({ ok: true, notifications })
  } catch (err) {
    return jsonError(err)
  }
}
