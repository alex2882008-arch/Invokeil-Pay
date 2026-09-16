import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError, logActivity } from '@/lib/auth'
import { ensureDefaultRiskRules } from '@/lib/risk-engine'

// ── Admin: Risk rules ────────────────────────────────────────────────────────
// GET  → { rules } (config parsed to object; seeds default rules on first run)
// POST { name, type, config?, action?, priority?, enabled? } → { rule }

const RULE_TYPES = ['VELOCITY', 'AMOUNT_LIMIT', 'LIST_MATCH', 'HOUR_PATTERN'] as const
const RULE_ACTIONS = ['ALLOW', 'REVIEW', 'BLOCK'] as const

const RISK_READ_ROLES = ['OWNER', 'ADMIN', 'FINANCE', 'SUPPORT', 'DEVELOPER'] as const
const RISK_WRITE_ROLES = ['OWNER', 'ADMIN'] as const

function parseConfig(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw) as unknown
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

export async function GET() {
  try {
    await requireRole([...RISK_READ_ROLES])
    await ensureDefaultRiskRules()
    const rules = await db.riskRule.findMany({ orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }] })
    return Response.json({
      rules: rules.map((r) => ({ ...r, config: parseConfig(r.config) })),
    })
  } catch (err) {
    return jsonError(err)
  }
}

export async function POST(req: Request) {
  try {
    const me = await requireRole([...RISK_WRITE_ROLES])
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>

    const name = typeof b.name === 'string' ? b.name.trim() : ''
    if (!name) throw new HttpError(400, 'Rule name is required')
    if (!(RULE_TYPES as readonly string[]).includes(String(b.type))) {
      throw new HttpError(400, 'Rule type must be VELOCITY, AMOUNT_LIMIT, LIST_MATCH or HOUR_PATTERN')
    }
    if (b.action !== undefined && !(RULE_ACTIONS as readonly string[]).includes(String(b.action))) {
      throw new HttpError(400, 'Action must be ALLOW, REVIEW or BLOCK')
    }
    if (b.config !== undefined && (typeof b.config !== 'object' || b.config === null || Array.isArray(b.config))) {
      throw new HttpError(400, 'Config must be a JSON object')
    }

    const rule = await db.riskRule.create({
      data: {
        name,
        type: String(b.type),
        config: JSON.stringify(b.config ?? {}),
        action: b.action !== undefined ? String(b.action) : 'REVIEW',
        priority: Number.isFinite(Number(b.priority)) ? Math.max(0, Math.trunc(Number(b.priority))) : 10,
        enabled: typeof b.enabled === 'boolean' ? b.enabled : true,
      },
    })

    await logActivity(me, 'risk.rule_created', `rule:${rule.id}`, { name: rule.name, type: rule.type })
    return Response.json({ rule: { ...rule, config: parseConfig(rule.config) } }, { status: 201 })
  } catch (err) {
    return jsonError(err)
  }
}
