import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError, logActivity } from '@/lib/auth'
import {
  validateTrigger, validateConditions, validateActions, parseStoredJson,
} from '@/lib/automation-validate'

// ── Admin: Automation Builder — list + create ────────────────────────────────
// GET  → { automations: [{ …, conditions, actions (parsed), brand }], brands }
// POST { name, description?, trigger, conditions[], actions[], enabled?, brandId? } → { automation }

/** Shape returned to the client (JSON columns already parsed). */
function serialize(a: {
  id: string
  name: string
  description: string | null
  trigger: string
  conditions: string | null
  actions: string
  enabled: boolean
  runCount: number
  lastRunAt: Date | null
  brandId: string | null
  builtIn: boolean
  createdAt: Date
  updatedAt: Date
  brand?: { id: string; name: string } | null
}) {
  return {
    id: a.id,
    name: a.name,
    description: a.description,
    trigger: a.trigger,
    conditions: parseStoredJson<Array<{ field: string; op: string; value: string }>>(a.conditions, []),
    actions: parseStoredJson(a.actions, []),
    enabled: a.enabled,
    runCount: a.runCount,
    lastRunAt: a.lastRunAt,
    brandId: a.brandId,
    brand: a.brand ?? null,
    builtIn: a.builtIn,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  }
}

export async function GET() {
  try {
    await requireRole(['OWNER', 'ADMIN', 'DEVELOPER', 'FINANCE', 'SUPPORT', 'AGENT', 'VIEWER'])
    const [automations, brands] = await Promise.all([
      db.automation.findMany({
        orderBy: { createdAt: 'desc' },
        include: { brand: { select: { id: true, name: true } } },
      }),
      db.brand.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    ])
    return Response.json({
      automations: automations.map(serialize),
      brands,
    })
  } catch (err) {
    return jsonError(err)
  }
}

export async function POST(req: Request) {
  try {
    const me = await requireRole(['OWNER', 'ADMIN'])
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    if (!body || typeof body !== 'object') throw new HttpError(400, 'Invalid JSON body')

    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) throw new HttpError(400, 'Automation name is required')
    if (name.length > 120) throw new HttpError(400, 'Name is too long (max 120 characters)')
    const description = typeof body.description === 'string' ? body.description.trim().slice(0, 300) : null

    const trigger = validateTrigger(body.trigger)
    const conditions = validateConditions(body.conditions)
    const actions = validateActions(body.actions)
    if (actions.length === 0) throw new HttpError(400, 'At least one action is required')

    const enabled = body.enabled === undefined ? true : body.enabled === true

    let brandId: string | null = null
    if (typeof body.brandId === 'string' && body.brandId.trim()) {
      const brand = await db.brand.findUnique({ where: { id: body.brandId.trim() }, select: { id: true } })
      if (!brand) throw new HttpError(400, 'Brand not found')
      brandId = brand.id
    }

    const automation = await db.automation.create({
      data: {
        name,
        description: description || null,
        trigger,
        conditions: JSON.stringify(conditions),
        actions: JSON.stringify(actions),
        enabled,
        brandId,
      },
      include: { brand: { select: { id: true, name: true } } },
    })
    await logActivity(me, 'automation.created', automation.id, { name, trigger })
    return Response.json({ automation: serialize(automation) }, { status: 201 })
  } catch (err) {
    return jsonError(err)
  }
}
