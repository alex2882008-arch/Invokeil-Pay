import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError, safeInt, logActivity } from '@/lib/auth'

const CATEGORIES = ['PAYMENT', 'INVOICE', 'SUBSCRIPTION', 'SECURITY', 'REFUND', 'SUPPORT', 'MARKETING', 'SYSTEM', 'KYC', 'OTP']
const TONES = ['FORMAL', 'FRIENDLY', 'MINIMAL']

/** GET — paginated template browser. Filters: category, locale, tone, q, page, pageSize, active. */
export async function GET(req: Request) {
  try {
    await requireRole(['OWNER', 'ADMIN', 'DEVELOPER', 'SUPPORT', 'FINANCE', 'AGENT', 'VIEWER'])
    const url = new URL(req.url)
    const page = safeInt(url.searchParams.get('page'), 1)
    const pageSize = Math.min(safeInt(url.searchParams.get('pageSize'), 20), 200)
    const category = (url.searchParams.get('category') ?? '').toUpperCase()
    const locale = (url.searchParams.get('locale') ?? '').toLowerCase()
    const tone = (url.searchParams.get('tone') ?? '').toUpperCase()
    const q = url.searchParams.get('q')?.trim()
    const active = url.searchParams.get('active')

    const where: Record<string, unknown> = {}
    if (CATEGORIES.includes(category)) where.category = category
    if (['en', 'bn'].includes(locale)) where.locale = locale
    if (TONES.includes(tone)) where.tone = tone
    if (active === '1') where.active = true
    if (q) {
      where.OR = [
        { name: { contains: q } },
        { subject: { contains: q } },
        { key: { contains: q } },
      ]
    }

    const [total, items] = await Promise.all([
      db.emailTemplate.count({ where }),
      db.emailTemplate.findMany({
        where,
        orderBy: [{ category: 'asc' }, { key: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])

    return Response.json({
      ok: true,
      data: {
        items: items.map((t) => ({
          id: t.id,
          key: t.key,
          name: t.name,
          category: t.category,
          event: t.event,
          locale: t.locale,
          tone: t.tone,
          subject: t.subject,
          bodyHtml: t.bodyHtml,
          variables: safeParseArray(t.variables),
          builtin: t.builtin,
          active: t.active,
          updatedAt: t.updatedAt,
        })),
        total,
        page,
        pages: Math.max(Math.ceil(total / pageSize), 1),
      },
    })
  } catch (e) {
    return jsonError(e)
  }
}

/** POST — { action: 'restore', force?: boolean } → re-seed missing builtin catalog templates. */
export async function POST(req: Request) {
  try {
    const me = await requireRole(['OWNER', 'ADMIN'])
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
    if (b.action !== 'restore') throw new HttpError(400, "action must be 'restore' — or use POST /api/admin/email/templates/restore")
    const { restoreCatalogTemplates } = await import('@/lib/email-catalog-restore')
    const result = await restoreCatalogTemplates(Boolean(b.force))
    await logActivity(me, 'email.templates.restored', 'emailTemplate', { ...result, force: Boolean(b.force) })
    return Response.json({ ok: true, data: result })
  } catch (e) {
    return jsonError(e)
  }
}

function safeParseArray(json: string | null): string[] {
  if (!json) return []
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? v.map(String) : []
  } catch {
    return []
  }
}
