import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError, logActivity } from '@/lib/auth'
import { addInterval } from '@/lib/interval'

type RouteCtx = { params: Promise<{ id: string }> }

const INTERVALS = ['WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'] as const
const round2 = (n: number) => Math.round(n * 100) / 100

// ── GET: subscription detail + its cycle invoices ────────────────────────────
export async function GET(_req: Request, { params }: RouteCtx) {
  try {
    await requireRole(['OWNER', 'ADMIN', 'DEVELOPER', 'FINANCE', 'SUPPORT', 'AGENT', 'VIEWER'])
    const { id } = await params

    const subscription = await db.subscription.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, name: true, phone: true, email: true, suspended: true } },
        invoices: { orderBy: { createdAt: 'desc' }, take: 50 },
      },
    })
    if (!subscription) throw new HttpError(404, 'Subscription not found')

    return Response.json({ subscription })
  } catch (err) {
    return jsonError(err)
  }
}

// ── PATCH: edit fields, or {action:'cancel'} / {action:'reactivate'} ─────────
export async function PATCH(req: Request, { params }: RouteCtx) {
  try {
    const me = await requireRole(['OWNER', 'ADMIN', 'FINANCE', 'AGENT'])
    const { id } = await params

    const existing = await db.subscription.findUnique({ where: { id } })
    if (!existing) throw new HttpError(404, 'Subscription not found')

    const body: unknown = await req.json().catch(() => ({}))
    const b = (body ?? {}) as Record<string, unknown>
    const action = typeof b.action === 'string' ? b.action : ''

    // ── Actions ──
    if (action === 'cancel') {
      if (existing.status === 'CANCELLED') throw new HttpError(400, 'Subscription is already cancelled')
      const sub = await db.subscription.update({
        where: { id },
        data: { status: 'CANCELLED' },
      })
      await logActivity(me, 'subscription.cancelled', `subscription:${id}`, { planName: existing.planName })
      return Response.json({ ok: true, subscription: sub })
    }

    if (action === 'reactivate') {
      if (!['CANCELLED', 'PAST_DUE', 'COMPLETED'].includes(existing.status)) {
        throw new HttpError(400, 'Only cancelled, past-due or completed plans can be reactivated')
      }
      const next = addInterval(new Date(), existing.interval)
      const sub = await db.subscription.update({
        where: { id },
        data: { status: 'ACTIVE', retryCount: 0, nextBillingAt: next },
      })
      await logActivity(me, 'subscription.reactivated', `subscription:${id}`, { planName: existing.planName })
      return Response.json({ ok: true, subscription: sub })
    }

    if (action) throw new HttpError(400, `Unknown action: ${action}`)

    // ── Plain edits ──
    const data: {
      planName?: string
      amount?: number
      interval?: string
      brandId?: string | null
      gatewayCode?: string | null
      autoRetry?: boolean
      maxRetries?: number
      notes?: string | null
      customerId?: string | null
      customerName?: string | null
    } = {}

    if (typeof b.planName === 'string') {
      const name = b.planName.trim()
      if (!name) throw new HttpError(400, 'Plan name cannot be empty')
      data.planName = name
    }
    if (b.amount !== undefined) {
      const amount = Number(b.amount)
      if (!Number.isFinite(amount) || amount <= 0) throw new HttpError(400, 'Amount must be a number > 0')
      data.amount = round2(amount)
    }
    if (typeof b.interval === 'string') {
      const interval = b.interval.toUpperCase()
      if (!(INTERVALS as readonly string[]).includes(interval)) {
        throw new HttpError(400, `Interval must be one of: ${INTERVALS.join(', ')}`)
      }
      data.interval = interval
    }
    if (b.brandId !== undefined) data.brandId = typeof b.brandId === 'string' && b.brandId.trim() ? b.brandId.trim() : null
    if (b.gatewayCode !== undefined) data.gatewayCode = typeof b.gatewayCode === 'string' && b.gatewayCode.trim() ? b.gatewayCode.trim() : null
    if (b.autoRetry !== undefined) data.autoRetry = Boolean(b.autoRetry)
    if (b.maxRetries !== undefined) {
      const mr = Number(b.maxRetries)
      if (!Number.isInteger(mr) || mr < 0 || mr > 20) throw new HttpError(400, 'Max retries must be an integer between 0 and 20')
      data.maxRetries = mr
    }
    if (b.notes !== undefined) data.notes = typeof b.notes === 'string' && b.notes.trim() ? b.notes.trim() : null

    // Customer (re)attach / detach
    if (b.customerId !== undefined) {
      if (b.customerId === null || b.customerId === '') {
        data.customerId = null
      } else if (typeof b.customerId === 'string') {
        const customer = await db.customer.findUnique({ where: { id: b.customerId }, select: { id: true, name: true } })
        if (!customer) throw new HttpError(404, 'Customer not found')
        data.customerId = customer.id
        data.customerName = customer.name
      }
    } else if (typeof b.customerName === 'string') {
      data.customerName = b.customerName.trim() || null
    }

    const sub = await db.subscription.update({ where: { id }, data })
    await logActivity(me, 'subscription.updated', `subscription:${id}`, { planName: sub.planName })
    return Response.json({ ok: true, subscription: sub })
  } catch (err) {
    return jsonError(err)
  }
}

// ── DELETE: remove the plan (invoices stay) ──────────────────────────────────
export async function DELETE(_req: Request, { params }: RouteCtx) {
  try {
    const me = await requireRole(['OWNER', 'ADMIN'])
    const { id } = await params

    const existing = await db.subscription.findUnique({ where: { id } })
    if (!existing) throw new HttpError(404, 'Subscription not found')

    await db.subscription.delete({ where: { id } })
    await logActivity(me, 'subscription.deleted', `subscription:${id}`, { planName: existing.planName })

    return Response.json({ ok: true })
  } catch (err) {
    return jsonError(err)
  }
}
