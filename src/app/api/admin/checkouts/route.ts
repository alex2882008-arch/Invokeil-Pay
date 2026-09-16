import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError, safeInt, randomToken, logActivity } from '@/lib/auth'
import { SETTING_DEFAULTS } from '@/lib/settings-defaults'

const MFS_PREFIXES = new Set(['BKASH', 'NAGAD', 'ROCKET', 'UPAY', 'BANK'])

interface CustomField { name: string; label?: string; required?: boolean }

function normalizeCustomFields(input: unknown): string | null {
  if (input == null) return null
  let fields: CustomField[] = []
  if (Array.isArray(input)) {
    fields = input as CustomField[]
  } else if (typeof input === 'string' && input.trim()) {
    try { fields = JSON.parse(input) as CustomField[] } catch { return null }
  } else {
    return null
  }
  const clean = fields
    .filter((f) => f && typeof f.name === 'string' && f.name.trim())
    .map((f) => ({
      name: f.name.trim().slice(0, 40),
      label: typeof f.label === 'string' && f.label.trim() ? f.label.trim().slice(0, 60) : f.name.trim().slice(0, 40),
      required: !!f.required,
    }))
  return clean.length ? JSON.stringify(clean) : null
}

/** Link by customerId, else match by phone, else create a CHECKOUT-inserted customer. */
async function resolveCustomer(
  customerId: unknown,
  customerName: unknown,
  customerPhone: unknown
): Promise<string | null> {
  const name = typeof customerName === 'string' && customerName.trim() ? customerName.trim().slice(0, 80) : null
  const phoneRaw = typeof customerPhone === 'string' && customerPhone.trim() ? customerPhone.trim() : null
  const phone = phoneRaw ? phoneRaw.replace(/^\+?88/, '').slice(0, 20) : null

  if (typeof customerId === 'string' && customerId) {
    const found = await db.customer.findUnique({ where: { id: customerId }, select: { id: true } })
    if (found) return found.id
  }
  if (phone) {
    const existing = await db.customer.findFirst({ where: { phone }, orderBy: { createdAt: 'asc' } })
    if (existing) return existing.id
    const created = await db.customer.create({
      data: { name: name ?? `Customer ${phone.slice(-4)}`, phone, insertedVia: 'CHECKOUT' },
      select: { id: true },
    })
    return created.id
  }
  if (name) {
    const created = await db.customer.create({
      data: { name, insertedVia: 'CHECKOUT' },
      select: { id: true },
    })
    return created.id
  }
  return null
}

export async function GET(req: Request) {
  try {
    await requireRole(['ADMIN', 'AGENT', 'VIEWER'])
    const url = new URL(req.url)

    if (url.searchParams.get('summary')) {
      const startOfDay = new Date()
      startOfDay.setHours(0, 0, 0, 0)
      const [pending, awaiting, paid, today, cancelled] = await Promise.all([
        db.checkoutPage.count({ where: { status: 'PENDING' } }),
        db.checkoutPage.count({ where: { status: 'AWAITING' } }),
        db.checkoutPage.count({ where: { status: 'PAID' } }),
        db.checkoutPage.count({ where: { status: 'PAID', paidAt: { gte: startOfDay } } }),
        db.checkoutPage.count({ where: { status: 'CANCELLED' } }),
      ])
      return Response.json({ pending, awaiting, paid, today, cancelled })
    }

    const status = url.searchParams.get('status')
    const mfs = url.searchParams.get('mfs')
    const q = url.searchParams.get('q')?.trim()
    const page = safeInt(url.searchParams.get('page'), 1)
    const pageSize = 20

    const where: Record<string, unknown> = {}
    if (status && status !== 'ALL') where.status = status
    if (mfs && mfs !== 'ALL') where.mfs = mfs.toUpperCase()
    if (q) {
      where.OR = [
        { title: { contains: q } },
        { customerName: { contains: q } },
        { customerPhone: { contains: q } },
        { token: { contains: q } },
        { paidTrxId: { contains: q } },
      ]
    }

    const [total, items] = await Promise.all([
      db.checkoutPage.count({ where }),
      db.checkoutPage.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          store: { select: { id: true, name: true } },
        },
      }),
    ])
    return Response.json({ total, page, pageSize, items })
  } catch (err) {
    return jsonError(err)
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireRole(['ADMIN', 'AGENT'])
    const body = await req.json().catch(() => null)
    if (!body?.title || typeof body.title !== 'string' || !body.title.trim()) {
      throw new HttpError(400, 'Title is required')
    }
    const amount = Number(body?.amount)
    if (!Number.isFinite(amount) || amount <= 0) throw new HttpError(400, 'Valid amount is required')

    const gatewayCode =
      typeof body.gatewayCode === 'string' && body.gatewayCode && body.gatewayCode !== 'ANY'
        ? body.gatewayCode
        : null
    const mfs = gatewayCode
      ? (gatewayCode.split('_')[0]?.toUpperCase() ?? 'ANY')
      : 'ANY'

    let payTo: string[] = []
    if (typeof body.payToNumbers === 'string' && body.payToNumbers.trim()) {
      payTo = body.payToNumbers.split(',').map((n: string) => n.trim()).filter(Boolean).slice(0, 10)
    }

    // Expiry: explicit hours win; otherwise fall back to the panel setting.
    const hours = Number(body.expiresInHours)
    let expiresAt: Date | null = null
    if (Number.isFinite(hours) && hours > 0) {
      expiresAt = new Date(Date.now() + hours * 3600_000)
    } else {
      const setting = await db.setting.findUnique({ where: { key: 'checkoutExpiryHours' } })
      const def = setting ? parseFloat(setting.value) : parseFloat(SETTING_DEFAULTS.checkoutExpiryHours)
      if (Number.isFinite(def) && def > 0) expiresAt = new Date(Date.now() + def * 3600_000)
    }

    const customerId = await resolveCustomer(body.customerId, body.customerName, body.customerPhone)
    const customFields = normalizeCustomFields(body.customFields)

    const checkout = await db.checkoutPage.create({
      data: {
        token: randomToken(16),
        title: body.title.trim().slice(0, 120),
        description: typeof body.description === 'string' && body.description.trim() ? body.description.trim().slice(0, 500) : null,
        customerId,
        customerName: typeof body.customerName === 'string' && body.customerName.trim() ? body.customerName.trim().slice(0, 80) : null,
        customerPhone: typeof body.customerPhone === 'string' && body.customerPhone.trim()
          ? body.customerPhone.trim().replace(/^\+?88/, '').slice(0, 20)
          : null,
        amount,
        gatewayCode,
        mfs: MFS_PREFIXES.has(mfs) ? mfs : 'ANY',
        note: typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 300) : null,
        payToNumbers: payTo.length ? JSON.stringify(payTo) : null,
        customFields,
        successUrl: typeof body.successUrl === 'string' && body.successUrl.trim() ? body.successUrl.trim().slice(0, 300) : null,
        expiresAt,
        storeId: typeof body.storeId === 'string' && body.storeId ? body.storeId : null,
      },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        store: { select: { id: true, name: true } },
      },
    })

    await logActivity(user, 'checkout.created', `checkout:${checkout.id}`, {
      title: checkout.title,
      amount: checkout.amount,
      customerPhone: checkout.customerPhone,
    })
    return Response.json({ checkout })
  } catch (err) {
    return jsonError(err)
  }
}
