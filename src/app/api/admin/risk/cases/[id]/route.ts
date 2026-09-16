import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError, logActivity } from '@/lib/auth'
import { OPS_ROLES } from '@/lib/roles'

// ── Admin: decide a risk case ────────────────────────────────────────────────
// PATCH { action: 'clear' | 'block', notes? } → { case }
// Sets status CLEARED/BLOCKED with decidedByName = current user (second set of eyes).

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const me = await requireRole([...OPS_ROLES])
    const { id } = await params
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>

    const rc = await db.riskCase.findUnique({ where: { id } })
    if (!rc) throw new HttpError(404, 'Risk case not found')

    const action = String(b.action ?? '')
    if (action !== 'clear' && action !== 'block') {
      throw new HttpError(400, "action must be 'clear' or 'block'")
    }

    const status = action === 'clear' ? 'CLEARED' : 'BLOCKED'
    const notes = typeof b.notes === 'string' && b.notes.trim() ? b.notes.trim() : null

    const updated = await db.riskCase.update({
      where: { id },
      data: { status, notes, decidedByName: me.name, decidedAt: new Date() },
    })

    await logActivity(me, action === 'clear' ? 'risk.case_cleared' : 'risk.case_blocked', `risk-case:${id}`, {
      subjectRef: rc.subjectRef,
      score: rc.score,
      reason: rc.reason,
    })
    return Response.json({ case: updated })
  } catch (err) {
    return jsonError(err)
  }
}
