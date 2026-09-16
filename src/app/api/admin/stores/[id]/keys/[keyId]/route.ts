import { db } from '@/lib/db'
import {
  requireRole, jsonError, HttpError, logActivity,
} from '@/lib/auth'

// ── Admin: single API key ────────────────────────────────────────────────────
// PATCH  { name?, scopes?, active? (revoke), locked? }
// DELETE removes the row (ADMIN)

const ALLOWED_SCOPES = ['create_payment', 'verify_payment', 'refund_payment'] as const

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; keyId: string }> }
) {
  try {
    const user = await requireRole(['ADMIN', 'AGENT'])
    const { id, keyId } = await params
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || typeof body !== 'object') throw new HttpError(400, 'Invalid JSON body')

    const existing = await db.apiKey.findFirst({ where: { id: keyId, storeId: id } })
    if (!existing) throw new HttpError(404, 'API key not found')

    const data: Record<string, unknown> = {}

    if (body.name !== undefined) {
      const name = typeof body.name === 'string' ? body.name.trim() : ''
      if (!name) throw new HttpError(400, 'Key name cannot be empty')
      data.name = name
    }
    if (body.scopes !== undefined) {
      if (typeof body.scopes !== 'string' || !body.scopes.trim()) {
        throw new HttpError(400, 'Select at least one scope')
      }
      const requested = body.scopes.split(',').map((s) => s.trim()).filter(Boolean)
      const invalid = requested.filter((s) => !(ALLOWED_SCOPES as readonly string[]).includes(s))
      if (invalid.length) throw new HttpError(400, `Unknown scope(s): ${invalid.join(', ')}`)
      data.scopes = [...new Set(requested)].join(',')
    }
    if (typeof body.active === 'boolean') data.active = body.active
    if (typeof body.locked === 'boolean') data.locked = body.locked

    const key = await db.apiKey.update({ where: { id: keyId }, data })
    await logActivity(user, 'store.key_updated', `store:${id}`, {
      keyId, name: key.name, fields: Object.keys(data).join(',') || undefined,
    })
    return Response.json({ key })
  } catch (err) {
    return jsonError(err)
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; keyId: string }> }
) {
  try {
    const user = await requireRole(['ADMIN'])
    const { id, keyId } = await params
    const existing = await db.apiKey.findFirst({ where: { id: keyId, storeId: id } })
    if (!existing) throw new HttpError(404, 'API key not found')
    await db.apiKey.delete({ where: { id: keyId } })
    await logActivity(user, 'store.key_deleted', `store:${id}`, { keyId, name: existing.name })
    return Response.json({ ok: true })
  } catch (err) {
    return jsonError(err)
  }
}
