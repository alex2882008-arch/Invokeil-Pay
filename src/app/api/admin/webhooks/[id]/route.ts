import { db } from '@/lib/db'
import {
  requireRole, jsonError, HttpError, logActivity,
} from '@/lib/auth'
import { WEBHOOK_EVENTS } from '@/lib/webhook'

// ── Admin: single webhook endpoint ───────────────────────────────────────────
// PATCH  { url?, events?, active? }
// DELETE (ADMIN)

function isHttpUrl(v: string): boolean {
  try {
    const u = new URL(v)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

function validateEvents(raw: unknown): string {
  if (raw === undefined || raw === null || raw === '*' || raw === '') return '*'
  if (typeof raw !== 'string') throw new HttpError(400, 'events must be "*" or a comma separated list')
  const parts = raw.split(',').map((s) => s.trim()).filter(Boolean)
  if (!parts.length) return '*'
  const invalid = parts.filter((p) => !(WEBHOOK_EVENTS as readonly string[]).includes(p))
  if (invalid.length) throw new HttpError(400, `Unknown event(s): ${invalid.join(', ')}`)
  return [...new Set(parts)].join(',')
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(['ADMIN'])
    const { id } = await params
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || typeof body !== 'object') throw new HttpError(400, 'Invalid JSON body')

    const existing = await db.webhookEndpoint.findUnique({ where: { id } })
    if (!existing) throw new HttpError(404, 'Endpoint not found')

    const data: Record<string, unknown> = {}
    if (body.url !== undefined) {
      const urlStr = typeof body.url === 'string' ? body.url.trim() : ''
      if (!urlStr || !isHttpUrl(urlStr)) throw new HttpError(400, 'A valid http(s) endpoint URL is required')
      data.url = urlStr
    }
    if (body.events !== undefined) data.events = validateEvents(body.events)
    if (typeof body.active === 'boolean') data.active = body.active

    const endpoint = await db.webhookEndpoint.update({ where: { id }, data })
    await logActivity(user, 'webhook.endpoint_updated', `store:${existing.storeId}`, {
      endpointId: id, fields: Object.keys(data).join(',') || undefined,
    })
    return Response.json({ endpoint })
  } catch (err) {
    return jsonError(err)
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(['ADMIN'])
    const { id } = await params
    const existing = await db.webhookEndpoint.findUnique({ where: { id } })
    if (!existing) throw new HttpError(404, 'Endpoint not found')
    await db.webhookEndpoint.delete({ where: { id } })
    await logActivity(user, 'webhook.endpoint_deleted', `store:${existing.storeId}`, {
      endpointId: id, url: existing.url,
    })
    return Response.json({ ok: true })
  } catch (err) {
    return jsonError(err)
  }
}
