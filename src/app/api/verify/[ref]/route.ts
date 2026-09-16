import { db } from '@/lib/db'
import { HttpError } from '@/lib/auth'
import { getMergedSettings } from '@/lib/settings-defaults'

type RouteCtx = { params: Promise<{ ref: string }> }

// ── Masking (public endpoint — never expose the full phone / trxId) ─────────
function maskPhone3(p?: string | null): string | null {
  if (!p) return null
  const digits = p.replace(/\s+/g, '')
  if (digits.length < 5) return '***'
  return `${digits.slice(0, 3)}***${digits.slice(-2)}`
}
function maskRef(t?: string | null): string | null {
  if (!t) return null
  if (t.length <= 5) return `***${t.slice(-2)}`
  return `${t.slice(0, 2)}***${t.slice(-3)}`
}

// ── GET: public receipt verification (NO auth) ───────────────────────────────
// `ref` resolves, in order: transaction trxId → invoice token → checkout token.
// Returns a minimal, masked public receipt. 404 JSON when nothing matches.
export async function GET(_req: Request, { params }: RouteCtx) {
  try {
    const { ref } = await params
    const key = decodeURIComponent(ref ?? '').trim()
    if (!key) throw new HttpError(404, 'Not found')

    const settings = await getMergedSettings()
    const fallbackBrand = settings.brandName || 'Invokeil Pay'

    // 1) Transaction by trxId (trxId is not a standalone unique key in Prisma)
    const trx = await db.transaction.findFirst({
      where: { trxId: key },
      orderBy: { occurredAt: 'desc' },
      select: {
        trxId: true, mfs: true, method: true, amount: true, status: true,
        occurredAt: true, senderNumber: true, settled: true,
      },
    })
    if (trx) {
      const paid = trx.status === 'PAID' || trx.status === 'MATCHED'
      return Response.json({
        ok: paid,
        receipt: {
          kind: 'transaction',
          status: trx.status,
          amount: trx.amount,
          currency: settings.currency ?? 'BDT',
          date: trx.occurredAt,
          brandName: fallbackBrand,
          method: trx.mfs,
          payer: maskPhone3(trx.senderNumber),
          refMasked: maskRef(trx.trxId),
          verifyUrl: `/verify/${encodeURIComponent(key)}`,
        },
      })
    }

    // 2) Invoice by public token
    const invoice = await db.invoice.findUnique({
      where: { token: key },
      select: {
        number: true, title: true, status: true, total: true, currency: true,
        dueDate: true, createdAt: true, paidAt: true, paidTrxId: true,
        customerPhone: true, customerName: true, brandId: true,
      },
    })
    if (invoice) {
      let brandName = fallbackBrand
      if (invoice.brandId) {
        const brand = await db.brand.findUnique({ where: { id: invoice.brandId }, select: { name: true } })
        if (brand?.name) brandName = brand.name
      }
      return Response.json({
        ok: invoice.status === 'PAID',
        receipt: {
          kind: 'invoice',
          status: invoice.status,
          amount: invoice.total,
          currency: invoice.currency,
          date: invoice.paidAt ?? invoice.createdAt,
          brandName,
          method: null,
          payer: maskPhone3(invoice.customerPhone) ?? (invoice.customerName ? invoice.customerName.split(' ')[0] : null),
          refMasked: maskRef(invoice.paidTrxId ?? invoice.number),
          verifyUrl: `/verify/${encodeURIComponent(key)}`,
        },
      })
    }

    // 3) Checkout by public token
    const checkout = await db.checkoutPage.findUnique({
      where: { token: key },
      select: {
        title: true, status: true, amount: true, currency: true,
        createdAt: true, customerPhone: true, customerName: true, mfs: true,
      },
    })
    if (checkout) {
      return Response.json({
        ok: checkout.status === 'PAID',
        receipt: {
          kind: 'checkout',
          status: checkout.status,
          amount: checkout.amount,
          currency: checkout.currency,
          date: checkout.createdAt,
          brandName: fallbackBrand,
          method: checkout.mfs === 'ANY' ? null : checkout.mfs,
          payer: maskPhone3(checkout.customerPhone) ?? (checkout.customerName ? checkout.customerName.split(' ')[0] : null),
          refMasked: maskRef(key),
          verifyUrl: `/verify/${encodeURIComponent(key)}`,
        },
      })
    }

    throw new HttpError(404, 'Not found')
  } catch (err) {
    if (err instanceof HttpError) {
      return Response.json({ error: err.message }, { status: err.status })
    }
    console.error('[api/verify]', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
