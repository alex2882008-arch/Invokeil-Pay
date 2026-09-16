import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError } from '@/lib/auth'

function parseChain(json: string | null): Array<{ provider: string; ok: boolean; detail: string; ms: number; simulated?: boolean }> | null {
  if (!json) return null
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? v : null
  } catch {
    return null
  }
}

/** GET — full message incl. parsed provider chain + rendered body. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(['OWNER', 'ADMIN', 'DEVELOPER', 'SUPPORT', 'FINANCE', 'AGENT'])
    const { id } = await params
    const row = await db.emailMessage.findUnique({
      where: { id },
      include: { identity: { select: { id: true, label: true, email: true } } },
    })
    if (!row) throw new HttpError(404, 'Message not found')
    const { providerChain, ...rest } = row
    return Response.json({
      ok: true,
      data: {
        message: rest,
        chain: parseChain(providerChain),
      },
    })
  } catch (e) {
    return jsonError(e)
  }
}

/** DELETE — remove a message from the inbox/history. */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const me = await requireRole(['OWNER', 'ADMIN'])
    const { id } = await params
    const existing = await db.emailMessage.findUnique({ where: { id }, select: { id: true } })
    if (!existing) throw new HttpError(404, 'Message not found')
    await db.emailMessage.delete({ where: { id } })
    return Response.json({ ok: true, deleted: id, by: me.id })
  } catch (e) {
    return jsonError(e)
  }
}
