import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError, safeInt, logActivity } from '@/lib/auth'
import { addInterval, monthlyNormalized } from '@/lib/interval'

const INTERVALS = ['WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'] as const

const round2 = (n: number) => Math.round(n * 100) / 100

// ── GET: list {status?, q?, page} + stat counts + MRR ────────────────────────
export async function GET(req: Request) {
  try {
    await requireRole(['OWNER', 'ADMIN', 'DEVELOPER', 'FINANCE', 'SUPPORT', 'AGENT', 'VIEWER'])
    const url = new URL(req.url)

    const status = url.searchParams.get('status')
    const q = url.searchParams.get('q')?.trim()
    const page = safeInt(url.searchParams.get('page'), 1)
    const pageSize = 20

    const where: Record<string, unknown> = {}
    if (status && ['TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'COMPLETED'].includes(status)) {
      where.status = status
    }
    if (q) {
      where.OR = [
        { planName: { contains: q } },
        { customerName: { contains: q } },
      ]
    }

    const [total, items, statWhere] = await Promise.all([
      db.subscription.count({ where }),
      db.subscription.findMany({
        where,
        orderBy: [{ nextBillingAt: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          customer: { select: { id: true, name: true, phone: true, suspended: true } },
          _count: { select: { invoices: true } },
        },
      }),
      // "Live" plans = not cancelled/completed → contribute to MRR
      db.subscription.findMany({
        where: { status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] } },
        select: { amount: true, interval: true },
      }),
    ])

    const [active, trialing, pastDue, cancelled] = await Promise.all([
      db.subscription.count({ where: { status: 'ACTIVE' } }),
      db.subscription.count({ where: { status: 'TRIALING' } }),
      db.subscription.count({ where: { status: 'PAST_DUE' } }),
      db.subscription.count({ where: { status: { in: ['CANCELLED', 'COMPLETED'] } } }),
    ])

    const mrr = statWhere.reduce((sum, s) => sum + monthlyNormalized(s.amount, s.interval), 0)

    return Response.json({
      items,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / pageSize)),
      counts: { active, trialing, pastDue, cancelled },
      mrr: round2(mrr),
    })
  } catch (err) {
    return jsonError(err)
  }
}

// ── POST: create a subscription ──────────────────────────────────────────────
// trialDays > 0 → TRIALING (trialEndsAt = +N d, nextBillingAt = trialEndsAt)
// otherwise     → ACTIVE   (nextBillingAt = now + 1 interval)
export async function POST(req: Request) {
  try {
    const me = await requireRole(['OWNER', 'ADMIN', 'FINANCE', 'AGENT'])
    const body: unknown = await req.json().catch(() => ({}))
    const b = (body ?? {}) as Record<string, unknown>

    const planName = typeof b.planName === 'string' ? b.planName.trim() : ''
    if (!planName) throw new HttpError(400, 'Plan name is required')
    if (planName.length > 120) throw new HttpError(400, 'Plan name is too long')

    const amount = Number(b.amount)
    if (!Number.isFinite(amount) || amount <= 0) throw new HttpError(400, 'Amount must be a number > 0')

    const interval = typeof b.interval === 'string' ? b.interval.toUpperCase() : 'MONTHLY'
    if (!(INTERVALS as readonly string[]).includes(interval)) {
      throw new HttpError(400, `Interval must be one of: ${INTERVALS.join(', ')}`)
    }

    const trialDays = b.trialDays === undefined || b.trialDays === null || b.trialDays === '' ? 0 : Number(b.trialDays)
    if (!Number.isInteger(trialDays) || trialDays < 0 || trialDays > 365) {
      throw new HttpError(400, 'Trial days must be an integer between 0 and 365')
    }
    const maxRetries = b.maxRetries === undefined || b.maxRetries === null || b.maxRetries === '' ? 4 : Number(b.maxRetries)
    if (!Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > 20) {
      throw new HttpError(400, 'Max retries must be an integer between 0 and 20')
    }

    // Optional customer link (id wins; else free-text name)
    let customerId: string | null = null
    let customerName: string | null = typeof b.customerName === 'string' && b.customerName.trim() ? b.customerName.trim() : null
    if (typeof b.customerId === 'string' && b.customerId.trim()) {
      const customer = await db.customer.findUnique({ where: { id: b.customerId.trim() }, select: { id: true, name: true } })
      if (!customer) throw new HttpError(404, 'Customer not found')
      customerId = customer.id
      customerName = customer.name
    }

    const now = new Date()
    const trialEndsAt = trialDays > 0 ? new Date(now.getTime() + trialDays * 86400_000) : null
    const nextBillingAt = trialEndsAt ?? addInterval(now, interval)

    const sub = await db.subscription.create({
      data: {
        customerId,
        customerName,
        planName,
        amount: round2(amount),
        interval,
        status: trialDays > 0 ? 'TRIALING' : 'ACTIVE',
        brandId: typeof b.brandId === 'string' && b.brandId.trim() ? b.brandId.trim() : null,
        gatewayCode: typeof b.gatewayCode === 'string' && b.gatewayCode.trim() ? b.gatewayCode.trim() : null,
        trialDays,
        trialEndsAt,
        nextBillingAt,
        cycles: 0,
        autoRetry: b.autoRetry === undefined ? true : Boolean(b.autoRetry),
        maxRetries,
        notes: typeof b.notes === 'string' && b.notes.trim() ? b.notes.trim() : null,
      },
    })

    await logActivity(me, 'subscription.created', `subscription:${sub.id}`, {
      planName,
      amount: sub.amount,
      interval,
      customerId,
    })

    return Response.json({ ok: true, subscription: sub })
  } catch (err) {
    return jsonError(err)
  }
}
