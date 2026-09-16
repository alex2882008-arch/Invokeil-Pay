import { db } from '@/lib/db'
import { requireRole, jsonError } from '@/lib/auth'
import { GATEWAY_CATALOG } from '@/lib/gateways'

/**
 * First call ever: seed the Gateway table with the full fixed catalog
 * (fields mapped 1:1 from GATEWAY_CATALOG). Code/mfs/category are immutable
 * afterwards — admins only configure the rest.
 */
async function seedGatewaysIfEmpty(): Promise<void> {
  const count = await db.gateway.count()
  if (count > 0) return
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
}

// ── GET: list (?enabled=1) or ?summary=1 ─────────────────────────────────────
export async function GET(req: Request) {
  try {
    await requireRole(['ADMIN', 'AGENT', 'VIEWER'])
    const url = new URL(req.url)
    await seedGatewaysIfEmpty()

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
