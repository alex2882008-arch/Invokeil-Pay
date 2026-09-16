import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError, logActivity } from '@/lib/auth'
import { encryptJson, maskConfig, configHasFields, decryptJson } from '@/lib/providers/vault'
import type { EmailProvider } from '@prisma/client'

const REQUIRED_FIELDS: Record<string, string[]> = {
  RESEND: ['apiKey'],
  SES: ['accessKey', 'secretKey', 'region'],
  MAILERSEND: ['apiKey'],
  PLUNK: ['apiKey'],
  LOOPS: ['apiKey', 'transactionalId'],
  SMTP: ['host', 'user', 'password'],
  CUSTOM: ['url'],
}

function str(v: unknown, max = 320): string | undefined {
  if (typeof v !== 'string') return undefined
  return v.trim().slice(0, max)
}

function shape(row: EmailProvider) {
  if (!row) return null
  return {
    id: row.id,
    type: row.type,
    label: row.label,
    fromEmail: row.fromEmail,
    fromName: row.fromName,
    priority: row.priority,
    enabled: row.enabled,
    healthy: row.healthy,
    lastCheckedAt: row.lastCheckedAt,
    sentCount: row.sentCount,
    failCount: row.failCount,
    lastError: row.lastError,
    config: maskConfig(row.config),
    configPresent: configHasFields(row.config, REQUIRED_FIELDS[row.type] ?? []),
  }
}

/** PATCH — partial update (label/from/priority/enabled, config merge: decrypt → merge → re-encrypt). */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const me = await requireRole(['OWNER', 'ADMIN'])
    const { id } = await params
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>

    const existing = await db.emailProvider.findUnique({ where: { id } })
    if (!existing) throw new HttpError(404, 'Provider not found')

    const data: Record<string, unknown> = {}
    const label = str(b.label, 120)
    if (label !== undefined && label !== '') data.label = label
    const fromEmail = str(b.fromEmail, 200)
    if (fromEmail !== undefined && fromEmail !== '') {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromEmail)) throw new HttpError(400, 'fromEmail must be a valid email address')
      data.fromEmail = fromEmail
    }
    if (b.fromName !== undefined) data.fromName = str(b.fromName, 120) || null
    if (b.priority !== undefined) {
      const n = Number(b.priority)
      if (!Number.isFinite(n)) throw new HttpError(400, 'priority must be a number')
      data.priority = Math.min(Math.max(Math.trunc(n), 1), 99)
    }
    if (b.enabled !== undefined) data.enabled = Boolean(b.enabled)

    // Config merge: keep stored fields, overlay provided plaintext fields, re-encrypt.
    if (b.config !== undefined && typeof b.config === 'object' && !Array.isArray(b.config)) {
      const old = decryptJson(existing.config)
      for (const [k, v] of Object.entries(b.config as Record<string, unknown>)) {
        if (v == null) {
          delete old[k] // explicit null clears a stored field
          continue
        }
        if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') old[k] = String(v)
      }
      data.config = encryptJson(old)
    }

    if (Object.keys(data).length === 0) throw new HttpError(400, 'Nothing to update')
    const row = await db.emailProvider.update({ where: { id }, data })
    await logActivity(me, 'email.provider.updated', `emailProvider:${id}`, { fields: Object.keys(data) })
    return Response.json({ ok: true, data: shape(row) })
  } catch (e) {
    return jsonError(e)
  }
}

/** DELETE — remove a provider row (credentials included). */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const me = await requireRole(['OWNER', 'ADMIN'])
    const { id } = await params
    const existing = await db.emailProvider.findUnique({ where: { id }, select: { id: true, type: true } })
    if (!existing) throw new HttpError(404, 'Provider not found')
    await db.emailProvider.delete({ where: { id } })
    await logActivity(me, 'email.provider.deleted', `emailProvider:${id}`, { type: existing.type })
    return Response.json({ ok: true })
  } catch (e) {
    return jsonError(e)
  }
}
