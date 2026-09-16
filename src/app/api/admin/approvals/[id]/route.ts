import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError, logActivity } from '@/lib/auth'
import { FINANCE_ROLES } from '@/lib/roles'

// ── Admin: decide an approval request (Maker–Checker) ────────────────────────
// PATCH { action: 'approve' | 'reject', notes? } → { approval, refundLinked? }
// Second-person rule: the requester can NEVER decide their own request (403).

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const me = await requireRole([...FINANCE_ROLES])
    const { id } = await params
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>

    const approval = await db.approvalRequest.findUnique({ where: { id } })
    if (!approval) throw new HttpError(404, 'Approval request not found')
    if (approval.status !== 'PENDING') throw new HttpError(400, 'This request was already decided')

    // ── Maker–Checker: a second person must decide ──
    if (approval.requestedByName && approval.requestedByName === me.name) {
      throw new HttpError(403, 'Maker–Checker: a second person must decide')
    }

    const action = String(b.action ?? '')
    if (action !== 'approve' && action !== 'reject') {
      throw new HttpError(400, "action must be 'approve' or 'reject'")
    }
    const notes = typeof b.notes === 'string' && b.notes.trim() ? b.notes.trim() : null

    const updated = await db.approvalRequest.update({
      where: { id },
      data: {
        status: action === 'approve' ? 'APPROVED' : 'REJECTED',
        approvedByName: me.name,
        decidedAt: new Date(),
        notes,
      },
    })

    // Approving a REFUND request with an attached refund draft → mark the linked refund APPROVED.
    let refundLinked = false
    if (action === 'approve' && approval.type === 'REFUND') {
      try {
        const payload = JSON.parse(approval.payload || '{}') as {
          refundId?: string
          refundDraft?: { refundId?: string }
        }
        const refundId = payload.refundId ?? payload.refundDraft?.refundId
        if (refundId) {
          const res = await db.refund.updateMany({
            where: { id: refundId, status: 'PENDING' },
            data: { status: 'APPROVED', approvedByName: me.name, approvalId: approval.id },
          })
          refundLinked = res.count > 0
        }
      } catch {
        // malformed payload — approval itself still stands
      }
    }

    await logActivity(me, action === 'approve' ? 'approval.approved' : 'approval.rejected', `approval:${id}`, {
      type: approval.type,
      summary: approval.summary.slice(0, 120),
      requester: approval.requestedByName,
      ...(refundLinked ? { refundLinked: true } : {}),
    })
    return Response.json({ approval: updated, refundLinked })
  } catch (err) {
    return jsonError(err)
  }
}
