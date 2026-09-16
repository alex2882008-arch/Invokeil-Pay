import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError, logActivity, verifyPassword } from '@/lib/auth'
import { generateTotpSecret, verifyTotp, otpAuthUrl } from '@/lib/totp'

// ── My 2FA (any logged-in role) ──────────────────────────────────────────────
// POST   { }        → { secret, otpauthUrl }  (secret saved, twoFaEnabled stays false)
// PUT    { code }   → verify → twoFaEnabled=true → { ok: true } | 400 { error: 'INVALID_CODE' }
// DELETE { password } → verify password → disable + clear secret → { ok: true }

async function currentUser() {
  return requireRole(['ADMIN', 'AGENT', 'VIEWER'])
}

/** Step 1 — generate a fresh secret. Saved on the user but NOT enabled until verified. */
export async function POST() {
  try {
    const me = await currentUser()
    if (me.twoFaEnabled) throw new HttpError(400, 'Two-factor authentication is already enabled')

    const secret = generateTotpSecret()
    await db.user.update({ where: { id: me.id }, data: { twoFaSecret: secret, twoFaEnabled: false } })

    await logActivity(me, 'security.2fa_setup_started', `user:${me.id}`)
    return Response.json({ secret, otpauthUrl: otpAuthUrl(secret, me.email) })
  } catch (err) {
    return jsonError(err)
  }
}

/** Step 2 — confirm a code from the authenticator; flips twoFaEnabled on. */
export async function PUT(req: Request) {
  try {
    const me = await currentUser()
    const body = (await req.json().catch(() => null)) as { code?: unknown } | null
    const code = typeof body?.code === 'string' ? body.code : ''
    if (!code) throw new HttpError(400, 'Enter the 6-digit code from your authenticator app')

    const dbUser = await db.user.findUnique({ where: { id: me.id }, select: { twoFaSecret: true } })
    if (!dbUser?.twoFaSecret) throw new HttpError(400, 'Start the setup first — no pending secret')
    if (me.twoFaEnabled) throw new HttpError(400, 'Two-factor authentication is already enabled')

    if (!verifyTotp(dbUser.twoFaSecret, code)) {
      return Response.json({ error: 'INVALID_CODE' }, { status: 400 })
    }

    await db.user.update({ where: { id: me.id }, data: { twoFaEnabled: true } })
    await logActivity(me, 'security.2fa_enabled', `user:${me.id}`)
    return Response.json({ ok: true })
  } catch (err) {
    return jsonError(err)
  }
}

/** Disable — requires the account password. Clears the stored secret. */
export async function DELETE(req: Request) {
  try {
    const me = await currentUser()
    const body = (await req.json().catch(() => null)) as { password?: unknown } | null
    const password = typeof body?.password === 'string' ? body.password : ''
    if (!password) throw new HttpError(400, 'Enter your password to disable 2FA')

    const dbUser = await db.user.findUnique({ where: { id: me.id }, select: { passwordHash: true } })
    if (!dbUser || !verifyPassword(password, dbUser.passwordHash)) {
      throw new HttpError(400, 'Incorrect password')
    }

    await db.user.update({
      where: { id: me.id },
      data: { twoFaEnabled: false, twoFaSecret: null },
    })
    await logActivity(me, 'security.2fa_disabled', `user:${me.id}`)
    return Response.json({ ok: true })
  } catch (err) {
    return jsonError(err)
  }
}
