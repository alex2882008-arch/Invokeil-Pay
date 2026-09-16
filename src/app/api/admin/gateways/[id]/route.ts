import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError, logActivity } from '@/lib/auth'

type RouteCtx = { params: Promise<{ id: string }> }

const HEX = /^#[0-9a-fA-F]{6}$/
const ACCOUNT_TYPES = ['PERSONAL', 'AGENT', 'MERCHANT'] as const
const MAX_IMAGE_BYTES = 400_000 // ~400KB data-URL ceiling (500x250 logo / QR)

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

function hexColor(v: unknown, label: string): string {
  const s = typeof v === 'string' ? v.trim() : ''
  if (!HEX.test(s)) throw new HttpError(400, `${label} must be a hex value like #E2136E`)
  return s.toUpperCase()
}

/** Accept a small data-URL image (or clear with null/''). */
function imageDataUrl(v: unknown, label: string): string | null | undefined {
  if (v === null || v === '') return null
  if (typeof v !== 'string') return undefined
  if (!v.startsWith('data:image/')) throw new HttpError(400, `${label} must be an image upload`)
  if (v.length > MAX_IMAGE_BYTES) throw new HttpError(400, `${label} is too large (max ~300KB)`)
  return v
}

function optionalStr(v: unknown, maxLen = 500): string | null | undefined {
  if (v === undefined) return undefined
  if (v === null) return null
  if (typeof v !== 'string') return undefined
  const s = v.trim()
  return s === '' ? null : s.slice(0, maxLen)
}

// ── GET: single gateway (config masked) ──────────────────────────────────────
export async function GET(_req: Request, { params }: RouteCtx) {
  try {
    await requireRole(['ADMIN', 'AGENT', 'VIEWER'])
    const { id } = await params
    const gateway = await db.gateway.findUnique({ where: { id } })
    if (!gateway) throw new HttpError(404, 'Gateway not found')
    return Response.json({ gateway })
  } catch (err) {
    return jsonError(err)
  }
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

    if ('displayName' in b) {
      const v = optionalStr(b.displayName, 120)
      if (v !== undefined) data.displayName = v
    }

    if ('accountNumber' in b) {
      const v = optionalStr(b.accountNumber, 60)
      if (v !== undefined) data.accountNumber = v
    }
    if ('instructions' in b) {
      const v = optionalStr(b.instructions, 4000)
      if (v !== undefined) data.instructions = v
    }

    // Bank details
    if ('bankName' in b) { const v = optionalStr(b.bankName, 160); if (v !== undefined) data.bankName = v }
    if ('holderName' in b) { const v = optionalStr(b.holderName, 160); if (v !== undefined) data.holderName = v }
    if ('branchName' in b) { const v = optionalStr(b.branchName, 160); if (v !== undefined) data.branchName = v }
    if ('routingNumber' in b) { const v = optionalStr(b.routingNumber, 40); if (v !== undefined) data.routingNumber = v }
    if ('swiftCode' in b) { const v = optionalStr(b.swiftCode, 40); if (v !== undefined) data.swiftCode = v }

    // PipraPay-style universal configuration
    if ('allowPending' in b) {
      const v = String(b.allowPending ?? '').toUpperCase()
      if (v !== 'ENABLED' && v !== 'DISABLED') throw new HttpError(400, 'allowPending must be ENABLED or DISABLED')
      data.allowPending = v
    }
    if ('ipnUrl' in b) {
      const v = optionalStr(b.ipnUrl, 500)
      if (v !== undefined) {
        if (v && !/^https?:\/\//i.test(v)) throw new HttpError(400, 'IPN Url must start with http:// or https://')
        data.ipnUrl = v
      }
    }
    if ('mode' in b) {
      const v = optionalStr(b.mode, 20)
      if (v !== undefined) {
        if (v && v !== 'LIVE' && v !== 'SANDBOX') throw new HttpError(400, 'mode must be LIVE or SANDBOX')
        data.mode = v
      }
    }
    if ('supportedLanguages' in b) {
      const v = optionalStr(b.supportedLanguages, 60)
      if (v !== undefined) data.supportedLanguages = v
    }
    if ('currency' in b) {
      const v = optionalStr(b.currency, 8)
      if (v !== undefined) data.currency = v ? v.toUpperCase() : null
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

    // Colors — Primary / Text required-format; Button / Button text optional
    if ('color' in b) data.color = hexColor(b.color, 'color')
    if ('textColor' in b) data.textColor = hexColor(b.textColor, 'textColor')
    if ('buttonColor' in b) {
      const s = typeof b.buttonColor === 'string' ? b.buttonColor.trim() : ''
      if (s === '') data.buttonColor = null
      else data.buttonColor = hexColor(b.buttonColor, 'buttonColor')
    }
    if ('buttonText' in b) {
      const s = typeof b.buttonText === 'string' ? b.buttonText.trim() : ''
      if (s === '') data.buttonText = null
      else data.buttonText = hexColor(b.buttonText, 'buttonText')
    }

    // Assets — custom logo + QR image (data URLs)
    if ('logoUrl' in b) {
      const v = imageDataUrl(b.logoUrl, 'Gateway logo')
      if (v !== undefined) data.logoUrl = v
    }
    if ('qrImage' in b) {
      const v = imageDataUrl(b.qrImage, 'QR code')
      if (v !== undefined) data.qrImage = v
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

    // ── config JSON: merge; '' / '__KEEP__' keeps the stored secret ──
    if ('config' in b && b.config && typeof b.config === 'object' && !Array.isArray(b.config)) {
      const incoming = b.config as Record<string, unknown>
      let stored: Record<string, string> = {}
      try {
        const parsed = existing.config ? (JSON.parse(existing.config) as Record<string, unknown>) : {}
        if (parsed && typeof parsed === 'object') {
          for (const [k, v] of Object.entries(parsed)) stored[k] = String(v ?? '')
        }
      } catch { /* corrupt JSON — start fresh */ }
      for (const [k, v] of Object.entries(incoming)) {
        const s = typeof v === 'string' ? v : String(v ?? '')
        const sv = s.trim()
        if (sv === '' || sv === '__KEEP__') continue // keep existing secret
        if (/^••••/.test(sv)) continue // masked echo — never persist
        stored[k] = sv.slice(0, 500)
      }
      data.config = JSON.stringify(stored)
    }

    // code / mfs / category are deliberately NOT in the whitelist — immutable.

    const keys = Object.keys(data)
    if (keys.length === 0) throw new HttpError(400, 'Nothing to update')

    const gateway = await db.gateway.update({ where: { id }, data })
    await logActivity(user, 'gateway.updated', `gateway:${existing.code}`, { fields: keys })
    // Respond with masked config only — secrets never leave the server.
    let masked: Record<string, string> = {}
    try {
      const parsed = gateway.config ? (JSON.parse(gateway.config) as Record<string, unknown>) : {}
      for (const [k, v] of Object.entries(parsed)) {
        const s = String(v ?? '')
        masked[k] = s.length <= 4 && s.length > 0 ? '••••' : `••••${s.slice(-4)}`
      }
    } catch { /* ignore */ }
    return Response.json({ gateway: { ...gateway, config: masked } })
  } catch (err) {
    return jsonError(err)
  }
}

// ── DELETE: remove a configured gateway ──────────────────────────────────────
export async function DELETE(_req: Request, { params }: RouteCtx) {
  try {
    const user = await requireRole(['ADMIN'])
    const { id } = await params
    const existing = await db.gateway.findUnique({ where: { id } })
    if (!existing) throw new HttpError(404, 'Gateway not found')
    await db.gateway.delete({ where: { id } })
    await logActivity(user, 'gateway.deleted', `gateway:${existing.code}`)
    return Response.json({ ok: true })
  } catch (err) {
    return jsonError(err)
  }
}
