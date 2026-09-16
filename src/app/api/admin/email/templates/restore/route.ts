import { requireRole, jsonError, logActivity } from '@/lib/auth'
import { restoreCatalogTemplates } from '@/lib/email-catalog-restore'

/**
 * POST /api/admin/email/templates/restore?force=1
 * Re-seeds missing builtin templates from the 320-template catalog.
 * Edited rows are never overwritten unless force=1.
 */
export async function POST(req: Request) {
  try {
    const me = await requireRole(['OWNER', 'ADMIN'])
    const url = new URL(req.url)
    const force = url.searchParams.get('force') === '1'
    const result = await restoreCatalogTemplates(force)
    await logActivity(me, 'email.templates.restored', 'emailTemplate', { ...result, force })
    return Response.json({ ok: true, data: result })
  } catch (e) {
    return jsonError(e)
  }
}
