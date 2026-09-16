import { db } from '@/lib/db'
import {
  requireRole, jsonError, HttpError,
} from '@/lib/auth'

// ── Admin: Reports ───────────────────────────────────────────────────────────
// GET ?range=today|yesterday|7d|30d|month|custom&from&to
//   → { range:{from,to}, summary:{volume,count,successRate,avgValue,fees,unmatched},
//       daily:[{date,count,volume,fees}] asc, byGateway:[{mfs,count,volume}], byStatus:[{status,count}] }
// GET ?format=csv → CSV of the daily rows. Uses Transaction.occurredAt. (ADMIN/AGENT)

const OK_STATUSES = ['PAID', 'MATCHED']

function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}
function endOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x
}
function dateKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export async function GET(req: Request) {
  try {
    await requireRole(['ADMIN', 'AGENT'])
    const url = new URL(req.url)
    const range = url.searchParams.get('range') ?? '7d'
    const now = new Date()

    let from: Date
    let to: Date
    if (range === 'today') {
      from = startOfDay(now); to = now
    } else if (range === 'yesterday') {
      const y = new Date(now.getTime() - 86400_000)
      from = startOfDay(y); to = endOfDay(y)
    } else if (range === '7d') {
      from = startOfDay(new Date(now.getTime() - 6 * 86400_000)); to = now
    } else if (range === '30d') {
      from = startOfDay(new Date(now.getTime() - 29 * 86400_000)); to = now
    } else if (range === 'month') {
      from = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)); to = now
    } else if (range === 'custom') {
      const f = url.searchParams.get('from')
      const t = url.searchParams.get('to')
      if (!f || !t) throw new HttpError(400, 'from and to are required for a custom range')
      from = startOfDay(new Date(`${f}T00:00:00`))
      to = endOfDay(new Date(`${t}T00:00:00`))
      if (isNaN(from.getTime()) || isNaN(to.getTime())) throw new HttpError(400, 'Invalid from/to dates')
      if (from > to) throw new HttpError(400, 'from must be before to')
    } else {
      throw new HttpError(400, 'Unknown range')
    }

    const rows = await db.transaction.findMany({
      where: { occurredAt: { gte: from, lte: to } },
      select: { amount: true, charge: true, fee: true, mfs: true, status: true, occurredAt: true },
    })

    // ── Summary ──
    let volume = 0
    let fees = 0
    let count = 0
    let totalInRange = 0
    let unmatched = 0
    const dailyMap = new Map<string, { count: number; volume: number; fees: number }>()
    const gatewayMap = new Map<string, { count: number; volume: number }>()
    const statusMap = new Map<string, number>()

    for (const r of rows) {
      totalInRange++
      statusMap.set(r.status, (statusMap.get(r.status) ?? 0) + 1)
      if (r.status === 'UNMATCHED') unmatched++
      const ok = OK_STATUSES.includes(r.status)
      if (!ok) continue
      count++
      volume += r.amount
      fees += (r.charge ?? 0) + (r.fee ?? 0)

      const key = dateKey(r.occurredAt)
      const day = dailyMap.get(key) ?? { count: 0, volume: 0, fees: 0 }
      day.count++
      day.volume += r.amount
      day.fees += (r.charge ?? 0) + (r.fee ?? 0)
      dailyMap.set(key, day)

      const gw = gatewayMap.get(r.mfs) ?? { count: 0, volume: 0 }
      gw.count++
      gw.volume += r.amount
      gatewayMap.set(r.mfs, gw)
    }

    const round2 = (n: number) => Math.round(n * 100) / 100
    const daily = [...dailyMap.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([date, d]) => ({ date, count: d.count, volume: round2(d.volume), fees: round2(d.fees) }))
    const byGateway = [...gatewayMap.entries()]
      .sort(([, a], [, b]) => b.volume - a.volume)
      .map(([mfs, g]) => ({ mfs, count: g.count, volume: round2(g.volume) }))
    const byStatus = [...statusMap.entries()]
      .sort(([, a], [, b]) => b - a)
      .map(([status, c]) => ({ status, count: c }))

    // ── CSV export of the daily rows ──
    if (url.searchParams.get('format') === 'csv') {
      const esc = (v: string | number) => {
        const s = String(v)
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
      }
      const lines = ['date,count,volume,fees']
      for (const d of daily) lines.push([d.date, d.count, d.volume, d.fees].map(esc).join(','))
      return new Response(lines.join('\n'), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="report-${dateKey(from)}_${dateKey(to)}.csv"`,
        },
      })
    }

    return Response.json({
      range: { from: from.toISOString(), to: to.toISOString() },
      summary: {
        volume: round2(volume),
        count,
        successRate: totalInRange > 0 ? Math.round((count / totalInRange) * 1000) / 10 : null,
        avgValue: count > 0 ? round2(volume / count) : null,
        fees: round2(fees),
        unmatched,
      },
      daily,
      byGateway,
      byStatus,
    })
  } catch (err) {
    return jsonError(err)
  }
}
