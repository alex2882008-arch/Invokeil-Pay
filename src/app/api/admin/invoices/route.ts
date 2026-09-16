import { db } from '@/lib/db'
import {
  requireRole, jsonError, HttpError, safeInt, randomToken, logActivity,
} from '@/lib/auth'

// ── Admin: Invoices collection ───────────────────────────────────────────────
// GET  ?page&q&status     → { invoices (incl. items), total, page, pages }
// GET  ?summary=1         → { summary: { outstanding, paidThisMonth, overdue } }
// GET  ?customers=1       → { customers: [{ id, name, phone, email }] } (last 50, datalist)
// POST { title, customerName?, customerPhone?, customerId?, items[{description,quantity,unitPrice}],
//        discount?, tax?, shipping?, dueDate?, notes?, publicNote?, send? } → { invoice } (ADMIN/AGENT)

const PAGE_SIZE = 20
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

export async function GET(req: Request) {
  try {
    await requireRole(['ADMIN', 'AGENT', 'VIEWER'])
    const url = new URL(req.url)

    // ── Aggregate summary for stat cards ──
    if (url.searchParams.get('summary') === '1') {
      const monthStart = new Date()
      monthStart.setDate(1)
      monthStart.setHours(0, 0, 0, 0)
      const [outAgg, paidAgg, overdue] = await Promise.all([
        db.invoice.aggregate({ where: { status: { in: ['SENT', 'OVERDUE'] } }, _sum: { total: true } }),
        db.invoice.aggregate({ where: { status: 'PAID', paidAt: { gte: monthStart } }, _sum: { total: true } }),
        db.invoice.count({ where: { status: 'OVERDUE' } }),
      ])
      return Response.json({
        summary: {
          outstanding: round2(outAgg._sum.total ?? 0),
          paidThisMonth: round2(paidAgg._sum.total ?? 0),
          overdue,
        },
      })
    }

    // ── Saved-customer picker for the invoice dialog (datalist) ──
    if (url.searchParams.get('customers') === '1') {
      const customers = await db.customer.findMany({
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: { id: true, name: true, phone: true, email: true },
      })
      return Response.json({ customers })
    }

    // ── List ──
    const q = url.searchParams.get('q')?.trim()
    const status = url.searchParams.get('status')
    const page = safeInt(url.searchParams.get('page'), 1)

    const where: Record<string, unknown> = {}
    if (status && status !== 'ALL' && VALID_STATUS.includes(status)) where.status = status
    if (q) {
      where.OR = [
        { number: { contains: q } },
        { title: { contains: q } },
        { customerName: { contains: q } },
        { customerPhone: { contains: q } },
      ]
    }

    const [total, invoices] = await Promise.all([
      db.invoice.count({ where }),
      db.invoice.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: { items: true },
      }),
    ])

    return Response.json({
      invoices,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    })
  } catch (err) {
    return jsonError(err)
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireRole(['ADMIN', 'AGENT'])
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || typeof body !== 'object') throw new HttpError(400, 'Invalid JSON body')

    const title = strOrNull(body.title)
    if (!title) throw new HttpError(400, 'Invoice title is required')

    const items = parseItems(body.items)
    const subtotal = round2(items.reduce((s, it) => s + it.total, 0))
    const discount = parseAmount(body.discount, 'Discount')
    const tax = parseAmount(body.tax, 'Tax')
    const shipping = parseAmount(body.shipping, 'Shipping')
    const total = round2(subtotal - discount + tax + shipping)

    let dueDate: Date | null = null
    if (typeof body.dueDate === 'string' && body.dueDate.trim()) {
      const d = new Date(body.dueDate)
      if (isNaN(d.getTime())) throw new HttpError(400, 'Invalid due date')
      dueDate = d
    }

    // ── Customer: explicit id → verify; else link (or create) by phone ──
    let customerId: string | null = null
    let customerName = strOrNull(body.customerName)
    const customerPhone = strOrNull(body.customerPhone)
    const explicitId = strOrNull(body.customerId)
    if (explicitId) {
      const exists = await db.customer.findUnique({ where: { id: explicitId }, select: { id: true } })
      if (exists) customerId = exists.id
    } else if (customerPhone) {
      const found = await db.customer.findFirst({ where: { phone: customerPhone } })
      if (found) {
        customerId = found.id
        if (!customerName) customerName = found.name
      } else if (customerName) {
        const created = await db.customer.create({
          data: { name: customerName, phone: customerPhone, insertedVia: 'MANUAL' },
        })
        customerId = created.id
      }
    }

    const send = body.send === true

    // ── Allocate INV-000001 style number (retry on unique collision) ──
    const count = await db.invoice.count()
    let number: string | null = null
    for (let i = 0; i < 6; i++) {
      const candidate = `INV-${String(count + 1 + i).padStart(6, '0')}`
      const clash = await db.invoice.findUnique({ where: { number: candidate }, select: { id: true } })
      if (!clash) {
        number = candidate
        break
      }
    }
    if (!number) throw new HttpError(409, 'Could not allocate a unique invoice number — please retry')

    const invoice = await db.invoice.create({
      data: {
        number,
        token: randomToken(16),
        title,
        status: send ? 'SENT' : 'DRAFT',
        customerId,
        customerName,
        customerPhone,
        subtotal,
        discount,
        tax,
        shipping,
        total,
        dueDate,
        notes: strOrNull(body.notes),
        publicNote: strOrNull(body.publicNote),
        items: { create: items },
      },
      include: { items: true },
    })

    await logActivity(user, send ? 'invoice.created.sent' : 'invoice.created', `invoice:${invoice.id}`, {
      number: invoice.number,
      total: invoice.total,
      status: invoice.status,
    })
    return Response.json({ invoice }, { status: 201 })
  } catch (err) {
    return jsonError(err)
  }
}
