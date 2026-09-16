import { db } from '@/lib/db'
import {
  getSessionUser, jsonError, HttpError, logActivity,
  hashPassword, verifyPassword,
} from '@/lib/auth'

/**
 * Profile management — the signed-in user edits their own account.
 * PATCH  { name?, email? }          → update profile
 * POST   { currentPassword, newPassword } → change password (re-auth required)
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export async function PATCH(req: Request) {
  try {
    const session = await getSessionUser()
    if (!session) throw new HttpError(401, 'Not signed in')

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const data: Record<string, string> = {}

    if (typeof body.name === 'string') {
      const name = body.name.trim()
      if (name.length < 2 || name.length > 80) throw new HttpError(400, 'Name must be 2–80 characters')
      data.name = name
    }

    if (typeof body.email === 'string') {
      const email = body.email.trim().toLowerCase()
      if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Enter a valid email address')
      if (email !== session.email) {
        const clash = await db.user.findUnique({ where: { email }, select: { id: true } })
        if (clash) throw new HttpError(409, 'This email is already in use')
      }
      data.email = email
    }

    const keys = Object.keys(data)
    if (keys.length === 0) throw new HttpError(400, 'Nothing to update')

    const user = await db.user.update({ where: { id: session.id }, data })
    await logActivity(session, 'profile.updated', `user:${user.email}`, { fields: keys })
    return Response.json({
      user: {
        id: user.id, name: user.name, email: user.email,
        role: user.role, twoFaEnabled: user.twoFaEnabled,
        lastLoginAt: user.lastLoginAt, createdAt: user.createdAt,
      },
    })
  } catch (err) {
    return jsonError(err)
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSessionUser()
    if (!session) throw new HttpError(401, 'Not signed in')

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const currentPassword = String(body.currentPassword ?? '')
    const newPassword = String(body.newPassword ?? '')

    if (!currentPassword) throw new HttpError(400, 'Current password is required')
    if (newPassword.length < 8) throw new HttpError(400, 'New password must be at least 8 characters')
    if (newPassword.length > 200) throw new HttpError(400, 'Password is too long')

    const user = await db.user.findUnique({ where: { id: session.id } })
    if (!user) throw new HttpError(404, 'Account not found')

    if (!verifyPassword(currentPassword, user.passwordHash)) {
      throw new HttpError(400, 'Current password is incorrect')
    }
    if (verifyPassword(newPassword, user.passwordHash)) {
      throw new HttpError(400, 'New password must be different from the current one')
    }

    await db.user.update({
      where: { id: user.id },
      data: { passwordHash: hashPassword(newPassword) },
    })
    await logActivity(session, 'profile.password_changed', `user:${user.email}`)
    return Response.json({ ok: true })
  } catch (err) {
    return jsonError(err)
  }
}
