import { db } from '@/lib/db'
import { requireRole, jsonError } from '@/lib/auth'
import { GATEWAY_CATALOG } from '@/lib/gateways'

/**
 * Sync the Gateway table with the fixed catalog: seeds on first call, then
 * adds any gateway that appeared in the catalog later (e.g. new PipraPay
 * parity entries). Admin-configured fields are never overwritten.
 */
async function syncGateways(): Promise<void> {
  const existing = await db.gateway.findMany({ select: { code: true }, orderBy: { sortOrder: 'asc' } })
  if (existing.length === 0) {
    await db.gateway.createMany({
      data: GATEWAY_CATALOG.map((g) => ({
        code: g.code,
        name: g.name,
        mfs: g.mfs,
        category: g.category,
        type: g.type,
        accountType: g.accountType,
        color: g.color,
        textColor: g.textColor ?? '#FFFFFF',
        icon: g.icon ?? null,
        sortOrder: g.sortOrder,
        instructions: g.instructions ?? null,
      })),
    })
    return
  }
  const known = new Set(existing.map((e) => e.code))
  const missing = GATEWAY_CATALOG.filter((g) => !known.has(g.code))
  if (missing.length === 0) return
  // Insert one-by-one — codes are unique and concurrent admin edits are rare.
  for (const g of missing) {
    await db.gateway
      .create({
        data: {
          code: g.code,
          name: g.name,
          mfs: g.mfs,
          category: g.category,
          type: g.type,
          accountType: g.accountType,
          color: g.color,
          textColor: g.textColor ?? '#FFFFFF',
          icon: g.icon ?? null,
          sortOrder: g.sortOrder,
          instructions: g.instructions ?? null,
        },
      })
      .catch(() => undefined) // unique race — harmless
  }
}

// ── GET: list (?enabled=1) or ?summary=1 ─────────────────────────────────────
export async function GET(req: Request) {
  try {
    await requireRole(['ADMIN', 'AGENT', 'VIEWER'])
    const url = new URL(req.url)
    await syncGateways()

    if (url.searchParams.get('summary')) {
      const [total, enabled, mfs, bank, global] = await Promise.all([
        db.gateway.count(),
        db.gateway.count({ where: { enabled: true } }),
        db.gateway.count({ where: { category: 'MFS' } }),
        db.gateway.count({ where: { category: 'BANK' } }),
        db.gateway.count({ where: { category: 'GLOBAL' } }),
      ])
      return Response.json({
        total,
        enabled,
        byCategory: { MFS: mfs, BANK: bank, GLOBAL: global },
      })
    }

    const where: Record<string, unknown> = {}
    if (url.searchParams.get('enabled') === '1') where.enabled = true

    const gateways = await db.gateway.findMany({ where, orderBy: { sortOrder: 'asc' } })
    return Response.json({ gateways })
  } catch (err) {
    return jsonError(err)
  }
}
