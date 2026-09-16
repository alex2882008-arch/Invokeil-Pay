import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError, logActivity } from '@/lib/auth'

type RouteCtx = { params: Promise<{ id: string }> }

// ── POST: append a timestamped line to Customer.notes (read-modify-write) ───
export async function POST(req: Request, { params }: RouteCtx) {
  try {
    const me = await requireRole(['OWNER', 'ADMIN', 'SUPPORT', 'AGENT'])
    const { id } = await params

    const body: unknown = await req.json().catch(() => ({}))
    const note = typeof (body as Record<string, unknown>).note === 'string'
      ? (body as { note: string }).note.trim()
      : ''
    if (!note) throw new HttpError(400, 'Note cannot be empty')
    if (note.length > 2000) throw new HttpError(400, 'Note is too long (max 2000 chars)')

    const customer = await db.customer.findUnique({ where: { id }, select: { id: true, notes: true } })
    if (!customer) throw new HttpError(404, 'Customer not found')

    const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
    const line = `[${stamp} · ${me.name}] ${note}`
    const next = customer.notes ? `${customer.notes}\n${line}` : line

    await db.customer.update({ where: { id }, data: { notes: next } })
    await logActivity(me, 'customer.note_added', `customer:${id}`, { chars: note.length })

    return Response.json({ ok: true, notes: next })
  } catch (err) {
    return jsonError(err)
  }
}
