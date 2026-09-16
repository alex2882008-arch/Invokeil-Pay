import { requireRole, jsonError, HttpError } from '@/lib/auth'
import { FINANCE_ROLES } from '@/lib/roles'
import { computeMonth, currentMonth, monthRange } from '../_month'

/**
 * Accounting CSV export — monthly statement rows.
 * GET /api/admin/accounting/export?month=YYYY-MM → text/csv attachment
 */

const READ_ROLES = [...FINANCE_ROLES, 'SUPPORT'] as Array<'OWNER' | 'ADMIN' | 'FINANCE' | 'SUPPORT'>

function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export async function GET(req: Request) {
  try {
    await requireRole(READ_ROLES)
    const sp = new URL(req.url).searchParams
    const raw = sp.get('month')?.trim() || ''
    const period = raw !== '' ? raw : currentMonth()
    if (!monthRange(period)) throw new HttpError(400, "Month must be in 'YYYY-MM' format")
    const { summary, daily } = await computeMonth(period)

    const header = 'day,transactions,gross,fees,refunds,net'
    const body = daily
      .map((r) => [r.day, r.count, r.gross, r.fees, r.refunds, r.net].map(csvCell).join(','))
      .join('\n')
    const totalRow = ['TOTAL', summary.trxCount, summary.revenue, summary.fees, summary.refunds, summary.net]
      .map(csvCell)
      .join(',')

    return new Response(`${header}\n${body}\n${totalRow}\n`, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="accounting-${period}.csv"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    return jsonError(err)
  }
}
