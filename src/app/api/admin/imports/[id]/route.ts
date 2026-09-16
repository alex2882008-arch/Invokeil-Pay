import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError, logActivity } from '@/lib/auth'

type Ctx = { params: Promise<{ id: string }> }

function parseErrorLog(raw: string | null | undefined): Array<{ row: number; reason: string }> {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? (v as Array<{ row: number; reason: string }>) : []
  } catch {
    return []
  }
}

/** GET /api/admin/imports/[id] — job detail with parsed error log. */
export async function GET(_req: Request, ctx: Ctx) {
  try {
    await requireRole(['OWNER', 'ADMIN', 'FINANCE', 'AGENT', 'VIEWER'])
    const { id } = await ctx.params
    const job = await db.importJob.findUnique({ where: { id } })
    if (!job) throw new HttpError(404, 'Import job not found')
    return Response.json({ ok: true, data: { ...job, errorLog: parseErrorLog(job.errorLog) } })
  } catch (e) {
    return jsonError(e)
  }
}

/** DELETE /api/admin/imports/[id] — remove the history record (imported rows stay). */
export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const me = await requireRole(['OWNER', 'ADMIN'])
    const { id } = await ctx.params
    const job = await db.importJob.findUnique({ where: { id } })
    if (!job) throw new HttpError(404, 'Import job not found')
    await db.importJob.delete({ where: { id } })
    await logActivity(me, 'import.deleted', `importJob:${id}`, { type: job.type })
    return Response.json({ ok: true, data: { id } })
  } catch (e) {
    return jsonError(e)
  }
}
