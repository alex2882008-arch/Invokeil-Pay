import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError, logActivity } from '@/lib/auth'
import { dispatchWebhook, buildCheckoutPaidPayload } from '@/lib/webhook'

function normalizeCustomFields(input: unknown): string | null | undefined {
  if (input === undefined) return undefined
  if (input === null) return null
  if (!Array.isArray(input)) return undefined
  const clean = (input as Array<{ name?: unknown; label?: unknown; required?: unknown }>)
    .filter((f) => f && typeof f.name === 'string' && f.name.trim())
    .map((f) => ({
      name: (f.name as string).trim().slice(0, 40),
      label: typeof f.label === 'string' && f.label.trim() ? f.label.trim().slice(0, 60) : (f.name as string).trim().slice(0, 40),
      required: !!f.required,
    }))
  return clean.length ? JSON.stringify(clean) : null
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(['ADMIN', 'AGENT'])
    const { id } = await params
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') throw new HttpError(400, 'Invalid body')

    const checkout = await db.checkoutPage.findUnique({ where: { id } })
    if (!checkout) throw new HttpError(404, 'Checkout not found')

    const data: Record<string, unknown> = {}
    const actions: string[] = []

    // `action` is the canonical form; legacy booleans (markPaid/cancel/extend)
    // are still accepted for API compatibility.
    const action = typeof body.action === 'string' ? body.action : null

    // ── markPaid: PAID + webhook to the owning store ──
    if (action === 'markPaid' || body.markPaid === true) {
      if (checkout.status === 'PAID') throw new HttpError(400, 'Checkout is already paid')
      data.status = 'PAID'
      data.paidAt = new Date()
      const manualTrx = typeof body.paidTrxId === 'string' && body.paidTrxId.trim()
        ? body.paidTrxId.trim().slice(0, 60)
        : 'MANUAL'
      data.paidTrxId = manualTrx
      actions.push('markPaid')
    }

    // ── cancel ──
    if (action === 'cancel' || body.cancel === true || body.status === 'CANCELLED') {
      if (checkout.status === 'PAID') throw new HttpError(400, 'A paid checkout cannot be cancelled')
      data.status = 'CANCELLED'
      actions.push('cancel')
    }

    // ── reopen (PENDING resets payment stamp) ──
    if (body.status === 'PENDING') {
      data.status = 'PENDING'
      data.paidAt = null
      data.paidTrxId = null
      actions.push('reopen')
    }

    // ── extend expiry by N hours (default 24) ──
    if (action === 'extend' || body.extend === true || (body.extendHours != null && body.extendHours !== '') || body.hours != null) {
      const hours = Number(body.hours ?? body.extendHours ?? 24)
      if (!Number.isFinite(hours) || hours <= 0) throw new HttpError(400, 'hours must be a positive number')
      const base = checkout.expiresAt && checkout.expiresAt > new Date() ? checkout.expiresAt : new Date()
      data.expiresAt = new Date(base.getTime() + hours * 3600_000)
      if (checkout.status === 'EXPIRED') data.status = 'PENDING'
      actions.push(`extend:${hours}h`)
    }

    // ── field edits ──
    if (typeof body.title === 'string' && body.title.trim()) { data.title = body.title.trim().slice(0, 120); actions.push('title') }
    if (typeof body.description === 'string') { data.description = body.description.trim().slice(0, 500) || null; actions.push('description') }
    if (typeof body.note === 'string') { data.note = body.note.trim().slice(0, 300) || null; actions.push('note') }
    if (typeof body.successUrl === 'string') {
      const u = body.successUrl.trim()
      if (u && !/^https?:\/\//i.test(u)) throw new HttpError(400, 'successUrl must start with http(s)://')
      data.successUrl = u || null
      actions.push('successUrl')
    }
    const cf = normalizeCustomFields(body.customFields)
    if (cf !== undefined) { data.customFields = cf; actions.push('customFields') }

    const updated = await db.checkoutPage.update({
      where: { id },
      data,
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        store: { select: { id: true, name: true } },
      },
    })

    // Fire webhook for store-owned checkouts that were just marked paid
    if (actions.includes('markPaid') && updated.storeId) {
      await dispatchWebhook(updated.storeId, 'checkout.paid', buildCheckoutPaidPayload(updated))
    }
    if (actions.length > 0) {
      await logActivity(user, 'checkout.updated', `checkout:${id}`, { actions })
    }
    return Response.json({ checkout: updated })
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
    const checkout = await db.checkoutPage.findUnique({ where: { id }, select: { title: true } })
    if (!checkout) throw new HttpError(404, 'Checkout not found')
    await db.checkoutPage.delete({ where: { id } })
    await logActivity(user, 'checkout.deleted', `checkout:${id}`, { title: checkout.title })
    return Response.json({ ok: true })
  } catch (err) {
    return jsonError(err)
  }
}
