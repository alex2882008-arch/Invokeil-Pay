import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError, logActivity } from '@/lib/auth'

const PURPOSES = ['GENERAL', 'SALES', 'PAYMENTS', 'INVOICES', 'SUPPORT', 'REFUNDS', 'SECURITY', 'OTP', 'BILLING', 'NOREPLY', 'CUSTOM']

function str(v: unknown, max = 320): string | undefined {
  if (typeof v !== 'string') return undefined
  return v.trim().slice(0, max)
}

/** PATCH — partial identity update. */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const me = await requireRole(['OWNER', 'ADMIN'])
    const { id } = await params
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>

    const existing = await db.emailIdentity.findUnique({ where: { id } })
    if (!existing) throw new HttpError(404, 'Identity not found')

    const data: Record<string, unknown> = {}
    const label = str(b.label, 120)
    if (label !== undefined && label !== '') data.label = label
    const email = str(b.email, 200)
    if (email !== undefined && email !== '') {
      const norm = email.toLowerCase()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(norm)) throw new HttpError(400, 'A valid email address is required')
      if (norm !== existing.email) {
        const dup = await db.emailIdentity.findUnique({ where: { email: norm } })
        if (dup) throw new HttpError(400, 'This email address is already used by another identity')
      }
      data.email = norm
    }
    const purpose = str(b.purpose, 40)?.toUpperCase()
    if (purpose !== undefined && purpose !== '') {
      if (!PURPOSES.includes(purpose)) throw new HttpError(400, `purpose must be one of ${PURPOSES.join(', ')}`)
      data.purpose = purpose
    }
    if (b.signature !== undefined) data.signature = str(b.signature, 2000) || null
    if (b.verified !== undefined) data.verified = Boolean(b.verified)
    if (b.active !== undefined) data.active = Boolean(b.active)

    if (Object.keys(data).length === 0) throw new HttpError(400, 'Nothing to update')
    const row = await db.emailIdentity.update({ where: { id }, data })
    await logActivity(me, 'email.identity.updated', `emailIdentity:${id}`, { fields: Object.keys(data) })
    return Response.json({ ok: true, data: row })
  } catch (e) {
    return jsonError(e)
  }
}

/** DELETE — remove an identity (messages keep the row via SetNull). */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const me = await requireRole(['OWNER', 'ADMIN'])
    const { id } = await params
    const existing = await db.emailIdentity.findUnique({ where: { id }, select: { id: true, email: true } })
    if (!existing) throw new HttpError(404, 'Identity not found')
    await db.emailIdentity.delete({ where: { id } })
    await logActivity(me, 'email.identity.deleted', `emailIdentity:${id}`, { email: existing.email })
    return Response.json({ ok: true })
  } catch (e) {
    return jsonError(e)
  }
}
