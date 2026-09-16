import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError } from '@/lib/auth'
import { portalTokenFor } from '@/lib/portal-token'

type RouteCtx = { params: Promise<{ id: string }> }

// ── GET: deterministic portal link for this customer ─────────────────────────
// The token is derived via HMAC-SHA256 (see src/lib/portal-token.ts), so the
// same customer always gets the same URL — safe to re-share, nothing stored.
export async function GET(_req: Request, { params }: RouteCtx) {
  try {
    await requireRole(['OWNER', 'ADMIN', 'SUPPORT', 'AGENT'])
    const { id } = await params

    const customer = await db.customer.findUnique({ where: { id }, select: { id: true, name: true } })
    if (!customer) throw new HttpError(404, 'Customer not found')

    const token = portalTokenFor(customer.id)
    const origin = process.env.NEXT_PUBLIC_APP_URL || ''
    return Response.json({
      ok: true,
      token,
      url: `${origin}/portal/${token}`,
      path: `/portal/${token}`,
    })
  } catch (err) {
    return jsonError(err)
  }
}
