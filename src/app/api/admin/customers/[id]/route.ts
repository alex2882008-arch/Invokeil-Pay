import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError, logActivity } from '@/lib/auth'

type RouteCtx = { params: Promise<{ id: string }> }

function cleanText(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t === '' ? null : t
}

// ── GET: customer detail + last 20 transactions + counts ────────────────────
export async function GET(_req: Request, { params }: RouteCtx) {
  try {
    await requireRole(['ADMIN', 'AGENT', 'VIEWER'])
    const { id } = await params
    const customer = await db.customer.findUnique({
      where: { id },
      include: { _count: { select: { transactions: true } } },
    })
    if (!customer) throw new HttpError(404, 'Customer not found')

    const transactions = await db.transaction.findMany({
      where: { customerId: id },
      orderBy: { occurredAt: 'desc' },
      take: 20,
      select: { id: true, trxId: true, mfs: true, amount: true, status: true, occurredAt: true },
    })

    return Response.json({
      customer,
      transactions,
      counts: { transactions: customer._count.transactions },
    })
  } catch (err) {
    return jsonError(err)
  }
}

// ── PATCH: edit profile / suspend (reason required) / restore ───────────────
export async function PATCH(req: Request, { params }: RouteCtx) {
  try {
    const user = await requireRole(['ADMIN', 'AGENT'])
    const { id } = await params
    const existing = await db.customer.findUnique({ where: { id } })
    if (!existing) throw new HttpError(404, 'Customer not found')

    const body: unknown = await req.json().catch(() => ({}))
    const b = (body ?? {}) as Record<string, unknown>

    const data: {
      name?: string
      email?: string | null
      phone?: string | null
      notes?: string | null
      suspended?: boolean
      suspendReason?: string | null
    } = {}

    if (typeof b.name === 'string') {
      const name = b.name.trim()
      if (!name) throw new HttpError(400, 'Name is required')
      data.name = name
    }
    if ('email' in b) data.email = cleanText(b.email)
    if ('phone' in b) {
      const phone = cleanText(b.phone)
      if (phone) {
        const dup = await db.customer.findFirst({ where: { phone, id: { not: id } } })
        if (dup) throw new HttpError(409, `A customer with this phone already exists (${dup.name})`)
      }
      data.phone = phone
    }
    if ('notes' in b) data.notes = cleanText(b.notes)

    let action = 'customer.updated'
    if (typeof b.suspended === 'boolean' && b.suspended !== existing.suspended) {
      if (b.suspended) {
        const reason = cleanText(b.suspendReason)
        if (!reason) throw new HttpError(400, 'A reason is required to suspend a customer')
        data.suspended = true
        data.suspendReason = reason
        action = 'customer.suspended'
      } else {
        data.suspended = false
        data.suspendReason = null
        action = 'customer.restored'
      }
    } else if (typeof b.suspendReason === 'string' && b.suspendReason.trim() !== '') {
      // Reason update without a suspension toggle
      data.suspendReason = b.suspendReason.trim()
    }

    const customer = await db.customer.update({ where: { id }, data })
    await logActivity(user, action, `customer:${customer.id}`, {
      name: customer.name,
      fields: Object.keys(data),
    })
    return Response.json({ customer })
  } catch (err) {
    return jsonError(err)
  }
}

// ── DELETE: admin only, blocked when the customer has transactions ──────────
export async function DELETE(_req: Request, { params }: RouteCtx) {
  try {
    const user = await requireRole(['ADMIN'])
    const { id } = await params
    const existing = await db.customer.findUnique({ where: { id } })
    if (!existing) throw new HttpError(404, 'Customer not found')

    const txCount = await db.transaction.count({ where: { customerId: id } })
    if (txCount > 0) {
      throw new HttpError(409, 'Customer has transactions — suspend instead')
    }

    await db.customer.delete({ where: { id } })
    await logActivity(user, 'customer.deleted', `customer:${existing.id}`, { name: existing.name })
    return Response.json({ ok: true })
  } catch (err) {
    return jsonError(err)
  }
}
