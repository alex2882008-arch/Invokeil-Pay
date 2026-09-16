import { db } from '@/lib/db'
import { requireRole, jsonError } from '@/lib/auth'
import { DEV_ROLES } from '@/lib/roles'
import { getMergedSettings } from '@/lib/settings-defaults'

// ── Developer Console: GET overview ──────────────────────────────────────────
// Stores (masked keys + scopes), webhook endpoints, 24h delivery stats,
// recent EventLedger rows and global counts. Never returns a full key.

function maskKey(key: string): string {
  if (key.length <= 12) return `${key.slice(0, 4)}…`
  return `${key.slice(0, 8)}…${key.slice(-4)}`
}

function parseScopes(scopes: string): string[] {
  return scopes.split(',').map((s) => s.trim()).filter(Boolean)
}

export async function GET(req: Request) {
  try {
    await requireRole(DEV_ROLES)

    const since24h = new Date(Date.now() - 24 * 3600_000)

    const [settings, stores, endpoints, d24, ledger, processed, deduped, keyCount] = await Promise.all([
      getMergedSettings(),
      db.store.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          apiKeys: { orderBy: { createdAt: 'desc' } },
          _count: { select: { apiKeys: true } },
        },
      }),
      db.webhookEndpoint.findMany({
        orderBy: { createdAt: 'desc' },
        include: { store: { select: { id: true, name: true } } },
      }),
      db.webhookDelivery.groupBy({
        by: ['status'],
        where: { createdAt: { gte: since24h } },
        _count: { _all: true },
      }),
      db.eventLedger.findMany({
        orderBy: { createdAt: 'desc' },
        take: 25,
        select: { id: true, type: true, status: true, subjectRef: true, createdAt: true },
      }),
      db.eventLedger.count({ where: { status: 'PROCESSED' } }),
      db.eventLedger.count({ where: { status: 'DEDUPED' } }),
      db.apiKey.count(),
    ])

    const d24map: Record<string, number> = { SUCCESS: 0, FAILED: 0, PENDING: 0 }
    for (const g of d24) d24map[g.status] = g._count._all
    const success = d24map.SUCCESS ?? 0
    const failed = d24map.FAILED ?? 0
    const successRate = success + failed > 0 ? Math.round((success / (success + failed)) * 100) : null

    return Response.json({
      appMode: settings.appMode === 'PRODUCTION' ? 'PRODUCTION' : 'SANDBOX',
      stores: stores.map((s) => ({
        id: s.id,
        name: s.name,
        active: s.active,
        sandbox: s.sandbox,
        master: { prefix: maskKey(s.apiKey), scopes: ['create_payment', 'verify_payment', 'refund_payment'] },
        keys: s.apiKeys.map((k) => ({
          id: k.id,
          name: k.name,
          prefix: maskKey(k.key),
          scopes: parseScopes(k.scopes),
          sandbox: k.sandbox,
          active: k.active,
        })),
        keyCount: s._count.apiKeys,
      })),
      endpoints: endpoints.map((e) => ({
        id: e.id,
        url: e.url,
        events: e.events,
        active: e.active,
        storeId: e.storeId,
        storeName: e.store?.name ?? '—',
      })),
      stats: {
        d24: { success, failed, pending: d24map.PENDING ?? 0 },
        successRate,
        counts: { keys: keyCount, endpoints: endpoints.length, eventsProcessed: processed, eventsDeduped: deduped },
      },
      ledger,
    })
  } catch (err) {
    return jsonError(err)
  }
}
