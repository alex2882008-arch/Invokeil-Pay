import { db } from '@/lib/db'
import {
  requireRole, jsonError, HttpError, generateKey, logActivity,
} from '@/lib/auth'

// ── Admin: single store ──────────────────────────────────────────────────────
// PATCH { name?, contactEmail?, webhookUrl?, domainWhitelist? (hostnames), active?,
//         regenerateKey?, regenerateSecret? }
// DELETE (ADMIN)

function isHttpUrl(v: string): boolean {
  try {
    const u = new URL(v)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

const HOST_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/

/** Normalize + validate one whitelist entry → hostname or null (invalid). */
function normalizeHost(raw: string): string | null {
  let s = raw.trim().toLowerCase()
  if (!s) return null
  s = s.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/:\d+$/, '')
  if (s.length < 3 || s.length > 253) return null
  return HOST_RE.test(s) ? s : null
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(['ADMIN', 'AGENT'])
    const { id } = await params
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || typeof body !== 'object') throw new HttpError(400, 'Invalid JSON body')

    const existing = await db.store.findUnique({ where: { id } })
    if (!existing) throw new HttpError(404, 'Store not found')

    const data: Record<string, unknown> = {}

    if (body.name !== undefined) {
      const name = typeof body.name === 'string' ? body.name.trim() : ''
      if (!name) throw new HttpError(400, 'Store name cannot be empty')
      data.name = name
    }
    if (body.contactEmail !== undefined) {
      const email = typeof body.contactEmail === 'string' ? body.contactEmail.trim() : ''
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Invalid contact email')
      data.contactEmail = email || null
    }
    if (body.webhookUrl !== undefined) {
      const webhookUrl = typeof body.webhookUrl === 'string' ? body.webhookUrl.trim() : ''
      if (webhookUrl && !isHttpUrl(webhookUrl)) throw new HttpError(400, 'Webhook URL must be a valid http(s) URL')
      data.webhookUrl = webhookUrl || null
    }
    if (body.domainWhitelist !== undefined) {
      if (body.domainWhitelist === null || body.domainWhitelist === '') {
        data.domainWhitelist = null
      } else {
        if (!Array.isArray(body.domainWhitelist)) throw new HttpError(400, 'domainWhitelist must be an array of hostnames')
        const hosts: string[] = []
        for (const raw of body.domainWhitelist) {
          if (typeof raw !== 'string') throw new HttpError(400, 'domainWhitelist entries must be strings')
          if (!raw.trim()) continue
          const host = normalizeHost(raw)
          if (!host) throw new HttpError(400, `Invalid hostname: ${String(raw).slice(0, 60)}`)
          hosts.push(host)
        }
        data.domainWhitelist = hosts.length ? JSON.stringify([...new Set(hosts)]) : null
      }
    }
    if (typeof body.active === 'boolean') data.active = body.active
    if (body.regenerateKey === true) data.apiKey = generateKey('sk')
    if (body.regenerateSecret === true) data.secret = generateKey('wh', 24)

    const store = await db.store.update({ where: { id }, data })
    await logActivity(user, 'store.updated', `store:${store.id}`, {
      fields: Object.keys(data).join(',') || undefined,
    })
    return Response.json({ store })
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
    const existing = await db.store.findUnique({ where: { id } })
    if (!existing) throw new HttpError(404, 'Store not found')
    await db.store.delete({ where: { id } })
    await logActivity(user, 'store.deleted', `store:${id}`, { name: existing.name })
    return Response.json({ ok: true })
  } catch (err) {
    return jsonError(err)
  }
}
