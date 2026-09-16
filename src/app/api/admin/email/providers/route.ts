import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError, logActivity } from '@/lib/auth'
import { encryptJson, maskConfig, configHasFields, decryptJson } from '@/lib/providers/vault'
import { getMergedSettings } from '@/lib/settings-defaults'

const VALID_TYPES = ['RESEND', 'SES', 'MAILERSEND', 'PLUNK', 'LOOPS', 'SMTP', 'CUSTOM']
const REQUIRED_FIELDS: Record<string, string[]> = {
  RESEND: ['apiKey'],
  SES: ['accessKey', 'secretKey', 'region'],
  MAILERSEND: ['apiKey'],
  PLUNK: ['apiKey'],
  LOOPS: ['apiKey', 'transactionalId'],
  SMTP: ['host', 'user', 'password'],
  CUSTOM: ['url'],
}

function str(v: unknown, max = 320): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

function plainConfig(input: unknown): Record<string, string> | null {
  if (input == null) return null
  if (typeof input !== 'object' || Array.isArray(input)) throw new HttpError(400, 'config must be an object')
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (v == null) continue
    if (typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') continue
    out[k] = String(v)
  }
  return out
}

/** GET — list providers (masked config only) + sandbox flag + failover chain. */
export async function GET() {
  try {
    await requireRole(['OWNER', 'ADMIN', 'DEVELOPER'])
    const [rows, settings] = await Promise.all([
      db.emailProvider.findMany({ orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }] }),
      getMergedSettings(),
    ])
    const items = rows.map((p) => ({
      id: p.id,
      type: p.type,
      label: p.label,
      fromEmail: p.fromEmail,
      fromName: p.fromName,
      priority: p.priority,
      enabled: p.enabled,
      healthy: p.healthy,
      lastCheckedAt: p.lastCheckedAt,
      sentCount: p.sentCount,
      failCount: p.failCount,
      lastError: p.lastError,
      config: maskConfig(p.config),
      configPresent: configHasFields(p.config, REQUIRED_FIELDS[p.type] ?? []),
    }))
    return Response.json({ ok: true, data: { items, sandbox: settings.appMode === 'SANDBOX', chain: settings.emailFailoverChain } })
  } catch (e) {
    return jsonError(e)
  }
}

/** POST — create or update (id when provided). Config is encrypted at rest. */
export async function POST(req: Request) {
  try {
    const me = await requireRole(['OWNER', 'ADMIN'])
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const type = str(b.type).toUpperCase()
    if (!VALID_TYPES.includes(type)) throw new HttpError(400, `type must be one of ${VALID_TYPES.join(', ')}`)

    const fromEmail = str(b.fromEmail, 200)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromEmail)) throw new HttpError(400, 'fromEmail must be a valid email address')
    const id = typeof b.id === 'string' && b.id ? b.id : null
    const label = str(b.label, 120) || type
    const fromName = str(b.fromName, 120) || null
    const priorityRaw = Number(b.priority)
    const priority = Number.isFinite(priorityRaw) ? Math.min(Math.max(Math.trunc(priorityRaw), 1), 99) : 10
    const enabled = b.enabled == null ? false : Boolean(b.enabled)
    const incoming = plainConfig(b.config)

    const existing = id ? await db.emailProvider.findUnique({ where: { id } }) : null
    if (id && !existing) throw new HttpError(404, 'Provider not found')
    if (existing && existing.type !== type) throw new HttpError(400, 'Provider type cannot be changed — delete it and create a new one')

    // Merge: decrypt stored config, overlay only the plaintext fields provided, re-encrypt.
    let configJson: string | undefined
    if (incoming && Object.keys(incoming).length > 0) {
      const old = existing ? decryptJson(existing.config) : {}
      configJson = encryptJson({ ...old, ...incoming })
    }

    const data = {
      type,
      label,
      fromEmail,
      fromName,
      priority,
      enabled,
      ...(configJson !== undefined ? { config: configJson } : {}),
    }

    const row = existing
      ? await db.emailProvider.update({ where: { id: existing.id }, data })
      : await db.emailProvider.create({ data })

    await logActivity(me, existing ? 'email.provider.updated' : 'email.provider.created', `emailProvider:${row.id}`, { type, enabled })
    return Response.json({
      ok: true,
      data: {
        id: row.id,
        type: row.type,
        label: row.label,
        fromEmail: row.fromEmail,
        fromName: row.fromName,
        priority: row.priority,
        enabled: row.enabled,
        healthy: row.healthy,
        sentCount: row.sentCount,
        failCount: row.failCount,
        lastError: row.lastError,
        lastCheckedAt: row.lastCheckedAt,
        config: maskConfig(row.config),
        configPresent: configHasFields(row.config, REQUIRED_FIELDS[row.type] ?? []),
      },
    })
  } catch (e) {
    return jsonError(e)
  }
}
