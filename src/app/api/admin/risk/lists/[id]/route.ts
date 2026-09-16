import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError, logActivity } from '@/lib/auth'

// ── Admin: delete a list entry ───────────────────────────────────────────────
// DELETE → { ok }

const RISK_WRITE_ROLES = ['OWNER', 'ADMIN'] as const

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const me = await requireRole([...RISK_WRITE_ROLES])
    const { id } = await params

    const entry = await db.listEntry.findUnique({ where: { id } })
    if (!entry) throw new HttpError(404, 'List entry not found')

    await db.listEntry.delete({ where: { id } })
    await logActivity(me, 'risk.list_entry_removed', `list-entry:${id}`, {
      list: entry.list,
      type: entry.type,
      value: entry.value,
    })
    return Response.json({ ok: true })
  } catch (err) {
    return jsonError(err)
  }
}
