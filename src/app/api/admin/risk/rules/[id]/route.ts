import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError, logActivity } from '@/lib/auth'

// ── Admin: single risk rule ──────────────────────────────────────────────────
// PATCH  { name?, config?, action?, priority?, enabled? } → { rule }
// DELETE → { ok }

const RULE_ACTIONS = ['ALLOW', 'REVIEW', 'BLOCK'] as const
const RISK_WRITE_ROLES = ['OWNER', 'ADMIN'] as const

function parseConfig(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw) as unknown
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const me = await requireRole([...RISK_WRITE_ROLES])
    const { id } = await params
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>

    const rule = await db.riskRule.findUnique({ where: { id } })
    if (!rule) throw new HttpError(404, 'Rule not found')

    const data: Record<string, unknown> = {}
    if (typeof b.name === 'string' && b.name.trim()) data.name = b.name.trim()
    if (b.config !== undefined) {
      if (typeof b.config !== 'object' || b.config === null || Array.isArray(b.config)) {
        throw new HttpError(400, 'Config must be a JSON object')
      }
      data.config = JSON.stringify(b.config)
    }
    if (b.action !== undefined) {
      if (!(RULE_ACTIONS as readonly string[]).includes(String(b.action))) {
        throw new HttpError(400, 'Action must be ALLOW, REVIEW or BLOCK')
      }
      data.action = String(b.action)
    }
    if (b.priority !== undefined) {
      const p = Number(b.priority)
      if (!Number.isFinite(p)) throw new HttpError(400, 'Priority must be a number')
      data.priority = Math.max(0, Math.trunc(p))
    }
    if (typeof b.enabled === 'boolean') data.enabled = b.enabled

    if (Object.keys(data).length === 0) throw new HttpError(400, 'Nothing to update')

    const updated = await db.riskRule.update({ where: { id }, data })
    await logActivity(me, 'risk.rule_updated', `rule:${updated.id}`, { name: updated.name, fields: Object.keys(data) })
    return Response.json({ rule: { ...updated, config: parseConfig(updated.config) } })
  } catch (err) {
    return jsonError(err)
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const me = await requireRole([...RISK_WRITE_ROLES])
    const { id } = await params

    const rule = await db.riskRule.findUnique({ where: { id } })
    if (!rule) throw new HttpError(404, 'Rule not found')

    await db.riskRule.delete({ where: { id } })
    await logActivity(me, 'risk.rule_deleted', `rule:${id}`, { name: rule.name })
    return Response.json({ ok: true })
  } catch (err) {
    return jsonError(err)
  }
}
