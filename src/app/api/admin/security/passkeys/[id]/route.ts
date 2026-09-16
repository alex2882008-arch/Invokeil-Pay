import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError, logActivity } from '@/lib/auth'

// ── Security Center v2: remove a passkey (soft delete) ───────────────────────
// DELETE → { ok }   (sets active=false; own passkeys only)

const ALL_ROLES = ['OWNER', 'ADMIN', 'DEVELOPER', 'FINANCE', 'SUPPORT', 'AGENT', 'VIEWER'] as const

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const me = await requireRole([...ALL_ROLES])
    const { id } = await params

    const passkey = await db.passkey.findUnique({ where: { id } })
    if (!passkey || !passkey.active) throw new HttpError(404, 'Passkey not found')
    if (passkey.userId !== me.id) throw new HttpError(403, 'You can only remove your own passkeys')

    await db.passkey.update({ where: { id }, data: { active: false } })
    await logActivity(me, 'security.passkey_removed', `passkey:${id}`, { label: passkey.label })
    return Response.json({ ok: true })
  } catch (err) {
    return jsonError(err)
  }
}
