import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError, isAdminRole, logActivity } from '@/lib/auth'
import { FINANCE_ROLES } from '@/lib/roles'
import { recordEvent, timelineFor } from '@/lib/event-ledger'
import { notify } from '@/lib/notifier'

/**
 * Refund detail + lifecycle actions (maker-checker).
 * GET    → refund + approval + transaction + event timeline
 * PATCH  {action: approve | reject | process | note, note?}
 * DELETE → PENDING drafts only, admins only
 */

type RouteCtx = { params: Promise<{ id: string }> }
const WRITE_ROLES = FINANCE_ROLES
const READ_ROLES = [...FINANCE_ROLES, 'SUPPORT'] as Array<'OWNER' | 'ADMIN' | 'FINANCE' | 'SUPPORT'>

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function parseNotes(raw: string | null): Array<{ by: string; at: string; body: string }> {
  if (!raw) return []
  try {
    const arr = JSON.parse(raw) as unknown
    if (!Array.isArray(arr)) return []
    return arr.filter(
      (n): n is { by: string; at: string; body: string } =>
        !!n && typeof n === 'object' && typeof (n as { body?: unknown }).body === 'string',
    )
  } catch {
    return raw ? [{ by: 'System', at: new Date().toISOString(), body: raw }] : []
  }
}

function parseEvidence(raw: string | null): string[] {
  if (!raw) return []
  try {
    const arr = JSON.parse(raw) as unknown
    return Array.isArray(arr) ? arr.filter((e): e is string => typeof e === 'string') : []
  } catch {
    return []
  }
}

function appendNote(existing: string | null, entry: { by: string; at: string; body: string }): string {
  return JSON.stringify([...parseNotes(existing), entry])
}

// ── GET: full detail ─────────────────────────────────────────────────────────
export async function GET(_req: Request, { params }: RouteCtx) {
  try {
    await requireRole(READ_ROLES)
    const { id } = await params
    const refund = await db.refund.findUnique({
      where: { id },
      include: {
        transaction: {
          select: {
            id: true, trxId: true, mfs: true, gatewayCode: true, amount: true, fee: true, charge: true,
            status: true, senderNumber: true, senderName: true, refundAmount: true, occurredAt: true, customerId: true,
          },
        },
      },
    })
    if (!refund) throw new HttpError(404, 'Refund not found')

    const approval = refund.approvalId
      ? await db.approvalRequest.findUnique({ where: { id: refund.approvalId } })
      : null

    const timeline = refund.transactionId ? await timelineFor({ transactionId: refund.transactionId }) : []

    return Response.json({
      refund: {
        ...refund,
        evidence: parseEvidence(refund.evidence),
        notes: parseNotes(refund.notes),
      },
      approval: approval
        ? { ...approval, payloadParsed: (() => { try { return JSON.parse(approval.payload) } catch { return {} } })() }
        : null,
      timeline,
    })
  } catch (err) {
    return jsonError(err)
  }
}

// ── PATCH: approve / reject / process / note ─────────────────────────────────
export async function PATCH(req: Request, { params }: RouteCtx) {
  try {
    const me = await requireRole(WRITE_ROLES)
    const { id } = await params
    const body: unknown = await req.json().catch(() => ({}))
    const b = (body ?? {}) as Record<string, unknown>
    const action = typeof b.action === 'string' ? b.action : ''

    const refund = await db.refund.findUnique({
      where: { id },
      include: { transaction: { include: { customer: true } } },
    })
    if (!refund) throw new HttpError(404, 'Refund not found')
    const now = new Date()

    if (action === 'approve') {
      if (refund.status !== 'PENDING') throw new HttpError(400, 'Only pending refunds can be approved')
      if (refund.approvalId) {
        // Second-person rule: the requester can never approve their own refund
        const approval = await db.approvalRequest.findUnique({ where: { id: refund.approvalId } })
        const requester = approval?.requestedByName ?? refund.requestedByName
        if (requester && requester === me.name) {
          throw new HttpError(403, 'Second approval required — the person who requested this refund cannot approve it themselves')
        }
        await db.approvalRequest.update({
          where: { id: refund.approvalId },
          data: { status: 'APPROVED', approvedByName: me.name, decidedAt: now },
        })
      }
      const updated = await db.refund.update({
        where: { id },
        data: {
          status: 'APPROVED',
          approvedByName: me.name,
          decidedAt: now,
          notes: appendNote(refund.notes, { by: me.name, at: now.toISOString(), body: 'Refund approved' }),
        },
      })
      await logActivity(me, 'refund.approved', id, { amount: refund.amount, trxRef: refund.trxRef })
      return Response.json({ ok: true, refund: updated })
    }

    if (action === 'reject') {
      if (!['PENDING', 'APPROVED'].includes(refund.status)) throw new HttpError(400, 'This refund is already processed')
      const note = typeof b.note === 'string' ? b.note.trim() : ''
      if (!note) throw new HttpError(400, 'A rejection note is required')
      if (refund.approvalId) {
        await db.approvalRequest.update({
          where: { id: refund.approvalId },
          data: { status: 'REJECTED', approvedByName: me.name, decidedAt: now, notes: note.slice(0, 500) },
        })
      }
      const updated = await db.refund.update({
        where: { id },
        data: {
          status: 'REJECTED',
          approvedByName: me.name,
          decidedAt: now,
          notes: appendNote(refund.notes, { by: me.name, at: now.toISOString(), body: `Rejected: ${note}` }),
        },
      })
      await logActivity(me, 'refund.rejected', id, { note })
      return Response.json({ ok: true, refund: updated })
    }

    if (action === 'process') {
      // Maker-checker: approvals-linked refunds must be APPROVED first; plain drafts may go straight to process
      if (refund.approvalId && refund.status !== 'APPROVED') {
        throw new HttpError(400, 'This refund needs a second-person approval before it can be processed')
      }
      if (!refund.approvalId && !['PENDING', 'APPROVED'].includes(refund.status)) {
        throw new HttpError(400, 'Only pending or approved refunds can be processed')
      }
      const tx = refund.transaction
      if (!tx) throw new HttpError(400, 'The linked transaction no longer exists')
      const newRefunded = round2(tx.refundAmount + refund.amount)
      if (newRefunded > tx.amount + 0.009) {
        throw new HttpError(400, 'This transaction is already fully refunded')
      }
      const fully = newRefunded >= tx.amount - 0.009

      await db.transaction.update({
        where: { id: tx.id },
        data: { refundAmount: newRefunded, ...(fully ? { status: 'REVERSED' } : {}) },
      })
      const updated = await db.refund.update({
        where: { id },
        data: {
          status: 'PROCESSED',
          processedAt: now,
          processedByName: me.name,
          notes: appendNote(refund.notes, { by: me.name, at: now.toISOString(), body: `Refund processed (৳${refund.amount.toFixed(2)})` }),
        },
      })

      // Event ledger + customer notification (idempotent, best-effort)
      await recordEvent({
        type: 'refund.processed',
        idempotencyKey: `refund.processed:${refund.id}`,
        subjectRef: tx.id,
        payload: { refundId: refund.id, trxId: tx.trxId, amount: refund.amount, by: me.name },
        processor: async () =>
          notify({
            event: 'REFUND_PROCESSED',
            customerName: tx.customer?.name ?? undefined,
            customerEmail: tx.customer?.email ?? undefined,
            customerPhone: tx.customer?.phone ?? undefined,
            customerId: tx.customer?.id,
            customerRef: tx.customerId ?? undefined,
            amount: refund.amount,
            trxId: tx.trxId ?? undefined,
            relatedType: 'REFUND',
            relatedId: refund.id,
          }),
      }).catch(() => undefined)

      await logActivity(me, 'refund.processed', id, { amount: refund.amount, fullyRefunded: fully })
      return Response.json({ ok: true, refund: updated, fullyRefunded: fully })
    }

    if (action === 'note') {
      const note = typeof b.note === 'string' ? b.note.trim() : ''
      if (!note) throw new HttpError(400, 'Note text is required')
      const updated = await db.refund.update({
        where: { id },
        data: { notes: appendNote(refund.notes, { by: me.name, at: now.toISOString(), body: note }) },
      })
      await logActivity(me, 'refund.note', id)
      return Response.json({ ok: true, refund: updated })
    }

    throw new HttpError(400, 'Unknown action')
  } catch (err) {
    return jsonError(err)
  }
}

// ── DELETE: PENDING drafts, admins only ──────────────────────────────────────
export async function DELETE(_req: Request, { params }: RouteCtx) {
  try {
    const me = await requireRole(FINANCE_ROLES)
    if (!isAdminRole(me.role)) throw new HttpError(403, 'Only admins can delete refund drafts')
    const { id } = await params
    const refund = await db.refund.findUnique({ where: { id } })
    if (!refund) throw new HttpError(404, 'Refund not found')
    if (refund.status !== 'PENDING') throw new HttpError(400, 'Only pending refunds can be deleted')

    if (refund.approvalId) {
      await db.approvalRequest.deleteMany({ where: { id: refund.approvalId, status: 'PENDING' } })
    }
    await db.refund.delete({ where: { id } })
    await logActivity(me, 'refund.deleted', id, { trxRef: refund.trxRef, amount: refund.amount })
    return Response.json({ ok: true })
  } catch (err) {
    return jsonError(err)
  }
}
