import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError, logActivity } from '@/lib/auth'

// ── Security Center v2: IP allowlist ─────────────────────────────────────────
// GET → { items: string[] }                  (Setting key 'ipAllowlist', JSON array)
// PUT { items: string[] } → { items }        (OWNER/ADMIN — validates IP / CIDR)

const IPV4_CIDR = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/
const MAX_ENTRIES = 100

function validEntry(v: string): boolean {
  if (!IPV4_CIDR.test(v)) return false
  const octets = v.split('/')[0].split('.').map(Number)
  if (octets.some((n) => n < 0 || n > 255)) return false
  if (v.includes('/')) {
    const prefix = Number(v.split('/')[1])
    if (prefix < 0 || prefix > 32) return false
  }
  return true
}

async function readAllowlist(): Promise<string[]> {
  const row = await db.setting.findUnique({ where: { key: 'ipAllowlist' } })
  try {
    const parsed = JSON.parse(row?.value ?? '[]') as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((x): x is string => typeof x === 'string')
  } catch {
    return []
  }
}

export async function GET() {
  try {
    await requireRole(['OWNER', 'ADMIN', 'DEVELOPER'])
    return Response.json({ items: await readAllowlist() })
  } catch (err) {
    return jsonError(err)
  }
}

export async function PUT(req: Request) {
  try {
    const me = await requireRole(['OWNER', 'ADMIN'])
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>

    if (!Array.isArray(b.items)) throw new HttpError(400, 'items must be an array of IP/CIDR strings')

    // Normalize: strings only, trimmed, deduped, bounded
    const items = [...new Set(
      b.items
        .filter((x): x is string => typeof x === 'string')
        .map((x) => x.trim())
        .filter(Boolean)
    )]

    if (items.length > MAX_ENTRIES) throw new HttpError(400, `At most ${MAX_ENTRIES} entries are allowed`)
    const invalid = items.filter((x) => !validEntry(x))
    if (invalid.length) throw new HttpError(400, `Invalid IP or CIDR: ${invalid.slice(0, 3).join(', ')}`)

    await db.setting.upsert({
      where: { key: 'ipAllowlist' },
      update: { value: JSON.stringify(items) },
      create: { key: 'ipAllowlist', value: JSON.stringify(items) },
    })

    await logActivity(me, 'security.ip_allowlist_updated', 'setting:ipAllowlist', { count: items.length })
    return Response.json({ items })
  } catch (err) {
    return jsonError(err)
  }
}
