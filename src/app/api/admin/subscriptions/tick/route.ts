import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError, logActivity, randomToken } from '@/lib/auth'
import { addInterval } from '@/lib/interval'

// ── POST: billing tick ───────────────────────────────────────────────────────
// For every ACTIVE/TRIALING subscription whose nextBillingAt has arrived:
//   1. create the cycle invoice (recurring, SENT, due +7d)
//   2. advance nextBillingAt by one interval
//   3. cycles + 1; TRIALING → ACTIVE
// Catch-up note: one tick advances exactly one cycle, so a plan that was due
// long ago bills one cycle per run instead of flooding the ledger.

async function allocateInvoiceNumber(): Promise<string> {
  const count = await db.invoice.count()
  for (let i = 0; i < 6; i++) {
    const candidate = `INV-${String(count + 1 + i).padStart(6, '0')}`
    const clash = await db.invoice.findUnique({ where: { number: candidate }, select: { id: true } })
    if (!clash) return candidate
  }
  throw new HttpError(409, 'Could not allocate a unique invoice number')
}

export async function POST() {
  try {
    const me = await requireRole(['OWNER', 'ADMIN', 'FINANCE', 'AGENT'])
    const now = new Date()

    const due = await db.subscription.findMany({
      where: { status: { in: ['ACTIVE', 'TRIALING'] }, nextBillingAt: { lte: now } },
      orderBy: { nextBillingAt: 'asc' },
      take: 100,
      include: {
        customer: { select: { id: true, name: true, email: true, phone: true } },
      },
    })

    let billed = 0
    const createdInvoices: Array<{ id: string; number: string; subscriptionId: string; planName: string; total: number }> = []

    for (const sub of due) {
      const cycle = sub.cycles + 1
      const number = await allocateInvoiceNumber()

      const invoice = await db.invoice.create({
        data: {
          number,
          token: randomToken(16),
          subscriptionId: sub.id,
          customerId: sub.customerId,
          customerName: sub.customer?.name ?? sub.customerName,
          customerEmail: sub.customer?.email ?? null,
          customerPhone: sub.customer?.phone ?? null,
          title: `${sub.planName} — cycle ${cycle}`,
          status: 'SENT',
          currency: sub.currency,
          subtotal: sub.amount,
          total: sub.amount,
          dueDate: new Date(now.getTime() + 7 * 86400_000),
          autoRetry: sub.autoRetry,
          recurring: true,
          interval: sub.interval,
        },
        select: { id: true, number: true, total: true },
      })

      await db.subscription.update({
        where: { id: sub.id },
        data: {
          nextBillingAt: addInterval(sub.nextBillingAt ?? now, sub.interval),
          cycles: cycle,
          status: sub.status === 'TRIALING' ? 'ACTIVE' : sub.status,
        },
      })

      createdInvoices.push({
        id: invoice.id,
        number: invoice.number,
        subscriptionId: sub.id,
        planName: sub.planName,
        total: invoice.total,
      })
      billed += 1
    }

    if (billed > 0) {
      await logActivity(me, 'subscription.billing_tick', 'subscriptions', { billed, checked: due.length })
    }

    return Response.json({ ok: true, billed, checked: due.length, invoices: createdInvoices })
  } catch (err) {
    return jsonError(err)
  }
}
