import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError, safeInt, logActivity } from '@/lib/auth'

/** Trim a raw string or null-out an empty value (shared by POST + PATCH). */
function cleanText(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t === '' ? null : t
}

// ── GET: list (?page&q&suspended) or ?summary=1 ─────────────────────────────
export async function GET(req: Request) {
  try {
    await requireRole(['ADMIN', 'AGENT', 'VIEWER'])
    const url = new URL(req.url)

    if (url.searchParams.get('summary')) {
      const [total, suspended, withTx] = await Promise.all([
        db.customer.count(),
        db.customer.count({ where: { suspended: true } }),
        db.customer.count({ where: { transactions: { some: {} } } }),
      ])
      return Response.json({ total, suspended, withTx })
    }

    const q = url.searchParams.get('q')?.trim()
    const suspended = url.searchParams.get('suspended')
    const page = safeInt(url.searchParams.get('page'), 1)
    const pageSize = 20

    const where: Record<string, unknown> = {}
    if (suspended === '1') where.suspended = true
    else if (suspended === '0') where.suspended = false
    if (q) {
      where.OR = [
        { name: { contains: q } },
        { email: { contains: q } },
        { phone: { contains: q } },
      ]
    }

    const [total, customers] = await Promise.all([
      db.customer.count({ where }),
      db.customer.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { _count: { select: { transactions: true } } },
      }),
    ])

    return Response.json({
      customers,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / pageSize)),
    })
  } catch (err) {
    return jsonError(err)
  }
}

// ── POST: create customer (name required, phone unique-ish) ─────────────────
export async function POST(req: Request) {
  try {
    const user = await requireRole(['ADMIN', 'AGENT'])
    const body: unknown = await req.json().catch(() => ({}))
    const b = (body ?? {}) as Record<string, unknown>

    const name = cleanText(b.name)
    if (!name) throw new HttpError(400, 'Name is required')

    const email = cleanText(b.email)
    const phone = cleanText(b.phone)
    const notes = cleanText(b.notes)

    if (phone) {
      const dup = await db.customer.findFirst({ where: { phone }, select: { id: true, name: true } })
      if (dup) throw new HttpError(409, `A customer with this phone already exists (${dup.name})`)
    }

    const customer = await db.customer.create({ data: { name, email, phone, notes } })
    await logActivity(user, 'customer.created', `customer:${customer.id}`, { name: customer.name, phone })
    return Response.json({ customer }, { status: 201 })
  } catch (err) {
    return jsonError(err)
  }
}
