import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError, logActivity } from '@/lib/auth'
import { buildLinkData, uniqueSlug } from '@/lib/links-server'

// ── Admin: single Payment Link ───────────────────────────────────────────────
// PATCH /[id]  any subset of link fields, slug uniqueness respected, status toggle
// DELETE /[id] ADMIN only

type RouteCtx = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, ctx: RouteCtx) {
  try {
    const user = await requireRole(['ADMIN', 'AGENT'])
    const { id } = await ctx.params
    const link = await db.paymentLink.findUnique({ where: { id } })
    if (!link) throw new HttpError(404, 'Payment link not found')

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || typeof body !== 'object') throw new HttpError(400, 'Invalid JSON body')

    // Status toggle (can be sent alone)
    let status: string | undefined
    if ('status' in body) {
      status = String(body.status).toUpperCase()
      if (status !== 'ACTIVE' && status !== 'DISABLED') throw new HttpError(400, 'status must be ACTIVE or DISABLED')
    }

    // Merge fields on top of the current row, then re-validate everything
    const data = buildLinkData(body, link)

    // Slug: only re-check uniqueness when it actually changes
    let slug = link.slug
    if (typeof body.slug === 'string' && body.slug.trim() && body.slug.trim() !== link.slug) {
      slug = await uniqueSlug(body.slug.trim(), link.id)
    }

    const updated = await db.paymentLink.update({
      where: { id: link.id },
      data: { ...data, slug, ...(status ? { status } : {}) },
    })

    await logActivity(user, 'link.updated', `link:${updated.id}`, {
      title: updated.title,
      slug: updated.slug,
      status: updated.status,
      fields: Object.keys(body),
    })
    return Response.json({ link: updated })
  } catch (err) {
    return jsonError(err)
  }
}

export async function DELETE(_req: Request, ctx: RouteCtx) {
  try {
    const user = await requireRole(['ADMIN'])
    const { id } = await ctx.params
    const link = await db.paymentLink.findUnique({ where: { id } })
    if (!link) throw new HttpError(404, 'Payment link not found')

    await db.paymentLink.delete({ where: { id: link.id } })
    await logActivity(user, 'link.deleted', `link:${link.id}`, { title: link.title, slug: link.slug })
    return Response.json({ ok: true })
  } catch (err) {
    return jsonError(err)
  }
}
