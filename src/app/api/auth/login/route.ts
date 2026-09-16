import { db } from '@/lib/db'
import {
  verifyPassword, setSessionCookie, jsonError, HttpError,
  recordLoginAttempt, isLoginThrottled, logActivity,
} from '@/lib/auth'
import { verifyTotp } from '@/lib/totp'

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    const email = String(body?.email ?? '').toLowerCase().trim()
    const password = body?.password
    const twoFaCode = body?.twoFaCode
    if (!email || !password) throw new HttpError(400, 'Email and password are required')

    if (await isLoginThrottled(email)) {
      await recordLoginAttempt(email, false)
      throw new HttpError(429, 'Too many failed attempts. Try again in 15 minutes.')
    }

    const user = await db.user.findUnique({ where: { email } })
    if (!user || !user.active || !verifyPassword(password, user.passwordHash)) {
      await recordLoginAttempt(email, false)
      throw new HttpError(401, 'These credentials do not match our records.')
    }

    // 2FA challenge
    if (user.twoFaEnabled) {
      if (!twoFaCode) {
        await recordLoginAttempt(email, false)
        return Response.json({ error: '2FA_REQUIRED' }, { status: 428 })
      }
      if (!user.twoFaSecret || !verifyTotp(user.twoFaSecret, String(twoFaCode))) {
        await recordLoginAttempt(email, false)
        return Response.json({ error: 'INVALID_2FA' }, { status: 401 })
      }
    }

    await recordLoginAttempt(email, true)
    await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
    const session = { id: user.id, email: user.email, name: user.name, role: user.role as 'ADMIN' | 'AGENT' | 'VIEWER' }
    await setSessionCookie(session)
    await logActivity(session, 'auth.login', `user:${user.id}`)
    return Response.json({ user: session })
  } catch (err) {
    return jsonError(err)
  }
}
