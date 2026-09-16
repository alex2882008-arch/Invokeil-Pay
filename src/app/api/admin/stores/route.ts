import { db } from '@/lib/db'
import {
  requireRole, jsonError, HttpError, safeInt, generateKey, logActivity,
} from '@/lib/auth'

// ── Admin: Merchant stores (Merchants & API) ─────────────────────────────────
// GET  ?page&q      → { stores(+_count.checkouts + apiKeys), total, page, pages }
// GET  ?summary=1   → { summary: { total, active, keys } }
// POST { name, contactEmail?, webhookUrl? } → { store }  (ADMIN/AGENT)

const PAGE_SIZE = 20

function isHttpUrl(v: string): boolean {
  try {
    const u = new URL(v)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

async function createUniqueStore(data: { name: string; contactEmail: string | null; webhookUrl: string | null }) {
  for (let i = 0; i < 4; i++) {
    try {
      return await db.store.create({
        data: { ...data, apiKey: generateKey('sk'), secret: generateKey('wh', 24) },
      })
    } catch (e) {
      // P2002 = unique violation (apiKey collision is astronomically rare, retry anyway)
      if ((e as { code?: string })?.code === 'P2002' && i < 3) continue
      throw e
    }
  }
  throw new HttpError(500, 'Could not generate a unique API key')
}

export async function GET(req: Request) {
  try {
    await requireRole(['ADMIN', 'AGENT', 'VIEWER'])
    const url = new URL(req.url)

    if (url.searchParams.get('summary') === '1') {
      const [total, active, keys] = await Promise.all([
        db.store.count(),
        db.store.count({ where: { active: true } }),
        db.apiKey.count(),
      ])
      return Response.json({ summary: { total, active, keys } })
    }

    const q = url.searchParams.get('q')?.trim()
    const page = safeInt(url.searchParams.get('page'), 1)
    const where: Record<string, unknown> = q
      ? { OR: [{ name: { contains: q } }, { contactEmail: { contains: q } }] }
      : {}

    const [total, stores] = await Promise.all([
      db.store.count({ where }),
      db.store.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: { _count: { select: { checkouts: true, apiKeys: true } } },
      }),
    ])

    return Response.json({
      stores,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    })
  } catch (err) {
    return jsonError(err)
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireRole(['ADMIN', 'AGENT'])
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || typeof body !== 'object') throw new HttpError(400, 'Invalid JSON body')

    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) throw new HttpError(400, 'Store name is required')

    const contactEmail = typeof body.contactEmail === 'string' ? body.contactEmail.trim() || null : null
    if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
      throw new HttpError(400, 'Invalid contact email')
    }
    const webhookUrl = typeof body.webhookUrl === 'string' ? body.webhookUrl.trim() || null : null
    if (webhookUrl && !isHttpUrl(webhookUrl)) throw new HttpError(400, 'Webhook URL must be a valid http(s) URL')

    const store = await createUniqueStore({ name, contactEmail, webhookUrl })

    await logActivity(user, 'store.created', `store:${store.id}`, { name: store.name })
    return Response.json({ store }, { status: 201 })
  } catch (err) {
    return jsonError(err)
  }
}
