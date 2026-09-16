import { db } from '@/lib/db'
import {
  requireRole, jsonError, HttpError, safeInt, randomToken, logActivity,
} from '@/lib/auth'
import { buildLinkData, uniqueSlug } from '@/lib/links-server'

// ── Admin: Payment Links collection ──────────────────────────────────────────
// GET  ?page&q&status          → { links, total, page, pages }
// GET  ?summary=1              → { summary: { active, collected, uses } }
// POST { ...link fields }      → { link }   (ADMIN/AGENT)

const PAGE_SIZE = 20

export async function GET(req: Request) {
  try {
    await requireRole(['ADMIN', 'AGENT', 'VIEWER'])
    const url = new URL(req.url)

    // ── Aggregate summary for stat cards ──
    if (url.searchParams.get('summary') === '1') {
      const [active, usesAgg, collectedAgg] = await Promise.all([
        db.paymentLink.count({ where: { status: 'ACTIVE' } }),
        db.paymentLink.aggregate({ _sum: { usedCount: true } }),
        db.transaction.aggregate({
          where: { linkId: { not: null } },
          _sum: { amount: true },
        }),
      ])
      return Response.json({
        summary: {
          active,
          collected: Math.round((collectedAgg._sum.amount ?? 0) * 100) / 100,
          uses: usesAgg._sum.usedCount ?? 0,
        },
      })
    }

    // ── List ──
    const q = url.searchParams.get('q')?.trim()
    const status = url.searchParams.get('status')
    const page = safeInt(url.searchParams.get('page'), 1)

    const where: Record<string, unknown> = {}
    if (status && status !== 'ALL') where.status = status
    if (q) {
      where.OR = [
        { title: { contains: q } },
        { slug: { contains: q } },
        { description: { contains: q } },
      ]
    }

    const [total, links] = await Promise.all([
      db.paymentLink.count({ where }),
      db.paymentLink.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
    ])

    return Response.json({
      links,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    })
  } catch (err) {
    return jsonError(err)
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireRole(['ADMIN', 'AGENT'])
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || typeof body !== 'object') throw new HttpError(400, 'Invalid JSON body')

    const data = buildLinkData(body)
    // Explicit slug wins (dialog auto-fills it from the title and is editable);
    // otherwise derive from the title. Both paths dedupe with -2, -3… suffixes.
    const slugBase = typeof body.slug === 'string' && body.slug.trim() ? body.slug.trim() : String(body.title ?? '')
    const slug = await uniqueSlug(slugBase)

    const link = await db.paymentLink.create({
      data: { ...data, slug, token: randomToken(16), status: 'ACTIVE' },
    })

    await logActivity(user, 'link.created', `link:${link.id}`, { title: link.title, slug: link.slug })
    return Response.json({ link }, { status: 201 })
  } catch (err) {
    return jsonError(err)
  }
}
