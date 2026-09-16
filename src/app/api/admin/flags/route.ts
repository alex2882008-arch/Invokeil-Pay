import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError, logActivity } from '@/lib/auth'
import { DEV_ROLES } from '@/lib/roles'

const KEY_RE = /^[a-zA-Z0-9_-]{2,60}$/

function str(v: unknown, max = 320): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

function rollout(v: unknown): number {
  const n = Number(v)
  if (!Number.isFinite(n)) return 0
  return Math.min(Math.max(Math.trunc(n), 0), 100)
}

/** GET /api/admin/flags — all feature flags. */
export async function GET() {
  try {
    await requireRole([...DEV_ROLES, 'FINANCE', 'SUPPORT', 'AGENT', 'VIEWER'])
    const items = await db.featureFlag.findMany({ orderBy: { key: 'asc' } })
    return Response.json({ ok: true, data: { items } })
  } catch (e) {
    return jsonError(e)
  }
}

/** POST /api/admin/flags — { key, name, description?, enabled?, rolloutPercent? }. */
export async function POST(req: Request) {
  try {
    const me = await requireRole(DEV_ROLES)
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const key = str(b.key, 60)
    const name = str(b.name, 120)
    if (!key || !name) throw new HttpError(400, 'key and name are required')
    if (!KEY_RE.test(key)) throw new HttpError(400, 'key may only contain letters, numbers, dashes and underscores')

    const clash = await db.featureFlag.findUnique({ where: { key } })
    if (clash) throw new HttpError(409, 'A flag with this key already exists')

    const row = await db.featureFlag.create({
      data: {
        key,
        name,
        description: str(b.description, 500) || null,
        enabled: b.enabled == null ? false : Boolean(b.enabled),
        rolloutPercent: b.rolloutPercent == null ? 0 : rollout(b.rolloutPercent),
      },
    })
    await logActivity(me, 'flag.created', `featureFlag:${row.key}`, { key })
    return Response.json({ ok: true, data: row }, { status: 201 })
  } catch (e) {
    return jsonError(e)
  }
}
