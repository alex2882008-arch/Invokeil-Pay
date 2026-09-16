import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError, logActivity } from '@/lib/auth'
import {
  validateTrigger, validateConditions, validateActions, parseStoredJson,
} from '@/lib/automation-validate'

// ── Admin: single automation ─────────────────────────────────────────────────
// GET    → { automation (conditions/actions parsed, + last 5 runs) }
// PATCH  { name?, description?, trigger?, conditions?, actions?, enabled?, brandId? }
// DELETE (OWNER/ADMIN) — runs cascade

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

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(['OWNER', 'ADMIN', 'DEVELOPER', 'FINANCE', 'SUPPORT', 'AGENT', 'VIEWER'])
    const { id } = await params
    const automation = await db.automation.findUnique({
      where: { id },
      include: {
        brand: { select: { id: true, name: true } },
        runs: { orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, status: true, createdAt: true } },
      },
    })
    if (!automation) throw new HttpError(404, 'Automation not found')
    return Response.json({ automation: { ...serialize(automation), lastRuns: automation.runs } })
  } catch (err) {
    return jsonError(err)
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const me = await requireRole(['OWNER', 'ADMIN'])
    const { id } = await params
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    if (!body || typeof body !== 'object') throw new HttpError(400, 'Invalid JSON body')

    const existing = await db.automation.findUnique({ where: { id } })
    if (!existing) throw new HttpError(404, 'Automation not found')

    const data: Record<string, unknown> = {}

    if (body.name !== undefined) {
      const name = typeof body.name === 'string' ? body.name.trim() : ''
      if (!name) throw new HttpError(400, 'Automation name is required')
      if (name.length > 120) throw new HttpError(400, 'Name is too long (max 120 characters)')
      data.name = name
    }
    if (body.description !== undefined) {
      const description = typeof body.description === 'string' ? body.description.trim().slice(0, 300) : ''
      data.description = description || null
    }
    if (body.trigger !== undefined) data.trigger = validateTrigger(body.trigger)
    if (body.conditions !== undefined) {
      const conditions = validateConditions(body.conditions)
      data.conditions = JSON.stringify(conditions)
    }
    if (body.actions !== undefined) {
      const actions = validateActions(body.actions)
      if (actions.length === 0) throw new HttpError(400, 'At least one action is required')
      data.actions = JSON.stringify(actions)
    }
    if (body.enabled !== undefined) {
      if (typeof body.enabled !== 'boolean') throw new HttpError(400, 'enabled must be a boolean')
      data.enabled = body.enabled
    }
    if (body.brandId !== undefined) {
      if (typeof body.brandId === 'string' && body.brandId.trim()) {
        const brand = await db.brand.findUnique({ where: { id: body.brandId.trim() }, select: { id: true } })
        if (!brand) throw new HttpError(400, 'Brand not found')
        data.brandId = brand.id
      } else {
        data.brandId = null
      }
    }

    const automation = await db.automation.update({
      where: { id },
      data,
      include: { brand: { select: { id: true, name: true } } },
    })
    await logActivity(me, 'automation.updated', id, {
      name: automation.name,
      fields: Object.keys(data).join(',') || undefined,
    })
    return Response.json({ automation: serialize(automation) })
  } catch (err) {
    return jsonError(err)
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const me = await requireRole(['OWNER', 'ADMIN'])
    const { id } = await params
    const existing = await db.automation.findUnique({ where: { id } })
    if (!existing) throw new HttpError(404, 'Automation not found')
    await db.automation.delete({ where: { id } }) // AutomationRun cascades (schema)
    await logActivity(me, 'automation.deleted', id, { name: existing.name, trigger: existing.trigger })
    return Response.json({ ok: true })
  } catch (err) {
    return jsonError(err)
  }
}
