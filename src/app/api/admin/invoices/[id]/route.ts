import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError, logActivity } from '@/lib/auth'

// ── Admin: single Invoice ────────────────────────────────────────────────────
// PATCH  { title?, customerName?, customerPhone?, dueDate?, notes?, publicNote?,
//          discount?, tax?, shipping?, items?, status? }  → { invoice } (ADMIN/AGENT)
// DELETE → { ok: true }  (ADMIN only)

const round2 = (n: number) => Math.round(n * 100) / 100
const VALID_STATUS = ['DRAFT', 'SENT', 'AWAITING', 'PAID', 'OVERDUE', 'CANCELLED', 'REFUNDED']

function strOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

function parseAmount(v: unknown, label: string): number {
  const n = Number(v ?? 0)
  if (!Number.isFinite(n) || n < 0) throw new HttpError(400, `${label} must be a number ≥ 0`)
  return round2(n)
}

type ParsedItem = { description: string; quantity: number; unitPrice: number; total: number }

function parseItems(raw: unknown): ParsedItem[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new HttpError(400, 'At least one line item is required')
  }
  return raw.map((entry) => {
    const it = (entry ?? {}) as Record<string, unknown>
    const description = strOrNull(it.description)
    if (!description) throw new HttpError(400, 'Every item needs a description')
    const quantity = Number(it.quantity ?? 1)
    if (!Number.isFinite(quantity) || quantity <= 0) throw new HttpError(400, 'Item quantity must be greater than 0')
    const unitPrice = Number(it.unitPrice ?? 0)
    if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new HttpError(400, 'Item unit price must be 0 or more')
    return { description, quantity, unitPrice: round2(unitPrice), total: round2(quantity * unitPrice) }
  })
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(['ADMIN', 'AGENT'])
    const { id } = await params
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || typeof body !== 'object') throw new HttpError(400, 'Invalid JSON body')

    const current = await db.invoice.findUnique({ where: { id }, include: { items: true } })
    if (!current) throw new HttpError(404, 'Invoice not found')

    const data: Record<string, unknown> = {}

    if (body.title !== undefined) {
      const title = strOrNull(body.title)
      if (!title) throw new HttpError(400, 'Invoice title cannot be empty')
      data.title = title
    }
    if (body.notes !== undefined) data.notes = strOrNull(body.notes)
    if (body.publicNote !== undefined) data.publicNote = strOrNull(body.publicNote)

    if (body.dueDate !== undefined) {
      if (body.dueDate === null || body.dueDate === '') {
        data.dueDate = null
      } else {
        const d = new Date(String(body.dueDate))
        if (isNaN(d.getTime())) throw new HttpError(400, 'Invalid due date')
        data.dueDate = d
      }
    }

    if (body.discount !== undefined) data.discount = parseAmount(body.discount, 'Discount')
    if (body.tax !== undefined) data.tax = parseAmount(body.tax, 'Tax')
    if (body.shipping !== undefined) data.shipping = parseAmount(body.shipping, 'Shipping')

    // ── Customer relink when name/phone change ──
    if (body.customerName !== undefined) data.customerName = strOrNull(body.customerName)
    if (body.customerPhone !== undefined) {
      const phone = strOrNull(body.customerPhone)
      data.customerPhone = phone
      if (phone) {
        const found = await db.customer.findFirst({ where: { phone } })
        if (found) {
          data.customerId = found.id
        } else {
          const name =
            (data.customerName as string | null | undefined) ?? current.customerName ?? current.customerPhone ?? phone
          const created = await db.customer.create({ data: { name, phone, insertedVia: 'MANUAL' } })
          data.customerId = created.id
        }
      } else {
        data.customerId = null
      }
    }

    // ── Items replacement → recompute totals ──
    let items: ParsedItem[]
    if (body.items !== undefined) {
      items = parseItems(body.items)
      data.items = { deleteMany: {}, create: items }
    } else {
      items = current.items.map((it) => ({
        description: it.description,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        total: it.total,
      }))
    }
    const subtotal = round2(items.reduce((s, it) => s + it.total, 0))
    const discount = (data.discount as number | undefined) ?? current.discount
    const tax = (data.tax as number | undefined) ?? current.tax
    const shipping = (data.shipping as number | undefined) ?? current.shipping
    data.subtotal = subtotal
    data.total = round2(subtotal - discount + tax + shipping)

    // ── Status transition ──
    if (body.status !== undefined) {
      const status = String(body.status)
      if (!VALID_STATUS.includes(status)) {
        throw new HttpError(400, 'Invalid status — allowed: DRAFT, SENT, PAID, OVERDUE, CANCELLED, REFUNDED')
      }
      data.status = status
      if (status === 'PAID' && current.status !== 'PAID') data.paidAt = new Date()
      if (status !== 'PAID' && current.status === 'PAID') {
        data.paidAt = null
        data.paidTrxId = null
      }
    }

    const invoice = await db.invoice.update({ where: { id }, data, include: { items: true } })
    await logActivity(user, 'invoice.updated', `invoice:${id}`, {
      number: invoice.number,
      status: invoice.status,
      total: invoice.total,
      itemsReplaced: body.items !== undefined,
    })
    return Response.json({ invoice })
  } catch (err) {
    return jsonError(err)
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(['ADMIN'])
    const { id } = await params
    const current = await db.invoice.findUnique({ where: { id }, select: { id: true, number: true } })
    if (!current) throw new HttpError(404, 'Invoice not found')
    await db.invoice.delete({ where: { id } })
    await logActivity(user, 'invoice.deleted', `invoice:${id}`, { number: current.number })
    return Response.json({ ok: true })
  } catch (err) {
    return jsonError(err)
  }
}
