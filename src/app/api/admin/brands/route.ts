import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError, logActivity } from '@/lib/auth'

function str(v: unknown, max = 320): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

const COLOR_RE = /^#[0-9a-fA-F]{6}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function slugify(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
  return base || 'brand'
}

async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name)
  let candidate = base
  let n = 2
  // Bounded loop: enough for realistic name collisions
  for (let i = 0; i < 50; i++) {
    const clash = await db.brand.findUnique({ where: { slug: candidate }, select: { id: true } })
    if (!clash) return candidate
    candidate = `${base}-${n++}`
  }
  return `${base}-${Date.now().toString(36)}`
}

/** GET /api/admin/brands — brands + per-brand gateway configs + usage counts. */
export async function GET() {
  try {
    await requireRole(['OWNER', 'ADMIN', 'FINANCE', 'AGENT', 'VIEWER'])
    const [brands, gateways, customerGroups, checkoutGroups, invoiceGroups] = await Promise.all([
      db.brand.findMany({ orderBy: { createdAt: 'asc' } }),
      db.brandGateway.findMany({ orderBy: { gatewayCode: 'asc' } }),
      db.customer.groupBy({ by: ['brandId'], _count: { _all: true } }),
      db.checkoutPage.groupBy({ by: ['brandId'], _count: { _all: true } }),
      db.invoice.groupBy({ by: ['brandId'], _count: { _all: true } }),
    ])

    const items = brands.map((brand) => ({
      ...brand,
      gatewayConfigs: gateways.filter((g) => g.brandId === brand.id),
      counts: {
        customers: customerGroups.find((c) => c.brandId === brand.id)?._count._all ?? 0,
        checkouts: checkoutGroups.find((c) => c.brandId === brand.id)?._count._all ?? 0,
        invoices: invoiceGroups.find((c) => c.brandId === brand.id)?._count._all ?? 0,
      },
    }))
    return Response.json({ ok: true, data: { items } })
  } catch (e) {
    return jsonError(e)
  }
}

/**
 * POST /api/admin/brands — { name, color?, domain?, supportEmail?, supportPhone?, emailFromName?, currency?, locale?, active? }
 * Slug is auto-generated from the name and unique-ified.
 */
export async function POST(req: Request) {
  try {
    const me = await requireRole(['OWNER', 'ADMIN'])
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const name = str(b.name, 120)
    if (!name) throw new HttpError(400, 'name is required')

    const color = str(b.color, 7) || '#2563EB'
    if (!COLOR_RE.test(color)) throw new HttpError(400, 'color must be a hex value like #2563EB')
    const domain = str(b.domain, 200) || null
    const supportEmail = str(b.supportEmail, 200) || null
    if (supportEmail && !EMAIL_RE.test(supportEmail)) throw new HttpError(400, 'supportEmail must be a valid email address')
    const supportPhone = str(b.supportPhone, 40) || null
    const emailFromName = str(b.emailFromName, 120) || null
    const currency = (str(b.currency, 8) || 'BDT').toUpperCase()
    const locale = str(b.locale, 8) || 'en'
    const active = b.active == null ? true : Boolean(b.active)

    const slug = await uniqueSlug(name)
    const row = await db.brand.create({
      data: { name, slug, color, domain, supportEmail, supportPhone, emailFromName, currency, locale, active },
    })
    await logActivity(me, 'brand.created', `brand:${row.id}`, { name, slug })
    return Response.json({ ok: true, data: { id: row.id, slug: row.slug } }, { status: 201 })
  } catch (e) {
    return jsonError(e)
  }
}
