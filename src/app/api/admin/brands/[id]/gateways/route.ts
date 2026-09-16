import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError, logActivity } from '@/lib/auth'

function str(v: unknown, max = 320): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

type Ctx = { params: Promise<{ id: string }> }

async function brandExists(id: string): Promise<boolean> {
  const brand = await db.brand.findUnique({ where: { id }, select: { id: true } })
  return !!brand
}

/** GET /api/admin/brands/[id]/gateways — this brand's per-gateway configuration rows. */
export async function GET(_req: Request, ctx: Ctx) {
  try {
    await requireRole(['OWNER', 'ADMIN', 'FINANCE', 'AGENT', 'VIEWER'])
    const { id } = await ctx.params
    if (!(await brandExists(id))) throw new HttpError(404, 'Brand not found')
    const items = await db.brandGateway.findMany({ where: { brandId: id }, orderBy: { gatewayCode: 'asc' } })
    return Response.json({ ok: true, data: { items } })
  } catch (e) {
    return jsonError(e)
  }
}

/**
 * PUT /api/admin/brands/[id]/gateways — upsert one gateway config for the brand.
 * { gatewayCode, enabled?, accountNumber?, instructions?, chargeFixed?, chargePercent? }
 */
export async function PUT(req: Request, ctx: Ctx) {
  try {
    const me = await requireRole(['OWNER', 'ADMIN', 'FINANCE'])
    const { id } = await ctx.params
    if (!(await brandExists(id))) throw new HttpError(404, 'Brand not found')

    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const gatewayCode = str(b.gatewayCode, 80)
    if (!gatewayCode) throw new HttpError(400, 'gatewayCode is required')

    const gateway = await db.gateway.findUnique({ where: { code: gatewayCode }, select: { code: true } })
    if (!gateway) throw new HttpError(400, `Unknown gateway code "${gatewayCode}"`)

    const data: {
      enabled: boolean
      accountNumber?: string | null
      instructions?: string | null
      chargeFixed?: number
      chargePercent?: number
    } = { enabled: b.enabled == null ? true : Boolean(b.enabled) }

    if (b.accountNumber !== undefined) data.accountNumber = str(b.accountNumber, 120) || null
    if (b.instructions !== undefined) data.instructions = str(b.instructions, 2000) || null
    if (b.chargeFixed !== undefined) {
      const n = Number(b.chargeFixed)
      if (!Number.isFinite(n) || n < 0) throw new HttpError(400, 'chargeFixed must be a non-negative number')
      data.chargeFixed = Math.round(n * 100) / 100
    }
    if (b.chargePercent !== undefined) {
      const n = Number(b.chargePercent)
      if (!Number.isFinite(n) || n < 0 || n > 100) throw new HttpError(400, 'chargePercent must be between 0 and 100')
      data.chargePercent = Math.round(n * 100) / 100
    }

    const row = await db.brandGateway.upsert({
      where: { brandId_gatewayCode: { brandId: id, gatewayCode } },
      update: data,
      create: { brandId: id, gatewayCode, ...data },
    })
    await logActivity(me, 'brand.gateway.saved', `brand:${id}`, { gatewayCode, enabled: row.enabled })
    return Response.json({ ok: true, data: row })
  } catch (e) {
    return jsonError(e)
  }
}

/** DELETE /api/admin/brands/[id]/gateways?gatewayCode=BKASH_PERSONAL — remove the override. */
export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const me = await requireRole(['OWNER', 'ADMIN', 'FINANCE'])
    const { id } = await ctx.params
    const gatewayCode = new URL(req.url).searchParams.get('gatewayCode')?.trim() ?? ''
    if (!gatewayCode) throw new HttpError(400, 'gatewayCode query param is required')

    const existing = await db.brandGateway.findUnique({
      where: { brandId_gatewayCode: { brandId: id, gatewayCode } },
    })
    if (!existing) throw new HttpError(404, 'Gateway config not found for this brand')

    await db.brandGateway.delete({ where: { id: existing.id } })
    await logActivity(me, 'brand.gateway.removed', `brand:${id}`, { gatewayCode })
    return Response.json({ ok: true, data: { gatewayCode } })
  } catch (e) {
    return jsonError(e)
  }
}
