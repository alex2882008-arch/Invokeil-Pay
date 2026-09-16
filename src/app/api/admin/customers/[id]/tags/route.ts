import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError, logActivity } from '@/lib/auth'

type RouteCtx = { params: Promise<{ id: string }> }

const MAX_TAGS = 20
const MAX_TAG_LEN = 24

function sanitizeTags(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  const out: string[] = []
  for (const raw of input) {
    if (typeof raw !== 'string') continue
    const tag = raw.trim().slice(0, MAX_TAG_LEN)
    if (tag && !out.includes(tag)) out.push(tag)
    if (out.length >= MAX_TAGS) break
  }
  return out
}

function parseStored(tags: string | null | undefined): string[] {
  if (!tags) return []
  try {
    const parsed: unknown = JSON.parse(tags)
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : []
  } catch {
    return []
  }
}

// ── PUT: replace the whole tag list ──────────────────────────────────────────
export async function PUT(req: Request, { params }: RouteCtx) {
  try {
    const me = await requireRole(['OWNER', 'ADMIN', 'SUPPORT', 'AGENT'])
    const { id } = await params

    const body: unknown = await req.json().catch(() => ({}))
    const tags = sanitizeTags((body as Record<string, unknown>).tags)

    const customer = await db.customer.findUnique({ where: { id }, select: { id: true } })
    if (!customer) throw new HttpError(404, 'Customer not found')

    await db.customer.update({ where: { id }, data: { tags: JSON.stringify(tags) } })
    await logActivity(me, 'customer.tags_updated', `customer:${id}`, { count: tags.length })

    return Response.json({ ok: true, tags })
  } catch (err) {
    return jsonError(err)
  }
}

// ── POST: append a single unique tag ─────────────────────────────────────────
export async function POST(req: Request, { params }: RouteCtx) {
  try {
    const me = await requireRole(['OWNER', 'ADMIN', 'SUPPORT', 'AGENT'])
    const { id } = await params

    const body: unknown = await req.json().catch(() => ({}))
    const raw = typeof (body as Record<string, unknown>).tag === 'string'
      ? (body as { tag: string }).tag.trim().slice(0, MAX_TAG_LEN)
      : ''
    if (!raw) throw new HttpError(400, 'Tag cannot be empty')

    const customer = await db.customer.findUnique({ where: { id }, select: { id: true, tags: true } })
    if (!customer) throw new HttpError(404, 'Customer not found')

    const current = parseStored(customer.tags)
    if (current.length >= MAX_TAGS) throw new HttpError(400, `Too many tags (max ${MAX_TAGS})`)
    if (current.includes(raw)) throw new HttpError(409, 'This tag already exists')

    const next = [...current, raw]
    await db.customer.update({ where: { id }, data: { tags: JSON.stringify(next) } })
    await logActivity(me, 'customer.tag_added', `customer:${id}`, { tag: raw })

    return Response.json({ ok: true, tags: next })
  } catch (err) {
    return jsonError(err)
  }
}
