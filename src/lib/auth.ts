import { cookies, headers } from 'next/headers'
import { SignJWT, jwtVerify } from 'jose'
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'crypto'
import { db } from '@/lib/db'
import type { Role } from '@/lib/roles'

const COOKIE_NAME = 'ilp_session'
const SECRET = new TextEncoder().encode(
  process.env.ILP_SESSION_SECRET || 'invokeil-pay-dev-secret-change-me'
)
const SESSION_DAYS = 7

// ── Password hashing (scrypt, no external deps) ──────────────────────────────

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const candidate = scryptSync(password, salt, 64)
  const expected = Buffer.from(hash, 'hex')
  return candidate.length === expected.length && timingSafeEqual(candidate, expected)
}

export function sha256(v: string): string {
  return createHash('sha256').update(v).digest('hex')
}

// ── Session token (JWT in httpOnly cookie) with DB-backed session rows ──────

export type SessionUser = {
  id: string
  email: string
  name: string
  role: Role
  twoFaEnabled?: boolean
}

export { ADMIN_ROLES, isAdminRole } from '@/lib/roles'

export async function createSession(user: SessionUser): Promise<string> {
  return await new SignJWT({ ...user })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .setJti(randomBytes(12).toString('hex'))
    .sign(SECRET)
}

export async function readSessionToken(token: string): Promise<(SessionUser & { jti?: string }) | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET)
    if (!payload || typeof payload.id !== 'string') return null
    return {
      id: payload.id as string,
      email: payload.email as string,
      name: payload.name as string,
      role: payload.role as SessionUser['role'],
      twoFaEnabled: !!payload.twoFaEnabled,
      jti: typeof payload.jti === 'string' ? payload.jti : undefined,
    }
  } catch {
    return null
  }
}

function parseBrowser(ua: string | null): string | null {
  if (!ua) return null
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /Firefox\//.test(ua) ? 'Firefox' : 'Unknown'
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'Unknown'
  return `${browser} · ${os}`
}

export async function setSessionCookie(user: SessionUser) {
  const token = await createSession(user)
  const store = await cookies()
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: 60 * 60 * 24 * SESSION_DAYS,
    path: '/',
  })
  // Create DB session row for device management
  try {
    const read = await readSessionToken(token)
    if (read?.jti) {
      const h = await headers()
      const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1'
      const ua = h.get('user-agent')
      await db.session.create({
        data: {
          userId: user.id,
          tokenHash: sha256(read.jti),
          ip,
          userAgent: ua?.slice(0, 250) ?? null,
          browser: parseBrowser(ua),
          expiresAt: new Date(Date.now() + SESSION_DAYS * 86400_000),
        },
      })
    }
  } catch {
    // session row is best-effort; cookie auth still works
  }
}

export async function clearSessionCookie() {
  const store = await cookies()
  const token = store.get(COOKIE_NAME)?.value
  if (token) {
    const read = await readSessionToken(token)
    if (read?.jti) {
      try {
        await db.session.updateMany({ where: { tokenHash: sha256(read.jti) }, data: { revoked: true } })
      } catch { /* ignore */ }
    }
  }
  store.delete(COOKIE_NAME)
}

export async function touchSession(jti: string) {
  try {
    await db.session.updateMany({ where: { tokenHash: sha256(jti), revoked: false }, data: { lastSeenAt: new Date() } })
  } catch { /* ignore */ }
}

/** Returns the logged-in user from the request cookie, or null.
 *  Validates DB user (active) AND DB session row (revoked/expired). */
export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies()
  const token = store.get(COOKIE_NAME)?.value
  if (!token) return null
  const fromToken = await readSessionToken(token)
  if (!fromToken) return null
  try {
    const dbUser = await db.user.findUnique({
      where: { id: fromToken.id },
      select: { id: true, email: true, name: true, role: true, active: true, twoFaEnabled: true },
    })
    if (!dbUser || !dbUser.active) return null
    // Session row must exist & be alive (revocation support)
    if (fromToken.jti) {
      const row = await db.session.findFirst({ where: { tokenHash: sha256(fromToken.jti) } })
      if (!row || row.revoked || row.expiresAt < new Date()) return null
      // Throttle writes: only touch when >60s stale
      if (Date.now() - row.lastSeenAt.getTime() > 60_000) await touchSession(fromToken.jti)
    }
    const role: SessionUser['role'] =
      dbUser.role === 'OWNER' ||
      dbUser.role === 'ADMIN' ||
      dbUser.role === 'DEVELOPER' ||
      dbUser.role === 'FINANCE' ||
      dbUser.role === 'SUPPORT' ||
      dbUser.role === 'AGENT' ||
      dbUser.role === 'VIEWER'
        ? dbUser.role
        : 'VIEWER'
    return { id: dbUser.id, email: dbUser.email, name: dbUser.name, role, twoFaEnabled: dbUser.twoFaEnabled }
  } catch {
    return null
  }
}

// ── Activity log ─────────────────────────────────────────────────────────────

export async function logActivity(
  user: { id?: string | null; name?: string } | null,
  action: string,
  target?: string,
  meta?: Record<string, unknown>
) {
  try {
    const h = await headers()
    await db.activityLog.create({
      data: {
        userId: user?.id ?? null,
        actorName: user?.name ?? 'System',
        action,
        target: target ?? null,
        meta: meta ? JSON.stringify(meta) : null,
        ip: h.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1',
        userAgent: h.get('user-agent')?.slice(0, 250) ?? null,
      },
    })
  } catch { /* audit logging must never break the request */ }
}

// ── Login attempts / throttling ──────────────────────────────────────────────

export async function recordLoginAttempt(email: string, success: boolean) {
  try {
    const h = await headers()
    await db.loginAttempt.create({
      data: {
        email: email.toLowerCase(),
        ip: h.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1',
        userAgent: h.get('user-agent')?.slice(0, 250) ?? null,
        success,
      },
    })
  } catch { /* ignore */ }
}

/** Max 8 failed attempts per email in 15 minutes. */
export async function isLoginThrottled(email: string): Promise<boolean> {
  try {
    const since = new Date(Date.now() - 15 * 60_000)
    const fails = await db.loginAttempt.count({
      where: { email: email.toLowerCase(), success: false, createdAt: { gte: since } },
    })
    return fails >= 8
  } catch {
    return false
  }
}

// ── API key auth (merchant API) ──────────────────────────────────────────────

export type ApiAuth =
  | { ok: true; storeId: string; keyId: string; scopes: string[] }
  | { ok: false; status: number; error: string; code: string }

/** Authenticate `Authorization: Bearer sk_...` (store master key or scoped ApiKey). */
export async function authenticateApiKey(req: Request, requiredScope?: string): Promise<ApiAuth> {
  const header = req.headers.get('authorization') ?? ''
  const m = /^Bearer\s+(.+)$/i.exec(header)
  const key = m?.[1]?.trim()
  if (!key) return { ok: false, status: 401, error: 'Missing API key. Send header: Authorization: Bearer <api_key>', code: 'MISSING_API_KEY' }

  // Master store key
  const store = await db.store.findUnique({ where: { apiKey: key } })
  if (store) {
    if (!store.active) return { ok: false, status: 403, error: 'This store is deactivated', code: 'STORE_INACTIVE' }
    return { ok: true, storeId: store.id, keyId: 'master', scopes: ['create_payment', 'verify_payment', 'refund_payment'] }
  }

  // Scoped key
  const scoped = await db.apiKey.findUnique({ where: { key } })
  if (scoped) {
    if (!scoped.active) return { ok: false, status: 403, error: 'API key is revoked', code: 'KEY_REVOKED' }
    if (scoped.locked) return { ok: false, status: 403, error: 'API key is locked', code: 'KEY_LOCKED' }
    if (scoped.expiresAt && scoped.expiresAt < new Date()) return { ok: false, status: 403, error: 'API key has expired', code: 'KEY_EXPIRED' }
    const store2 = await db.store.findUnique({ where: { id: scoped.storeId } })
    if (!store2 || !store2.active) return { ok: false, status: 403, error: 'Store is deactivated', code: 'STORE_INACTIVE' }
    const scopes = scoped.scopes.split(',').map((s) => s.trim()).filter(Boolean)
    if (requiredScope && !scopes.includes(requiredScope)) {
      return { ok: false, status: 403, error: `Insufficient scope: requires '${requiredScope}'`, code: 'INSUFFICIENT_SCOPE' }
    }
    await db.apiKey.update({ where: { id: scoped.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined)
    return { ok: true, storeId: scoped.storeId, keyId: scoped.id, scopes }
  }

  return { ok: false, status: 401, error: 'Invalid API key', code: 'INVALID_API_KEY' }
}

// ── Misc helpers ─────────────────────────────────────────────────────────────

export class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** Throws 401/403 unless a user with an allowed role is logged in. */
export async function requireRole(allowed: Array<SessionUser['role']>): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user) throw new HttpError(401, 'Not authenticated')
  if (!allowed.includes(user.role)) throw new HttpError(403, 'Not permitted for your role')
  return user
}

export function jsonError(err: unknown) {
  if (err instanceof HttpError) {
    return Response.json({ error: err.message }, { status: err.status })
  }
  console.error('[api]', err)
  return Response.json({ error: 'Internal server error' }, { status: 500 })
}

export function generateKey(prefix: string, bytes = 18): string {
  return `${prefix}_${randomBytes(bytes).toString('hex')}`
}

export function randomToken(bytes = 16): string {
  return randomBytes(bytes).toString('base64url')
}

export function generateOtp(): string {
  return String(100000 + (randomBytes(4).readUInt32BE(0) % 900000))
}

/** Parse an integer query param safely. */
export function safeInt(v: string | null, def: number, min = 1): number {
  if (v === null || v.trim() === '') return Math.max(def, min)
  const n = parseInt(v, 10)
  if (!Number.isFinite(n)) return Math.max(def, min)
  return Math.max(n, min)
}

/** Domain whitelist check for return_url / webhook_url (Ownpay/PipraPay style). */
export function isDomainAllowed(url: string | undefined | null, whitelistJson: string | null | undefined): boolean {
  if (!url) return true // empty = allowed
  let u: URL
  try { u = new URL(url) } catch { return false }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
  if (!whitelistJson) return true // no whitelist configured = allow any
  try {
    const list = JSON.parse(whitelistJson) as string[]
    if (!Array.isArray(list) || list.length === 0) return true
    const host = u.hostname.toLowerCase()
    return list.some((d) => {
      const dn = String(d).toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
      return host === dn || host.endsWith(`.${dn}`)
    })
  } catch {
    return true
  }
}
