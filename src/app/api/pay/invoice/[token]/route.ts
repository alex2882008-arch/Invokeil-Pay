import { db } from '@/lib/db'
import { jsonError } from '@/lib/auth'
import { getMergedSettings } from '@/lib/settings-defaults'

// ── Public: invoice by token (no auth — token is the capability) ────────────
// GET  → { invoice: {...incl. items}, brand: { name, supportPhone, supportEmail }, payTo: {...} }
// POST → customer "I have paid" claim: SENT/OVERDUE → AWAITING + return invoice; else 400

function shapeInvoice(inv: {
  number: string
  title: string
  status: string
  currency: string
  subtotal: number
  discount: number
  tax: number
  shipping: number
  total: number
  dueDate: Date | null
  paidAt: Date | null
  publicNote: string | null
  customerName: string | null
  createdAt: Date
  items: Array<{ description: string; quantity: number; unitPrice: number; total: number }>
}) {
  return {
    number: inv.number,
    title: inv.title,
    status: inv.status,
    currency: inv.currency,
    subtotal: inv.subtotal,
    discount: inv.discount,
    tax: inv.tax,
    shipping: inv.shipping,
    total: inv.total,
    dueDate: inv.dueDate,
    paidAt: inv.paidAt,
    publicNote: inv.publicNote,
    customerName: inv.customerName,
    createdAt: inv.createdAt,
    items: inv.items.map((it) => ({
      description: it.description,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      total: it.total,
    })),
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    const invoice = await db.invoice.findUnique({
      where: { token },
      include: { items: { orderBy: { id: 'asc' } } },
    })
    if (!invoice) return Response.json({ error: 'not_found' }, { status: 404 })

    const settings = await getMergedSettings()
    return Response.json({
      invoice: shapeInvoice(invoice),
      brand: {
        name: settings.brandName || 'Invokeil Pay',
        supportPhone: settings.supportPhone || '',
        supportEmail: settings.supportEmail || '',
      },
      payTo: {
        bkash: settings.number_bkash ?? '',
        nagad: settings.number_nagad ?? '',
        rocket: settings.number_rocket ?? '',
        upay: settings.number_upay ?? '',
        bank: settings.bank_hint ?? '',
      },
    })
  } catch (err) {
    return jsonError(err)
  }
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    const invoice = await db.invoice.findUnique({
      where: { token },
      include: { items: { orderBy: { id: 'asc' } } },
    })
    if (!invoice) return Response.json({ error: 'not_found' }, { status: 404 })

    if (invoice.status !== 'SENT' && invoice.status !== 'OVERDUE') {
      return Response.json(
        { error: 'This invoice cannot be paid right now — it may already be processing, paid or cancelled.' },
        { status: 400 }
      )
    }

    const updated = await db.invoice.update({
      where: { id: invoice.id },
      data: { status: 'AWAITING' },
      include: { items: { orderBy: { id: 'asc' } } },
    })
    return Response.json({ ok: true, invoice: shapeInvoice(updated) })
  } catch (err) {
    return jsonError(err)
  }
}
