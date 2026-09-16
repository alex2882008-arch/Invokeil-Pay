import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError, logActivity } from '@/lib/auth'

// ── Admin: flip automation enabled/disabled ──────────────────────────────────
// POST → { automation: { id, enabled } }

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const me = await requireRole(['OWNER', 'ADMIN'])
    const { id } = await params
    const existing = await db.automation.findUnique({ where: { id }, select: { id: true, name: true, enabled: true } })
    if (!existing) throw new HttpError(404, 'Automation not found')

    const automation = await db.automation.update({
      where: { id },
      data: { enabled: !existing.enabled },
      select: { id: true, name: true, enabled: true },
    })
    await logActivity(me, automation.enabled ? 'automation.enabled' : 'automation.disabled', id, {
      name: existing.name,
    })
    return Response.json({ automation })
  } catch (err) {
    return jsonError(err)
  }
}
