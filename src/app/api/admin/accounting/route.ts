import { requireRole, jsonError, HttpError } from '@/lib/auth'
import { FINANCE_ROLES } from '@/lib/roles'
import { computeMonth, currentMonth, monthRange } from './_month'

/**
 * Accounting API — monthly P&L.
 * GET ?month=YYYY-MM (default: current month)
 *   → { month, summary: {revenue, fees, refunds, net, vat, vatRate, trxCount, refundCount}, daily[], byGateway[] }
 */

const READ_ROLES = [...FINANCE_ROLES, 'SUPPORT'] as Array<'OWNER' | 'ADMIN' | 'FINANCE' | 'SUPPORT'>

export async function GET(req: Request) {
  try {
    await requireRole(READ_ROLES)
    const sp = new URL(req.url).searchParams
    const raw = sp.get('month')?.trim() || ''
    const period = raw !== '' ? raw : currentMonth()
    if (!monthRange(period)) throw new HttpError(400, "Month must be in 'YYYY-MM' format")
    const data = await computeMonth(period)
    return Response.json(data)
  } catch (err) {
    return jsonError(err)
  }
}
