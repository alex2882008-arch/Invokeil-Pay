// ── Admin: single SMS provider — PATCH (label/priority/enabled/config) & DELETE
import { db } from '@/lib/db'
import { requireRole, HttpError, jsonError, logActivity } from '@/lib/auth'
import { encryptJson, decryptJson, maskConfig, configHasFields } from '@/lib/providers/vault'
import { REQUIRED_FIELDS, isProviderType, sanitizeConfig, type ProviderType } from '@/lib/sms-providers-meta'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, { params }: Params) {
  try {
    const me = await requireRole(['OWNER', 'ADMIN', 'DEVELOPER'])
    const { id } = await params
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const row = await db.smsProvider.findUnique({ where: { id } })
    if (!row) throw new HttpError(404, 'Provider not found')

    const patch = sanitizeConfig(b.config)
    const merged = { ...decryptJson(row.config), ...patch }

    const updated = await db.smsProvider.update({
      where: { id },
      data: {
        config: encryptJson(merged),
        ...(typeof b.label === 'string' && b.label.trim() ? { label: b.label.trim().slice(0, 80) } : {}),
        ...(typeof b.priority === 'number' && Number.isFinite(b.priority)
          ? { priority: Math.min(999, Math.max(1, Math.round(b.priority))) }
          : {}),
        ...(typeof b.enabled === 'boolean' ? { enabled: b.enabled } : {}),
      },
    })

    await logActivity(me, 'sms_provider.updated', `sms_provider:${id}`, { type: updated.type })
    const type = (isProviderType(updated.type) ? updated.type : 'CUSTOM') as ProviderType
    return Response.json({
      ok: true,
      item: {
        id: updated.id,
        type,
        label: updated.label,
        priority: updated.priority,
        enabled: updated.enabled,
        healthy: updated.healthy,
        sentCount: updated.sentCount,
        failCount: updated.failCount,
        lastError: updated.lastError,
        lastCheckedAt: updated.lastCheckedAt,
        configMasked: maskConfig(updated.config),
        configComplete: REQUIRED_FIELDS[type].every((f) => configHasFields(updated.config, [f])),
      },
    })
  } catch (err) {
    return jsonError(err)
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const me = await requireRole(['OWNER', 'ADMIN'])
    const { id } = await params
    const row = await db.smsProvider.findUnique({ where: { id } })
    if (!row) throw new HttpError(404, 'Provider not found')
    await db.smsProvider.delete({ where: { id } })
    await logActivity(me, 'sms_provider.deleted', `sms_provider:${id}`, { type: row.type })
    return Response.json({ ok: true })
  } catch (err) {
    return jsonError(err)
  }
}
