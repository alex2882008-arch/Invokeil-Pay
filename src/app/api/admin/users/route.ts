import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError, safeInt, hashPassword, logActivity } from '@/lib/auth'
import { ROLE_LIST } from '@/lib/roles'

// ── Admin: Users collection ──────────────────────────────────────────────────
// GET  ?page&q&role        → { users(+_count.sessions), total, page, pages }
// GET  ?summary=1          → { summary: { total, active, admins } }
// POST { name,email,password,role } → { user }   (never returns passwordHash)

const PAGE_SIZE = 20
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

export async function GET(req: Request) {
  try {
    await requireRole(['ADMIN'])
    const url = new URL(req.url)

    // ── Aggregate summary for stat cards ──
    if (url.searchParams.get('summary') === '1') {
      const [total, active, admins] = await Promise.all([
        db.user.count(),
        db.user.count({ where: { active: true } }),
        db.user.count({ where: { role: 'ADMIN' } }),
      ])
      return Response.json({ summary: { total, active, admins } })
    }

    // ── List ──
    const q = url.searchParams.get('q')?.trim()
    const role = url.searchParams.get('role')
    const page = safeInt(url.searchParams.get('page'), 1)

    const where: Record<string, unknown> = {}
    if (role && role !== 'ALL' && (ROLES as readonly string[]).includes(role)) where.role = role
    if (q) {
      where.OR = [
        { name: { contains: q } },
        { email: { contains: q } },
      ]
    }

    const [total, users] = await Promise.all([
      db.user.count({ where }),
      db.user.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: USER_SELECT,
      }),
    ])

    return Response.json({
      users,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    })
  } catch (err) {
    return jsonError(err)
  }
}

export async function POST(req: Request) {
  try {
    const me = await requireRole(['ADMIN'])
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || typeof body !== 'object') throw new HttpError(400, 'Invalid JSON body')

    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const email = typeof body.email === 'string' ? body.email.toLowerCase().trim() : ''
    const password = typeof body.password === 'string' ? body.password : ''
    const role = (ROLES as readonly string[]).includes(String(body.role)) ? String(body.role) : 'AGENT'

    if (!name || !email || !password) throw new HttpError(400, 'Name, email and password are required')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Enter a valid email address')
    if (password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters')

    const exists = await db.user.findUnique({ where: { email }, select: { id: true } })
    if (exists) throw new HttpError(409, 'A user with this email already exists')

    const user = await db.user.create({
      data: { email, name, passwordHash: hashPassword(password), role },
      select: USER_SELECT,
    })

    await logActivity(me, 'user.created', `user:${user.id}`, { email: user.email, role: user.role })
    return Response.json({ user }, { status: 201 })
  } catch (err) {
    return jsonError(err)
  }
}
