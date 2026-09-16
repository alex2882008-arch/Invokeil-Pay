import { db } from '@/lib/db'
import { HttpError } from '@/lib/auth'
import { portalTokenFor } from '@/lib/portal-token'

type RouteCtx = { params: Promise<{ token: string }> }

// ── Masking helpers (never leak full phone / trxId on public endpoints) ──────
function maskPhone(p?: string | null): string | null {
  if (!p) return null
  const digits = p.replace(/\s+/g, '')
  if (digits.length < 5) return '***'
  return `${digits.slice(0, 3)}***${digits.slice(-2)}`
}
function maskTrxId(t?: string | null): string | null {
  if (!t) return null
  if (t.length <= 4) return `***${t}`
  return `****${t.slice(-4)}`
}
function maskEmail(e?: string | null): string | null {
  if (!e) return null
  const [local, domain] = e.split('@')
  if (!domain) return '***'
  return `${local.slice(0, 2)}***@${domain}`
}

// ── GET: customer self-service portal (NO auth — token is the credential) ────
// Perf note: tokens are HMAC-derived (nothing stored), so resolution walks the
// customers table and recomputes the HMAC per row. Fine at personal-gateway
// scale; capped at 500 rows to bound worst-case latency.
export async function GET(_req: Request, { params }: RouteCtx) {
  try {
    const { token } = await params
    if (!token || token.length !== 32) throw new HttpError(404, 'Not found')

    const customers = await db.customer.findMany({
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: { id: true },
    })
    const customer = customers.find((c) => portalTokenFor(c.id) === token)
    if (!customer) throw new HttpError(404, 'Not found')

    const [profile, invoices, transactions, subscriptions] = await Promise.all([
      db.customer.findUnique({
        where: { id: customer.id },
        select: { name: true, email: true, createdAt: true },
      }),
      db.invoice.findMany({
        where: { customerId: customer.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: { id: true, number: true, title: true, status: true, total: true, currency: true, dueDate: true, token: true, createdAt: true },
      }),
      db.transaction.findMany({
        where: { customerId: customer.id },
        orderBy: { occurredAt: 'desc' },
        take: 50,
        select: { id: true, mfs: true, amount: true, status: true, occurredAt: true, senderNumber: true, trxId: true },
      }),
      db.subscription.findMany({
        where: { customerId: customer.id },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, planName: true, amount: true, currency: true, interval: true, status: true, nextBillingAt: true, trialEndsAt: true, cycles: true },
      }),
    ])

    return Response.json({
      ok: true,
      customer: {
        name: profile?.name ?? 'Customer',
        emailMasked: maskEmail(profile?.email),
        since: profile?.createdAt ?? null,
      },
      invoices: invoices.map((i) => ({
        id: i.id,
        number: i.number,
        title: i.title,
        status: i.status,
        total: i.total,
        currency: i.currency,
        dueDate: i.dueDate,
        token: i.token, // links to the existing public /invoice/[token] page
        createdAt: i.createdAt,
      })),
      transactions: transactions.map((t) => ({
        id: t.id,
        mfs: t.mfs,
        amount: t.amount,
        status: t.status,
        occurredAt: t.occurredAt,
        senderMasked: maskPhone(t.senderNumber),
        trxIdMasked: maskTrxId(t.trxId),
      })),
      subscriptions,
    })
  } catch (err) {
    if (err instanceof HttpError) {
      return Response.json({ error: err.message }, { status: err.status })
    }
    console.error('[api/portal]', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ── POST: self-service dispute on one of the customer's invoices ─────────────
export async function POST(req: Request, { params }: RouteCtx) {
  try {
    const { token } = await params
    if (!token || token.length !== 32) throw new HttpError(404, 'Not found')

    const body: unknown = await req.json().catch(() => ({}))
    const b = (body ?? {}) as Record<string, unknown>
    if (b.action !== 'dispute') throw new HttpError(400, 'Unknown action')

    const message = typeof b.message === 'string' ? b.message.trim() : ''
    if (!message) throw new HttpError(400, 'Please describe the problem')
    if (message.length > 1000) throw new HttpError(400, 'Message is too long (max 1000 chars)')

    const customers = await db.customer.findMany({
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: { id: true },
    })
    const customer = customers.find((c) => portalTokenFor(c.id) === token)
    if (!customer) throw new HttpError(404, 'Not found')

    // The invoice must belong to this customer — token-scoped.
    const invoiceId = typeof b.invoiceId === 'string' ? b.invoiceId.trim() : ''
    if (!invoiceId) throw new HttpError(400, 'invoiceId is required')
    const invoice = await db.invoice.findFirst({
      where: { id: invoiceId, customerId: customer.id },
      select: { id: true, number: true, total: true, currency: true },
    })
    if (!invoice) throw new HttpError(404, 'Invoice not found')

    const dispute = await db.dispute.create({
      data: {
        trxRef: invoice.number,
        customerRef: customer.id,
        amount: invoice.total,
        reason: message.slice(0, 500),
        status: 'OPEN',
        notes: `Self-service dispute via customer portal · currency ${invoice.currency}`,
        messages: JSON.stringify([{ by: 'customer', at: new Date().toISOString(), body: message }]),
      },
    })

    return Response.json({ ok: true, disputeId: dispute.id, status: dispute.status })
  } catch (err) {
    if (err instanceof HttpError) {
      return Response.json({ error: err.message }, { status: err.status })
    }
    console.error('[api/portal POST]', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
