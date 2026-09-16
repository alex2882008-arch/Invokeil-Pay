import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError, hashPassword, logActivity } from '@/lib/auth'
import { isAdminRole, ROLE_LIST } from '@/lib/roles'

// ── Admin: single user ───────────────────────────────────────────────────────
// PATCH  { name?, role?, active?, password? } → { user }
// DELETE → { ok }        (ADMIN; never yourself; never the last admin)

const ROLES = ROLE_LIST // full 7-role whitelist: OWNER…VIEWER

const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  active: true,
  twoFaEnabled: true,
  lastLoginAt: true,
  createdAt: true,
  _count: { select: { sessions: true, devices: true } },
} as const

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const me = await requireRole(['ADMIN'])
    const { id } = await params
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || typeof body !== 'object') throw new HttpError(400, 'Invalid JSON body')

    const user = await db.user.findUnique({ where: { id } })
    if (!user) throw new HttpError(404, 'User not found')

    const data: Record<string, unknown> = {}
    if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim()

    if (typeof body.role === 'string' && (ROLES as readonly string[]).includes(body.role)) {
      if (body.role !== user.role && user.id === me.id) {
        throw new HttpError(400, 'You cannot change your own role')
      }
      if (body.role !== 'ADMIN' && isAdminRole(user.role)) {
        // demoting an admin — ensure another active admin remains
        const others = await db.user.count({ where: { role: 'ADMIN', active: true, id: { not: user.id } } })
        if (others === 0) throw new HttpError(400, 'You cannot demote the only admin')
      }
      data.role = body.role
    }

    if (typeof body.active === 'boolean') {
      if (!body.active) {
        if (user.id === me.id) throw new HttpError(400, 'You cannot deactivate yourself')
        if (isAdminRole(user.role) && user.active) {
          const others = await db.user.count({ where: { role: 'ADMIN', active: true, id: { not: user.id } } })
          if (others === 0) throw new HttpError(400, 'You cannot deactivate the only admin')
        }
      }
      data.active = body.active
    }

    if (typeof body.password === 'string' && body.password) {
      if (body.password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters')
      data.passwordHash = hashPassword(body.password)
    }

    if (Object.keys(data).length === 0) throw new HttpError(400, 'Nothing to update')

    const updated = await db.user.update({ where: { id }, data, select: USER_SELECT })

    await logActivity(me, 'user.updated', `user:${updated.id}`, {
      email: updated.email,
      fields: Object.keys(data),
    })
    return Response.json({ user: updated })
  } catch (err) {
    return jsonError(err)
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const me = await requireRole(['ADMIN'])
    const { id } = await params

    if (id === me.id) throw new HttpError(400, 'You cannot delete your own account')

    const user = await db.user.findUnique({ where: { id } })
    if (!user) throw new HttpError(404, 'User not found')

    if (isAdminRole(user.role)) {
      const others = await db.user.count({ where: { role: 'ADMIN', active: true, id: { not: user.id } } })
      if (others === 0) throw new HttpError(400, 'You cannot delete the only admin')
    }

    // Revoke sessions first (cascade also handles it, but be explicit)
    await db.session.updateMany({ where: { userId: id }, data: { revoked: true } })
    await db.user.delete({ where: { id } })

    await logActivity(me, 'user.deleted', `user:${id}`, { email: user.email, role: user.role })
    return Response.json({ ok: true })
  } catch (err) {
    return jsonError(err)
  }
}
