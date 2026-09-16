import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError, logActivity } from '@/lib/auth'

// ── Admin: single FAQ ────────────────────────────────────────────────────────
// PATCH  { question?, answer?, sortOrder?, active? } → { faq }   (ADMIN/AGENT)
// DELETE → { ok }                                                 (ADMIN only)

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const me = await requireRole(['ADMIN', 'AGENT'])
    const { id } = await params
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || typeof body !== 'object') throw new HttpError(400, 'Invalid JSON body')

    const existing = await db.faqItem.findUnique({ where: { id } })
    if (!existing) throw new HttpError(404, 'FAQ not found')

    const data: Record<string, unknown> = {}
    if (typeof body.question === 'string' && body.question.trim()) data.question = body.question.trim().slice(0, 300)
    if (typeof body.answer === 'string' && body.answer.trim()) data.answer = body.answer.trim().slice(0, 3000)
    if (body.sortOrder !== undefined) {
      const n = Number(body.sortOrder)
      if (!Number.isFinite(n)) throw new HttpError(400, 'sortOrder must be a number')
      data.sortOrder = Math.round(n)
    }
    if (typeof body.active === 'boolean') data.active = body.active

    if (Object.keys(data).length === 0) throw new HttpError(400, 'Nothing to update')

    const faq = await db.faqItem.update({ where: { id }, data })
    await logActivity(me, 'faq.updated', `faq:${faq.id}`, { question: faq.question })
    return Response.json({ faq })
  } catch (err) {
    return jsonError(err)
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const me = await requireRole(['ADMIN'])
    const { id } = await params

    const existing = await db.faqItem.findUnique({ where: { id } })
    if (!existing) throw new HttpError(404, 'FAQ not found')

    await db.faqItem.delete({ where: { id } })
    await logActivity(me, 'faq.deleted', `faq:${id}`, { question: existing.question })
    return Response.json({ ok: true })
  } catch (err) {
    return jsonError(err)
  }
}
