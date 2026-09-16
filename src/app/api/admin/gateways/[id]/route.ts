import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError, logActivity } from '@/lib/auth'

type RouteCtx = { params: Promise<{ id: string }> }

const HEX = /^#[0-9a-fA-F]{6}$/
const ACCOUNT_TYPES = ['PERSONAL', 'AGENT', 'MERCHANT'] as const

/** Coerce to a finite number, or undefined when the value is unusable. */
function num(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  return Number.isFinite(n) ? n : undefined
}

/** Nullable money amount: '' / null clears the limit. */
function numOrNull(v: unknown): number | null | undefined {
  if (v === null || (typeof v === 'string' && v.trim() === '')) return null
  const n = num(v)
  return n === undefined ? undefined : n
}

// ── PATCH: configure a gateway (code/mfs/category immutable) ────────────────
export async function PATCH(req: Request, { params }: RouteCtx) {
  try {
    const user = await requireRole(['ADMIN'])
    const { id } = await params
    const existing = await db.gateway.findUnique({ where: { id } })
    if (!existing) throw new HttpError(404, 'Gateway not found')

    const body: unknown = await req.json().catch(() => ({}))
    const b = (body ?? {}) as Record<string, unknown>

    const data: Record<string, string | number | boolean | null> = {}

    if (typeof b.enabled === 'boolean') data.enabled = b.enabled

    if (typeof b.name === 'string') {
      const name = b.name.trim()
      if (!name) throw new HttpError(400, 'Name is required')
      data.name = name
    }

    if ('accountNumber' in b) {
      const v = typeof b.accountNumber === 'string' ? b.accountNumber.trim() : null
      data.accountNumber = v === '' ? null : v
    }
    if ('instructions' in b) {
      const v = typeof b.instructions === 'string' ? b.instructions.trim() : null
      data.instructions = v === '' ? null : v
    }

    if ('minAmount' in b) {
      const v = numOrNull(b.minAmount)
      if (v !== undefined) {
        if (v !== null && v < 0) throw new HttpError(400, 'Min amount cannot be negative')
        data.minAmount = v
      }
    }
    if ('maxAmount' in b) {
      const v = numOrNull(b.maxAmount)
      if (v !== undefined) {
        if (v !== null && v < 0) throw new HttpError(400, 'Max amount cannot be negative')
        data.maxAmount = v
      }
    }

    // Charges & discounts: >= 0, percents capped at 100
    const nonNeg = (key: string, v: unknown): number => {
      const n = num(v)
      if (n === undefined || n < 0) throw new HttpError(400, `${key} must be a number ≥ 0`)
      return n
    }
    if ('chargeFixed' in b) data.chargeFixed = nonNeg('chargeFixed', b.chargeFixed)
    if ('discountFixed' in b) data.discountFixed = nonNeg('discountFixed', b.discountFixed)
    if ('chargePercent' in b) {
      const n = nonNeg('chargePercent', b.chargePercent)
      if (n > 100) throw new HttpError(400, 'chargePercent cannot exceed 100')
      data.chargePercent = n
    }
    if ('discountPercent' in b) {
      const n = nonNeg('discountPercent', b.discountPercent)
      if (n > 100) throw new HttpError(400, 'discountPercent cannot exceed 100')
      data.discountPercent = n
    }

    if ('color' in b) {
      const v = typeof b.color === 'string' ? b.color.trim() : ''
      if (!HEX.test(v)) throw new HttpError(400, 'color must be a hex value like #E2136E')
      data.color = v.toUpperCase()
    }
    if ('textColor' in b) {
      const v = typeof b.textColor === 'string' ? b.textColor.trim() : ''
      if (!HEX.test(v)) throw new HttpError(400, 'textColor must be a hex value like #FFFFFF')
      data.textColor = v.toUpperCase()
    }

    if ('icon' in b) {
      const v = typeof b.icon === 'string' ? b.icon.trim() : null
      data.icon = v === '' ? null : v?.slice(0, 8) ?? null
    }

    if ('accountType' in b) {
      const v = typeof b.accountType === 'string' ? b.accountType : ''
      if (!ACCOUNT_TYPES.includes(v as (typeof ACCOUNT_TYPES)[number])) {
        throw new HttpError(400, 'accountType must be PERSONAL, AGENT or MERCHANT')
      }
      data.accountType = v
    }

    if ('sortOrder' in b) {
      const n = num(b.sortOrder)
      if (n === undefined) throw new HttpError(400, 'sortOrder must be an integer')
      data.sortOrder = Math.round(n)
    }

    // code / mfs / category are deliberately NOT in the whitelist — immutable.

    const keys = Object.keys(data)
    if (keys.length === 0) throw new HttpError(400, 'Nothing to update')

    const gateway = await db.gateway.update({ where: { id }, data })
    await logActivity(user, 'gateway.updated', `gateway:${existing.code}`, { fields: keys })
    return Response.json({ gateway })
  } catch (err) {
    return jsonError(err)
  }
}
