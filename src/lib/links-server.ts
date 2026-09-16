import { db } from '@/lib/db'
import { HttpError, randomToken } from '@/lib/auth'

// ── Server-side helpers shared by the admin links API and the public link API ──

export interface CustomFieldDef {
  name: string
  label: string
  required: boolean
}

export function safeJsonParse<T>(v: string | null | undefined, fallback: T): T {
  if (!v) return fallback
  try {
    return JSON.parse(v) as T
  } catch {
    return fallback
  }
}

/** Kebab-case slug from a title (unicode-letter aware — Bangla titles keep their letters). */
export function slugifyTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '')
  return slug || 'link'
}

/** First free slug: base, base-2, base-3… (optionally ignoring one row's own id). */
export async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  const clean = slugifyTitle(base)
  let candidate = clean
  for (let i = 2; i <= 500; i++) {
    const existing = await db.paymentLink.findUnique({ where: { slug: candidate }, select: { id: true } })
    if (!existing || existing.id === excludeId) return candidate
    candidate = `${clean}-${i}`
  }
  // realistically unreachable; fall back to a random suffix
  return `${clean}-${randomToken(4).toLowerCase()}`
}

export function isValidHttpUrl(v: string): boolean {
  try {
    const u = new URL(v)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

function parseMoney(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null
}

export function parseExpiry(v: unknown): Date | null {
  if (v == null || v === '') return null
  const d = new Date(String(v))
  return isNaN(d.getTime()) ? null : d
}

/** Validate + normalize customFields input; returns null when invalid. */
export function sanitizeCustomFields(raw: unknown): CustomFieldDef[] | null {
  if (raw == null) return []
  if (!Array.isArray(raw)) return null
  if (raw.length > 10) return null
  const out: CustomFieldDef[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null
    const name = String((item as Record<string, unknown>).name ?? '').trim()
    const label = String((item as Record<string, unknown>).label ?? '').trim()
    const required = Boolean((item as Record<string, unknown>).required)
    if (!name || !label || name.length > 60 || label.length > 80) return null
    const key = name.toLowerCase()
    if (seen.has(key)) return null
    seen.add(key)
    out.push({ name, label, required })
  }
  return out
}

export interface LinkLikeRow {
  title: string
  description: string | null
  amountType: string
  amount: number
  minAmount: number | null
  maxAmount: number | null
  gatewayCode: string | null
  customFields: string | null
  usageLimit: number | null
  expiresAt: Date | null
  successUrl: string | null
  cancelUrl: string | null
}

export interface LinkData extends Omit<LinkLikeRow, 'customFields'> {
  customFields: string
}

interface LinkPayload {
  title?: unknown
  description?: unknown
  amountType?: unknown
  amount?: unknown
  minAmount?: unknown
  maxAmount?: unknown
  gatewayCode?: unknown
  customFields?: unknown
  usageLimit?: unknown
  expiresAt?: unknown
  successUrl?: unknown
  cancelUrl?: unknown
}

/**
 * Build validated Prisma data from a payload. `existing` = current row for PATCH merges
 * (fields absent from the payload fall back to the row). Throws HttpError(400) on bad input.
 */
export function buildLinkData(payload: LinkPayload, existing?: LinkLikeRow | null): LinkData {
  const src = (key: keyof LinkPayload, fallback: unknown): unknown =>
    key in payload ? payload[key] : fallback

  const title = String(src('title', existing?.title ?? '')).trim()
  if (!title) throw new HttpError(400, 'Title is required')
  if (title.length > 120) throw new HttpError(400, 'Title is too long (max 120 chars)')

  const descriptionRaw = src('description', existing?.description)
  const description = descriptionRaw == null || descriptionRaw === '' ? null : String(descriptionRaw).slice(0, 500)

  const amountType = String(src('amountType', existing?.amountType ?? 'FIXED')).toUpperCase()
  if (amountType !== 'FIXED' && amountType !== 'VARIABLE') throw new HttpError(400, 'amountType must be FIXED or VARIABLE')

  const amount = parseMoney(src('amount', existing?.amount ?? 0))
  if (amount == null) throw new HttpError(400, 'Invalid amount')

  if (amountType === 'FIXED' && amount <= 0) {
    throw new HttpError(400, 'Fixed links need an amount greater than 0')
  }

  const minAmount = parseMoney(src('minAmount', existing?.minAmount))
  const maxAmount = parseMoney(src('maxAmount', existing?.maxAmount))

  if (amountType === 'VARIABLE') {
    if (minAmount == null || minAmount <= 0) throw new HttpError(400, 'Variable links need minAmount > 0')
    if (maxAmount == null || maxAmount < minAmount) throw new HttpError(400, 'maxAmount must be ≥ minAmount')
  }

  const gatewayRaw = src('gatewayCode', existing?.gatewayCode)
  const gatewayCode = gatewayRaw == null || gatewayRaw === '' ? null : String(gatewayRaw).slice(0, 60)

  const fields = sanitizeCustomFields(src('customFields', existing ? safeJsonParse(existing.customFields, []) : []))
  if (fields == null) throw new HttpError(400, 'customFields must be a list of { name, label, required }')

  const usageLimitRaw = src('usageLimit', existing?.usageLimit)
  let usageLimit: number | null = null
  if (usageLimitRaw != null && usageLimitRaw !== '') {
    const n = typeof usageLimitRaw === 'string' ? parseInt(usageLimitRaw, 10) : Number(usageLimitRaw)
    if (!Number.isFinite(n) || n < 1) throw new HttpError(400, 'usageLimit must be ≥ 1')
    usageLimit = Math.floor(n)
  }

  const expiresRaw = src('expiresAt', existing?.expiresAt)
  const expiresAt = parseExpiry(expiresRaw instanceof Date ? expiresRaw.toISOString() : expiresRaw)

  const urlErr = 'successUrl/cancelUrl must be valid http(s) URLs'
  const successRaw = src('successUrl', existing?.successUrl)
  const successUrl = successRaw == null || successRaw === '' ? null : String(successRaw).trim()
  if (successUrl && !isValidHttpUrl(successUrl)) throw new HttpError(400, urlErr)
  const cancelRaw = src('cancelUrl', existing?.cancelUrl)
  const cancelUrl = cancelRaw == null || cancelRaw === '' ? null : String(cancelRaw).trim()
  if (cancelUrl && !isValidHttpUrl(cancelUrl)) throw new HttpError(400, urlErr)

  return {
    title,
    description,
    amountType,
    amount: amountType === 'FIXED' ? amount : 0,
    minAmount: amountType === 'VARIABLE' ? minAmount : null,
    maxAmount: amountType === 'VARIABLE' ? maxAmount : null,
    gatewayCode,
    customFields: JSON.stringify(fields),
    usageLimit,
    expiresAt,
    successUrl,
    cancelUrl,
  }
}
