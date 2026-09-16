import { db } from '@/lib/db'
import {
  requireRole, jsonError, HttpError, generateKey, logActivity,
} from '@/lib/auth'

// ── Admin: API keys of one store ─────────────────────────────────────────────
// GET   → { keys }
// POST  { name, scopes?, expiresAt? } → { key }  (key = pk_…, shown once)

const ALLOWED_SCOPES = ['create_payment', 'verify_payment', 'refund_payment'] as const

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(['ADMIN', 'AGENT', 'VIEWER'])
    const { id } = await params
    const store = await db.store.findUnique({ where: { id }, select: { id: true } })
    if (!store) throw new HttpError(404, 'Store not found')
    const keys = await db.apiKey.findMany({
      where: { storeId: id },
      orderBy: { createdAt: 'desc' },
    })
    return Response.json({ keys })
  } catch (err) {
    return jsonError(err)
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(['ADMIN', 'AGENT'])
    const { id } = await params
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || typeof body !== 'object') throw new HttpError(400, 'Invalid JSON body')

    const store = await db.store.findUnique({ where: { id }, select: { id: true, name: true } })
    if (!store) throw new HttpError(404, 'Store not found')

    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) throw new HttpError(400, 'Key name is required')

    let scopes = 'create_payment,verify_payment'
    if (typeof body.scopes === 'string' && body.scopes.trim()) {
      const requested = body.scopes.split(',').map((s) => s.trim()).filter(Boolean)
      const invalid = requested.filter((s) => !(ALLOWED_SCOPES as readonly string[]).includes(s))
      if (invalid.length) throw new HttpError(400, `Unknown scope(s): ${invalid.join(', ')}`)
      if (!requested.length) throw new HttpError(400, 'Select at least one scope')
      scopes = [...new Set(requested)].join(',')
    }

    let expiresAt: Date | null = null
    if (typeof body.expiresAt === 'string' && body.expiresAt.trim()) {
      const d = new Date(body.expiresAt)
      if (isNaN(d.getTime())) throw new HttpError(400, 'Invalid expiry date')
      expiresAt = d
    }

    let key: { id: string; key: string } | null = null
    for (let i = 0; i < 4; i++) {
      try {
        key = await db.apiKey.create({
          data: { storeId: id, name, key: generateKey('pk'), scopes, expiresAt },
          select: { id: true, key: true },
        })
        break
      } catch (e) {
        if ((e as { code?: string })?.code === 'P2002' && i < 3) continue
        throw e
      }
    }
    if (!key) throw new HttpError(500, 'Could not generate a unique key')

    await logActivity(user, 'store.key_created', `store:${id}`, { name, keyId: key.id, scopes })
    return Response.json({ key: { ...key, name, scopes, expiresAt } }, { status: 201 })
  } catch (err) {
    return jsonError(err)
  }
}
