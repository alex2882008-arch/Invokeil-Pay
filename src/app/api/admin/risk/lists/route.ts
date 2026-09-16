import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError, logActivity } from '@/lib/auth'
import { ensureDefaultRiskRules } from '@/lib/risk-engine'

// ── Admin: Allow / Block lists ───────────────────────────────────────────────
// GET  → { items, allow, block, counts }   (seeds default rules on first run)
// POST { list ALLOW|BLOCK, type PHONE|EMAIL|IP|TRX, value, reason? } → { entry }

const LISTS = ['ALLOW', 'BLOCK'] as const
const ENTRY_TYPES = ['PHONE', 'EMAIL', 'IP', 'TRX'] as const

const RISK_READ_ROLES = ['OWNER', 'ADMIN', 'FINANCE', 'SUPPORT', 'DEVELOPER'] as const
const RISK_WRITE_ROLES = ['OWNER', 'ADMIN'] as const

export async function GET() {
  try {
    await requireRole([...RISK_READ_ROLES])
    await ensureDefaultRiskRules()
    const items = await db.listEntry.findMany({ orderBy: { createdAt: 'desc' } })
    const allow = items.filter((e) => e.list === 'ALLOW')
    const block = items.filter((e) => e.list === 'BLOCK')
    return Response.json({ items, allow, block, counts: { allow: allow.length, block: block.length } })
  } catch (err) {
    return jsonError(err)
  }
}

export async function POST(req: Request) {
  try {
    const me = await requireRole([...RISK_WRITE_ROLES])
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>

    const list = String(b.list ?? '')
    const type = String(b.type ?? '')
    const value = typeof b.value === 'string' ? b.value.trim() : ''

    if (!(LISTS as readonly string[]).includes(list)) throw new HttpError(400, 'list must be ALLOW or BLOCK')
    if (!(ENTRY_TYPES as readonly string[]).includes(type)) {
      throw new HttpError(400, 'type must be PHONE, EMAIL, IP or TRX')
    }
    if (!value) throw new HttpError(400, 'value is required')
    if (value.length > 320) throw new HttpError(400, 'value is too long')

    const reason = typeof b.reason === 'string' && b.reason.trim() ? b.reason.trim() : null

    const entry = await db.listEntry
      .create({ data: { list, type, value, reason } })
      .catch((e: { code?: string }) => {
        if (e?.code === 'P2002') throw new HttpError(409, 'This entry already exists')
        throw e
      })

    await logActivity(me, 'risk.list_entry_added', `list-entry:${entry.id}`, { list, type, value })
    return Response.json({ entry }, { status: 201 })
  } catch (err) {
    return jsonError(err)
  }
}
