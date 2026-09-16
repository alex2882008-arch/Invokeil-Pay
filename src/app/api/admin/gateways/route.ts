import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError, logActivity } from '@/lib/auth'
import { GATEWAY_CATALOG } from '@/lib/gateways'

/**
 * Gateways collection API — PipraPay-style.
 *
 * The Gateway table holds CONFIGURED gateway instances only. Fresh installs
 * start empty ("Nothing Here Yet") and the admin adds gateways via
 * POST { code } (catalog select) or POST { bank: true } (New Bank form).
 * Secrets inside `config` are never returned — masked on every read.
 */

// ── Config masking: secrets never leave the server ──────────────────────────

export function maskSecret(v: string): string {
  if (!v) return ''
  if (v.length <= 4) return '••••'
  return `••••${v.slice(-4)}`
}

export function maskConfig(configJson: string | null): Record<string, string> {
  if (!configJson) return {}
  try {
    const cfg = JSON.parse(configJson) as Record<string, unknown>
    if (!cfg || typeof cfg !== 'object') return {}
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(cfg)) {
      out[k] = typeof v === 'string' ? maskSecret(v) : String(v ?? '')
    }
    return out
  } catch {
    return {}
  }
}

// ── GET: list (?enabled=1) or ?summary=1 or ?catalog=1 ───────────────────────
export async function GET(req: Request) {
  try {
    await requireRole(['ADMIN', 'AGENT', 'VIEWER'])
    const url = new URL(req.url)

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

    // Catalog for the "New Gateway" picker: every known gateway that is not
    // configured yet, each with its own type/method metadata.
    if (url.searchParams.get('catalog')) {
      const rows = await db.gateway.findMany({ select: { code: true } })
      const known = new Set(rows.map((r) => r.code))
      const catalog = GATEWAY_CATALOG.filter((g) => !known.has(g.code)).map((g) => ({
        code: g.code,
        name: g.name,
        mfs: g.mfs,
        category: g.category,
        type: g.type,
        accountType: g.accountType,
        color: g.color,
        textColor: g.textColor ?? '#FFFFFF',
        method: g.method,
        hasQr: g.hasQr ?? false,
        apiFields: g.apiFields ?? null,
        instructions: g.instructions ?? null,
      }))
      return Response.json({ catalog })
    }

    const where: Record<string, unknown> = {}
    if (url.searchParams.get('enabled') === '1') where.enabled = true

    const gateways = await db.gateway.findMany({ where, orderBy: { sortOrder: 'asc' } })
    return Response.json({
      gateways: gateways.map((g) => ({ ...g, config: maskConfig(g.config) })),
    })
  } catch (err) {
    return jsonError(err)
  }
}

// ── POST: create from catalog code or a custom bank gateway ─────────────────

function slugify(s: string): string {
  return s
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
}

export async function POST(req: Request) {
  try {
    const user = await requireRole(['ADMIN'])
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>

    // ── New Bank: custom bank gateway from the "New Bank" form ──
    if (body.bank === true) {
      const name = String(body.name ?? '').trim()
      if (!name) throw new HttpError(400, 'Gateway Name is required')
      let code = slugify(String(body.code ?? '')) || `BANK_${slugify(name)}`
      if (await db.gateway.findUnique({ where: { code } })) {
        code = `${code}_${Date.now().toString(36).slice(-4).toUpperCase()}`
      }
      const maxOrder = await db.gateway.aggregate({ _max: { sortOrder: true } })
      const gateway = await db.gateway.create({
        data: {
          code,
          name,
          displayName: String(body.displayName ?? '').trim() || null,
          mfs: 'BANK',
          category: 'BANK',
          type: 'MANUAL',
          accountType: 'PERSONAL',
          enabled: body.enabled === false ? false : true,
          color: typeof body.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(body.color) ? body.color.toUpperCase() : '#475569',
          textColor: typeof body.textColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(body.textColor) ? body.textColor.toUpperCase() : '#FFFFFF',
          logoUrl: typeof body.logoUrl === 'string' ? body.logoUrl.slice(0, 400_000) : null,
          accountNumber: typeof body.accountNumber === 'string' ? body.accountNumber.trim() || null : null,
          bankName: String(body.bankName ?? '').trim() || null,
          holderName: String(body.holderName ?? '').trim() || null,
          branchName: String(body.branchName ?? '').trim() || null,
          routingNumber: String(body.routingNumber ?? '').trim() || null,
          swiftCode: String(body.swiftCode ?? '').trim() || null,
          allowPending: body.allowPending === 'DISABLED' ? 'DISABLED' : 'ENABLED',
          supportedLanguages: typeof body.supportedLanguages === 'string' ? body.supportedLanguages : null,
          currency: typeof body.currency === 'string' ? body.currency.trim().toUpperCase() || null : null,
          minAmount: typeof body.minAmount === 'number' ? body.minAmount : null,
          maxAmount: typeof body.maxAmount === 'number' ? body.maxAmount : null,
          chargeFixed: typeof body.chargeFixed === 'number' ? body.chargeFixed : 0,
          chargePercent: typeof body.chargePercent === 'number' ? body.chargePercent : 0,
          discountFixed: typeof body.discountFixed === 'number' ? body.discountFixed : 0,
          discountPercent: typeof body.discountPercent === 'number' ? body.discountPercent : 0,
          instructions: typeof body.instructions === 'string' ? body.instructions.trim() || null : null,
          sortOrder: (maxOrder._max.sortOrder ?? 200) + 1,
        },
      })
      await logActivity(user, 'gateway.created', `gateway:${gateway.code}`, { kind: 'bank' })
      return Response.json({ gateway: { ...gateway, config: {} } }, { status: 201 })
    }

    // ── New Gateway: instantiate a catalog gateway by code ──
    const code = String(body.code ?? '').trim().toUpperCase()
    if (!code) throw new HttpError(400, 'Gateway code is required')
    const seed = GATEWAY_CATALOG.find((g) => g.code === code)
    if (!seed) throw new HttpError(404, 'Unknown gateway code')
    if (await db.gateway.findUnique({ where: { code } })) {
      throw new HttpError(409, 'This gateway is already configured')
    }
    const maxOrder = await db.gateway.aggregate({ _max: { sortOrder: true } })
    const gateway = await db.gateway.create({
      data: {
        code: seed.code,
        name: seed.name,
        mfs: seed.mfs,
        category: seed.category,
        type: seed.type,
        accountType: seed.accountType,
        color: seed.color,
        textColor: seed.textColor ?? '#FFFFFF',
        icon: seed.icon ?? null,
        allowPending: 'ENABLED',
        enabled: true,
        instructions: seed.instructions ?? null,
        sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
      },
    })
    await logActivity(user, 'gateway.created', `gateway:${gateway.code}`, { kind: 'catalog' })
    return Response.json({ gateway: { ...gateway, config: {} } }, { status: 201 })
  } catch (err) {
    return jsonError(err)
  }
}
