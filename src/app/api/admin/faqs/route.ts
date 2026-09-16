import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError, logActivity } from '@/lib/auth'

// ── Admin: FAQ collection (public checkout/invoice pages read these) ─────────
// GET  → { faqs }
// POST { question, answer, sortOrder?, active? } → { faq }   (ADMIN/AGENT)

export async function GET() {
  try {
    await requireRole(['ADMIN', 'AGENT', 'VIEWER'])
    const faqs = await db.faqItem.findMany({
      orderBy: [{ sortOrder: 'asc' }, { question: 'asc' }],
    })
    return Response.json({ faqs })
  } catch (err) {
    return jsonError(err)
  }
}

export async function POST(req: Request) {
  try {
    const me = await requireRole(['ADMIN', 'AGENT'])
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || typeof body !== 'object') throw new HttpError(400, 'Invalid JSON body')

    const question = typeof body.question === 'string' ? body.question.trim() : ''
    const answer = typeof body.answer === 'string' ? body.answer.trim() : ''
    if (!question || !answer) throw new HttpError(400, 'Question and answer are required')

    const sortOrderRaw = Number(body.sortOrder)
    const sortOrder = Number.isFinite(sortOrderRaw) ? Math.round(sortOrderRaw) : 0

    const faq = await db.faqItem.create({
      data: {
        question: question.slice(0, 300),
        answer: answer.slice(0, 3000),
        sortOrder,
        active: body.active === undefined ? true : !!body.active,
      },
    })

    await logActivity(me, 'faq.created', `faq:${faq.id}`, { question: faq.question })
    return Response.json({ faq }, { status: 201 })
  } catch (err) {
    return jsonError(err)
  }
}
