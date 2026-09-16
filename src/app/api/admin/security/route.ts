import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import { isAdminRole } from '@/lib/roles'
import {
  requireRole, jsonError, HttpError, safeInt, logActivity, sha256, readSessionToken,
} from '@/lib/auth'
import { getMergedSettings } from '@/lib/settings-defaults'

// ── Admin: Security overview ─────────────────────────────────────────────────
// GET    → { sessions:[{id,userId,userName,userEmail,browser,ip,lastSeenAt,isCurrent,...}],
//            loginAttempts:[…50], activity:[…50], activityPage, activityPages, activityTotal,
//            passkeys (mine), ipAllowlist, securityScore { score, max, checks } }   ← v2 additions
// DELETE ?sessionId=…    → revoke one session (ADMIN any · AGENT own)
// DELETE ?purgeAttempts=1 → clear login-attempt log older than 7 days (ADMIN)

const ATTEMPTS_TAKE = 50
const ACTIVITY_TAKE = 50
const SESSIONS_TAKE = 100

const COOKIE_NAME = 'ilp_session'

/** tokenHash of the requester's own session, so rows can be flagged isCurrent. */
async function currentTokenHash(): Promise<string | null> {
  try {
    const store = await cookies()
    const token = store.get(COOKIE_NAME)?.value
    if (!token) return null
    const read = await readSessionToken(token)
    return read?.jti ? sha256(read.jti) : null
  } catch {
    return null
  }
}

export async function GET(req: Request) {
  try {
    const me = await requireRole(['ADMIN', 'AGENT', 'VIEWER'])
    const url = new URL(req.url)

    const isAdmin = isAdminRole(me.role)
    const myHash = await currentTokenHash()

    const activityPage = safeInt(url.searchParams.get('activityPage'), 1)

    // Sessions: ADMIN sees everyone's, others only their own. Live rows only.
    const sessionWhere: Record<string, unknown> = {
      revoked: false,
      expiresAt: { gt: new Date() },
    }
    if (!isAdmin) sessionWhere.userId = me.id

    const [sessions, loginAttempts, activityTotal] = await Promise.all([
      db.session.findMany({
        where: sessionWhere,
        orderBy: { lastSeenAt: 'desc' },
        take: SESSIONS_TAKE,
        include: { user: { select: { name: true, email: true, role: true } } },
      }),
      db.loginAttempt.findMany({ orderBy: { createdAt: 'desc' }, take: ATTEMPTS_TAKE }),
      db.activityLog.count(),
    ])

    const activity = await db.activityLog.findMany({
      orderBy: { createdAt: 'desc' },
      skip: (activityPage - 1) * ACTIVITY_TAKE,
      take: ACTIVITY_TAKE,
      include: { user: { select: { name: true } } },
    })

    // ── v2: Security Center additions (passkeys / IP allowlist / security score) ──
    const [myPasskeys, ipAllowlistRow, settings, recentFails] = await Promise.all([
      db.passkey.findMany({
        where: { userId: me.id, active: true },
        orderBy: { createdAt: 'desc' },
        select: { id: true, label: true, credentialId: true, lastUsedAt: true, createdAt: true },
      }),
      db.setting.findUnique({ where: { key: 'ipAllowlist' } }),
      getMergedSettings(),
      db.loginAttempt.count({
        where: { success: false, createdAt: { gte: new Date(Date.now() - 86400_000) } },
      }),
    ])

    let ipAllowlist: string[] = []
    try {
      const parsed = JSON.parse(ipAllowlistRow?.value ?? '[]') as unknown
      if (Array.isArray(parsed)) ipAllowlist = parsed.filter((x): x is string => typeof x === 'string')
    } catch { /* keep empty */ }

    const scoreChecks = [
      { id: 'twoFa', enabled: !!me.twoFaEnabled, points: me.twoFaEnabled ? 30 : 0, max: 30 },
      { id: 'passkeys', enabled: myPasskeys.length > 0, points: myPasskeys.length > 0 ? 20 : 0, max: 20 },
      { id: 'allowlist', enabled: ipAllowlist.length > 0, points: ipAllowlist.length > 0 ? 15 : 0, max: 15 },
      { id: 'logins', enabled: recentFails < 5, points: recentFails < 5 ? 20 : 0, max: 20 },
      { id: 'risk', enabled: settings.riskEnabled === 'true', points: settings.riskEnabled === 'true' ? 15 : 0, max: 15 },
    ]
    const securityScore = {
      score: scoreChecks.reduce((sum, c) => sum + c.points, 0),
      max: 100,
      checks: scoreChecks,
    }

    return Response.json({
      sessions: sessions.map((s) => ({
        id: s.id,
        userId: s.userId,
        userName: s.user?.name ?? '—',
        userEmail: s.user?.email ?? null,
        userRole: s.user?.role ?? null,
        browser: s.browser,
        ip: s.ip,
        lastSeenAt: s.lastSeenAt,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
        isCurrent: myHash !== null && s.tokenHash === myHash,
      })),
      loginAttempts,
      activity,
      activityTotal,
      activityPage,
      activityPages: Math.max(1, Math.ceil(activityTotal / ACTIVITY_TAKE)),
      scope: isAdmin ? 'all' : 'own',
      // v2 additions — Security Center
      passkeys: myPasskeys,
      ipAllowlist,
      securityScore,
    })
  } catch (err) {
    return jsonError(err)
  }
}

export async function DELETE(req: Request) {
  try {
    const me = await requireRole(['ADMIN', 'AGENT', 'VIEWER'])
    const url = new URL(req.url)

    // ── Clear login attempts older than 7 days (ADMIN) ──
    if (url.searchParams.get('purgeAttempts') === '1') {
      if (me.role !== 'ADMIN') throw new HttpError(403, 'Only admins can clear login attempts')
      const cutoff = new Date(Date.now() - 7 * 86400_000)
      const removed = await db.loginAttempt.deleteMany({ where: { createdAt: { lt: cutoff } } })
      await logActivity(me, 'security.attempts_purged', 'login-attempts', { count: removed.count, olderThanDays: 7 })
      return Response.json({ ok: true, removed: removed.count })
    }

    // ── Revoke a session ──
    const sessionId = url.searchParams.get('sessionId')
    if (!sessionId) throw new HttpError(400, 'sessionId or purgeAttempts=1 is required')

    const session = await db.session.findUnique({ where: { id: sessionId } })
    if (!session) throw new HttpError(404, 'Session not found')

    if (me.role !== 'ADMIN' && session.userId !== me.id) {
      throw new HttpError(403, 'You can only revoke your own sessions')
    }

    await db.session.update({ where: { id: sessionId }, data: { revoked: true } })
    await logActivity(me, 'security.session_revoked', `session:${sessionId}`, {
      sessionUserId: session.userId,
      browser: session.browser,
    })
    return Response.json({ ok: true })
  } catch (err) {
    return jsonError(err)
  }
}
