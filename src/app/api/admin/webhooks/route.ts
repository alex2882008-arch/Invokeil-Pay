import { db } from '@/lib/db'
import {
  requireRole, jsonError, HttpError, safeInt, generateKey, logActivity,
} from '@/lib/auth'
import { WEBHOOK_EVENTS } from '@/lib/webhook'

// ── Admin: Webhook Center ────────────────────────────────────────────────────
// GET ?storeId                → { endpoints (+_count.deliveries), stores }
// GET ?deliveries=1&…         → { deliveries (+endpoint.url, store name), total, page, pages }
// POST { storeId, url, events, secret? } → { endpoint }  (ADMIN)

const PAGE_SIZE = 20

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

export async function GET(req: Request) {
  try {
    await requireRole(['ADMIN', 'AGENT', 'VIEWER'])
    const url = new URL(req.url)
    const storeId = url.searchParams.get('storeId')?.trim() || null

    if (url.searchParams.get('deliveries') === '1') {
      const where: Record<string, unknown> = {}
      if (storeId) where.storeId = storeId
      const event = url.searchParams.get('event')?.trim()
      if (event && event !== 'ALL') where.event = event
      const status = url.searchParams.get('status')?.trim()
      if (status && status !== 'ALL') where.status = status
      const q = url.searchParams.get('q')?.trim()
      if (q) where.endpoint = { url: { contains: q } }
      const page = safeInt(url.searchParams.get('page'), 1)

      const [total, deliveries] = await Promise.all([
        db.webhookDelivery.count({ where }),
        db.webhookDelivery.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * PAGE_SIZE,
          take: PAGE_SIZE,
          include: {
            endpoint: { select: { url: true, active: true } },
            store: { select: { id: true, name: true } },
          },
        }),
      ])
      return Response.json({
        deliveries,
        total,
        page,
        pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      })
    }

    const [endpoints, stores] = await Promise.all([
      db.webhookEndpoint.findMany({
        where: storeId ? { storeId } : undefined,
        orderBy: { createdAt: 'desc' },
        include: {
          store: { select: { id: true, name: true, active: true } },
          _count: { select: { deliveries: true } },
        },
      }),
      db.store.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    ])
    return Response.json({ endpoints, stores })
  } catch (err) {
    return jsonError(err)
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireRole(['ADMIN'])
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || typeof body !== 'object') throw new HttpError(400, 'Invalid JSON body')

    const storeId = typeof body.storeId === 'string' ? body.storeId.trim() : ''
    if (!storeId) throw new HttpError(400, 'Choose a store')
    const store = await db.store.findUnique({ where: { id: storeId }, select: { id: true, name: true } })
    if (!store) throw new HttpError(404, 'Store not found')

    const urlStr = typeof body.url === 'string' ? body.url.trim() : ''
    if (!urlStr || !isHttpUrl(urlStr)) throw new HttpError(400, 'A valid http(s) endpoint URL is required')

    const events = validateEvents(body.events)
    const secret = typeof body.secret === 'string' && body.secret.trim() ? body.secret.trim() : generateKey('wh', 24)

    const endpoint = await db.webhookEndpoint.create({
      data: { storeId, url: urlStr, events, secret },
    })
    await logActivity(user, 'webhook.endpoint_created', `store:${storeId}`, { url: urlStr, events })
    return Response.json({ endpoint }, { status: 201 })
  } catch (err) {
    return jsonError(err)
  }
}
