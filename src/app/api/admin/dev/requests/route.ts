import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError, safeInt } from '@/lib/auth'
import { DEV_ROLES } from '@/lib/roles'

// ── Developer Console: request inspector ─────────────────────────────────────
// GET  → recent inbound events (EventLedger types starting with 'checkout' or
//        'notify') + recent webhook deliveries — the inspector feed.
// POST { id } → full record (payload pretty-parsed) for a ledger event OR a
//        webhook delivery.

function parseJsonSafe(s: string | null | undefined): unknown {
  if (!s) return null
  try {
    return JSON.parse(s)
  } catch {
    return s
  }
}

export async function GET(req: Request) {
  try {
    await requireRole(DEV_ROLES)
    const url = new URL(req.url)
    const limit = Math.min(safeInt(url.searchParams.get('limit'), 15, 1), 50)

    const [ledger, deliveries] = await Promise.all([
      db.eventLedger.findMany({
        where: {
          OR: [{ type: { startsWith: 'checkout' } }, { type: { startsWith: 'notify' } }],
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: { id: true, type: true, status: true, subjectRef: true, createdAt: true },
      }),
      db.webhookDelivery.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true, event: true, status: true, httpCode: true, attempts: true, createdAt: true,
          store: { select: { name: true } },
        },
      }),
    ])

    return Response.json({
      ledger: ledger.map((e) => ({ kind: 'ledger', ...e })),
      deliveries: deliveries.map((d) => ({ kind: 'delivery', ...d, storeName: d.store?.name ?? '—' })),
    })
  } catch (err) {
    return jsonError(err)
  }
}

export async function POST(req: Request) {
  try {
    await requireRole(DEV_ROLES)
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const id = typeof b.id === 'string' ? b.id.trim() : ''
    if (!id) throw new HttpError(400, 'id is required')

    const ev = await db.eventLedger.findUnique({ where: { id } })
    if (ev) {
      return Response.json({
        kind: 'ledger',
        record: {
          id: ev.id,
          type: ev.type,
          status: ev.status,
          subjectRef: ev.subjectRef,
          idempotencyKey: ev.idempotencyKey,
          attempts: ev.attempts,
          error: ev.error,
          processedAt: ev.processedAt,
          createdAt: ev.createdAt,
          payload: parseJsonSafe(ev.payload),
        },
      })
    }

    const d = await db.webhookDelivery.findUnique({
      where: { id },
      include: {
        store: { select: { name: true } },
        endpoint: { select: { url: true } },
      },
    })
    if (d) {
      return Response.json({
        kind: 'delivery',
        record: {
          id: d.id,
          event: d.event,
          status: d.status,
          httpCode: d.httpCode,
          error: d.error,
          attempts: d.attempts,
          signature: d.signature,
          responseAt: d.responseAt,
          createdAt: d.createdAt,
          storeName: d.store?.name ?? '—',
          endpointUrl: d.endpoint?.url ?? null,
          payload: parseJsonSafe(d.payload),
        },
      })
    }

    throw new HttpError(404, 'Record not found')
  } catch (err) {
    return jsonError(err)
  }
}
