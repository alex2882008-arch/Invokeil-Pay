import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError, logActivity } from '@/lib/auth'
import { OPS_ROLES } from '@/lib/roles'

const IMPACTS = ['CRITICAL', 'MAJOR', 'MINOR', 'MAINTENANCE'] as const

function str(v: unknown, max = 2000): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

function parseJsonArray(raw: string | null | undefined): Array<Record<string, unknown>> {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? (v as Array<Record<string, unknown>>) : []
  } catch {
    return []
  }
}

/** GET /api/admin/incidents — newest first. */
export async function GET() {
  try {
    await requireRole(['OWNER', 'ADMIN', 'SUPPORT', 'AGENT', 'VIEWER'])
    const rows = await db.incident.findMany({ orderBy: { startedAt: 'desc' }, take: 200 })
    const items = rows.map((r) => ({
      ...r,
      components: (() => {
        try {
          const v = JSON.parse(r.components)
          return Array.isArray(v) ? v : []
        } catch {
          return []
        }
      })(),
      updates: parseJsonArray(r.updates),
    }))
    const open = items.filter((i) => i.status !== 'RESOLVED').length
    return Response.json({ ok: true, data: { items, open } })
  } catch (e) {
    return jsonError(e)
  }
}

/** POST /api/admin/incidents — create incident {title, body, impact, components[]}. */
export async function POST(req: Request) {
  try {
    const me = await requireRole(OPS_ROLES)
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const title = str(b.title, 200)
    const body = str(b.body, 5000)
    if (!title || !body) throw new HttpError(400, 'title and body are required')
    const impactRaw = str(b.impact, 20).toUpperCase()
    const impact = (IMPACTS as readonly string[]).includes(impactRaw) ? impactRaw : 'MINOR'
    const components = Array.isArray(b.components)
      ? b.components.filter((c): c is string => typeof c === 'string').map((c) => c.trim()).filter(Boolean).slice(0, 20)
      : []

    const row = await db.incident.create({
      data: {
        title,
        body,
        impact,
        components: JSON.stringify(components),
        updates: JSON.stringify([{ at: new Date().toISOString(), body, status: 'INVESTIGATING' }]),
        status: 'INVESTIGATING',
        startedAt: new Date(),
      },
    })
    await logActivity(me, 'incident.created', `incident:${row.id}`, { title, impact })
    return Response.json({ ok: true, data: { id: row.id } }, { status: 201 })
  } catch (e) {
    return jsonError(e)
  }
}
