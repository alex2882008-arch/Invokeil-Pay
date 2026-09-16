import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError } from '@/lib/auth'

type RouteCtx = { params: Promise<{ id: string }> }

export type TimelineEntry = {
  type: 'transaction' | 'invoice' | 'refund' | 'dispute' | 'subscription' | 'email' | 'sms' | 'activity' | 'event'
  at: string
  title: string
  detail?: string
  amount?: number
  status?: string
  ref?: string
}

// ── GET: merged, newest-first Customer 360 timeline (cap 200) ────────────────
export async function GET(_req: Request, { params }: RouteCtx) {
  try {
    await requireRole(['OWNER', 'ADMIN', 'DEVELOPER', 'FINANCE', 'SUPPORT', 'AGENT', 'VIEWER'])
    const { id } = await params

    const customer = await db.customer.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, phone: true },
    })
    if (!customer) throw new HttpError(404, 'Customer not found')

    // Refund/Dispute rows can point either at the customer or at one of the
    // customer's transactions — resolve the transaction ids once.
    const trxIds = (
      await db.transaction.findMany({ where: { customerId: id }, select: { id: true } })
    ).map((t) => t.id)

    const [transactions, invoices, refunds, disputes, subscriptions, emails, sms, activities, events] =
      await Promise.all([
        db.transaction.findMany({
          where: { customerId: id },
          orderBy: { occurredAt: 'desc' },
          take: 100,
          select: { id: true, trxId: true, mfs: true, amount: true, status: true, occurredAt: true, senderNumber: true },
        }),
        db.invoice.findMany({
          where: { customerId: id },
          orderBy: { createdAt: 'desc' },
          take: 100,
          select: { id: true, number: true, title: true, status: true, total: true, dueDate: true, createdAt: true },
        }),
        db.refund.findMany({
          where: { OR: [{ customerRef: id }, ...(trxIds.length ? [{ transactionId: { in: trxIds } }] : [])] },
          orderBy: { createdAt: 'desc' },
          take: 50,
          select: { id: true, type: true, amount: true, reason: true, status: true, trxRef: true, createdAt: true },
        }),
        db.dispute.findMany({
          where: { OR: [{ customerRef: id }, ...(trxIds.length ? [{ transactionId: { in: trxIds } }] : [])] },
          orderBy: { createdAt: 'desc' },
          take: 50,
          select: { id: true, amount: true, reason: true, status: true, trxRef: true, createdAt: true },
        }),
        db.subscription.findMany({
          where: { customerId: id },
          orderBy: { createdAt: 'desc' },
          take: 50,
          select: { id: true, planName: true, amount: true, interval: true, status: true, cycles: true, createdAt: true },
        }),
        db.emailMessage.findMany({
          where: {
            OR: [
              { customerRef: id },
              ...(customer.email ? [{ toAddress: { contains: customer.email } }, { fromAddress: { contains: customer.email } }] : []),
            ],
          },
          orderBy: { createdAt: 'desc' },
          take: 50,
          select: { id: true, direction: true, toAddress: true, fromAddress: true, subject: true, status: true, createdAt: true },
        }),
        db.smsMessage.findMany({
          where: { customerRef: id },
          orderBy: { createdAt: 'desc' },
          take: 50,
          select: { id: true, direction: true, toNumber: true, body: true, status: true, createdAt: true },
        }),
        db.activityLog.findMany({
          where: {
            OR: [
              { target: `customer:${id}` },
              { meta: { contains: id } },
              ...(customer.phone ? [{ meta: { contains: customer.phone } }] : []),
            ],
          },
          orderBy: { createdAt: 'desc' },
          take: 50,
          select: { id: true, actorName: true, action: true, target: true, createdAt: true },
        }),
        db.eventLedger.findMany({
          where: { subjectRef: id },
          orderBy: { createdAt: 'desc' },
          take: 50,
          select: { id: true, type: true, status: true, createdAt: true },
        }),
      ])

    const entries: TimelineEntry[] = []

    for (const t of transactions) {
      entries.push({
        type: 'transaction',
        at: t.occurredAt.toISOString(),
        title: `${t.mfs} payment${t.trxId ? ` · ${t.trxId}` : ''}`,
        detail: t.senderNumber ? `From ${t.senderNumber}` : undefined,
        amount: t.amount,
        status: t.status,
        ref: t.trxId ?? t.id,
      })
    }
    for (const inv of invoices) {
      entries.push({
        type: 'invoice',
        at: inv.createdAt.toISOString(),
        title: `${inv.number} — ${inv.title}`,
        detail: inv.dueDate ? `Due ${inv.dueDate.toISOString().slice(0, 10)}` : undefined,
        amount: inv.total,
        status: inv.status,
        ref: inv.number,
      })
    }
    for (const r of refunds) {
      entries.push({
        type: 'refund',
        at: r.createdAt.toISOString(),
        title: `${r.type.toLowerCase() === 'full' ? 'Full' : 'Partial'} refund`,
        detail: r.reason ?? undefined,
        amount: r.amount,
        status: r.status,
        ref: r.trxRef ?? r.id,
      })
    }
    for (const d of disputes) {
      entries.push({
        type: 'dispute',
        at: d.createdAt.toISOString(),
        title: `Dispute — ${d.reason}`,
        amount: d.amount,
        status: d.status,
        ref: d.trxRef ?? d.id,
      })
    }
    for (const s of subscriptions) {
      entries.push({
        type: 'subscription',
        at: s.createdAt.toISOString(),
        title: `Plan: ${s.planName}`,
        detail: `${s.interval.toLowerCase()} · ${s.cycles} cycle(s)`,
        amount: s.amount,
        status: s.status,
        ref: s.id,
      })
    }
    for (const m of emails) {
      entries.push({
        type: 'email',
        at: m.createdAt.toISOString(),
        title: m.subject,
        detail: `${m.direction === 'RECEIVED' ? 'From' : 'To'} ${m.direction === 'RECEIVED' ? m.fromAddress ?? '—' : m.toAddress}`,
        status: m.status,
        ref: m.id,
      })
    }
    for (const m of sms) {
      entries.push({
        type: 'sms',
        at: m.createdAt.toISOString(),
        title: m.direction === 'RECEIVED' ? `SMS from ${m.toNumber}` : `SMS to ${m.toNumber}`,
        detail: m.body.length > 120 ? `${m.body.slice(0, 120)}…` : m.body,
        status: m.status,
        ref: m.id,
      })
    }
    for (const a of activities) {
      entries.push({
        type: 'activity',
        at: a.createdAt.toISOString(),
        title: a.action,
        detail: `by ${a.actorName}`,
        ref: a.id,
      })
    }
    for (const ev of events) {
      entries.push({
        type: 'event',
        at: ev.createdAt.toISOString(),
        title: ev.type,
        status: ev.status,
        ref: ev.id,
      })
    }

    entries.sort((a, b) => (a.at < b.at ? 1 : -1))

    return Response.json({ items: entries.slice(0, 200), total: entries.length })
  } catch (err) {
    return jsonError(err)
  }
}
