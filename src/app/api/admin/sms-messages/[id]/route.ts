// ── Admin: single SMS log entry — GET (parsed chain) & DELETE ───────
import { db } from '@/lib/db'
import { requireRole, HttpError, jsonError, logActivity } from '@/lib/auth'

type Params = { params: Promise<{ id: string }> }

function parseChain(raw: string | null): Array<{ provider: string; ok: boolean; detail: string; ms: number; simulated?: boolean }> {
  if (!raw) return []
  try {
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr.map((a) => ({
      provider: String((a as Record<string, unknown>).provider ?? '?'),
      ok: Boolean((a as Record<string, unknown>).ok),
      detail: String((a as Record<string, unknown>).detail ?? ''),
      ms: Number((a as Record<string, unknown>).ms ?? 0),
      simulated: Boolean((a as Record<string, unknown>).simulated),
    }))
  } catch {
    return []
  }
}

export async function GET(_req: Request, { params }: Params) {
  try {
    await requireRole(['OWNER', 'ADMIN', 'DEVELOPER', 'FINANCE', 'SUPPORT', 'AGENT', 'VIEWER'])
    const { id } = await params
    const row = await db.smsMessage.findUnique({ where: { id } })
    if (!row) throw new HttpError(404, 'Message not found')
    return Response.json({ ok: true, item: { ...row, chain: parseChain(row.providerChain) } })
  } catch (err) {
    return jsonError(err)
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const me = await requireRole(['OWNER', 'ADMIN'])
    const { id } = await params
    const row = await db.smsMessage.findUnique({ where: { id } })
    if (!row) throw new HttpError(404, 'Message not found')
    await db.smsMessage.delete({ where: { id } })
    await logActivity(me, 'sms_message.deleted', `sms_message:${id}`, { to: row.toNumber })
    return Response.json({ ok: true })
  } catch (err) {
    return jsonError(err)
  }
}
