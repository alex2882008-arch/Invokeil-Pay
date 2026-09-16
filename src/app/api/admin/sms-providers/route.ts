// ── Admin: SMS provider setup (encrypted vault configs) ─────────────
// GET  → all providers with masked configs + readiness info
// POST → create/update a provider (one row per type, config merged)
import { db } from '@/lib/db'
import { requireRole, HttpError, jsonError, logActivity } from '@/lib/auth'
import { encryptJson, decryptJson, maskConfig, configHasFields } from '@/lib/providers/vault'
import { REQUIRED_FIELDS, DEFAULT_LABELS, isProviderType, sanitizeConfig, type ProviderType } from '@/lib/sms-providers-meta'

function providerView(row: {
  id: string
  type: string
  label: string
  priority: number
  enabled: boolean
  healthy: boolean
  sentCount: number
  failCount: number
  lastError: string | null
  lastCheckedAt: Date | null
  config: string
}) {
  const type = (isProviderType(row.type) ? row.type : 'CUSTOM') as ProviderType
  return {
    id: row.id,
    type,
    label: row.label,
    priority: row.priority,
    enabled: row.enabled,
    healthy: row.healthy,
    sentCount: row.sentCount,
    failCount: row.failCount,
    lastError: row.lastError,
    lastCheckedAt: row.lastCheckedAt,
    configMasked: maskConfig(row.config),
    configComplete: REQUIRED_FIELDS[type].every((f) => configHasFields(row.config, [f])),
    missing: REQUIRED_FIELDS[type].filter((f) => !configHasFields(row.config, [f])),
  }
}

export async function GET() {
  try {
    await requireRole(['OWNER', 'ADMIN', 'DEVELOPER', 'FINANCE', 'SUPPORT', 'AGENT', 'VIEWER'])
    const providers = await db.smsProvider.findMany({ orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }] })
    return Response.json({ ok: true, items: providers.map(providerView) })
  } catch (err) {
    return jsonError(err)
  }
}

export async function POST(req: Request) {
  try {
    const me = await requireRole(['OWNER', 'ADMIN', 'DEVELOPER'])
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
    if (!isProviderType(b.type)) throw new HttpError(400, 'Unknown provider type')

    const patch = sanitizeConfig(b.config)
    const existing = await db.smsProvider.findFirst({ where: { type: b.type } })

    let row
    if (existing) {
      // Merge: keep stored fields the client did not resend (client sees masked values).
      const merged = { ...decryptJson(existing.config), ...patch }
      row = await db.smsProvider.update({
        where: { id: existing.id },
        data: {
          config: encryptJson(merged),
          ...(typeof b.label === 'string' && b.label.trim() ? { label: b.label.trim().slice(0, 80) } : {}),
          ...(typeof b.priority === 'number' && Number.isFinite(b.priority)
            ? { priority: Math.min(999, Math.max(1, Math.round(b.priority))) }
            : {}),
          ...(typeof b.enabled === 'boolean' ? { enabled: b.enabled } : {}),
        },
      })
    } else {
      row = await db.smsProvider.create({
        data: {
          type: b.type,
          label: typeof b.label === 'string' && b.label.trim() ? b.label.trim().slice(0, 80) : DEFAULT_LABELS[b.type],
          config: encryptJson(patch),
          priority:
            typeof b.priority === 'number' && Number.isFinite(b.priority)
              ? Math.min(999, Math.max(1, Math.round(b.priority)))
              : 10,
          ...(typeof b.enabled === 'boolean' ? { enabled: b.enabled } : {}),
        },
      })
    }

    await logActivity(me, 'sms_provider.saved', `sms_provider:${row.id}`, { type: row.type })
    return Response.json({ ok: true, item: providerView(row) })
  } catch (err) {
    return jsonError(err)
  }
}
