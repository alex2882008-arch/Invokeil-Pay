import { db } from '@/lib/db'
import { HttpError } from '@/lib/auth'
import { getMergedSettings } from '@/lib/settings-defaults'

/**
 * Shared accounting month computation (route-agnostic so both the JSON API
 * and the CSV export use the exact same math).
 * Revenue = PAID/MATCHED sum in month; refunds = PROCESSED refunds by processedAt;
 * vat = net * (vatRate setting ?? '0') / 100.
 */

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function monthRange(period: string): { start: Date; end: Date } | null {
  if (!/^\d{4}-\d{2}$/.test(period)) return null
  const [y, m] = period.split('-').map(Number)
  if (m < 1 || m > 12) return null
  return { start: new Date(y, m - 1, 1), end: new Date(y, m, 1) }
}

export function currentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function dayKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export async function computeMonth(period: string) {
  const range = monthRange(period)
  if (!range) throw new HttpError(400, "Month must be in 'YYYY-MM' format")

  const [txs, refunds, settings] = await Promise.all([
    db.transaction.findMany({
      where: { status: { in: ['PAID', 'MATCHED'] }, occurredAt: { gte: range.start, lt: range.end } },
      select: { mfs: true, amount: true, fee: true, charge: true, occurredAt: true },
      orderBy: { occurredAt: 'asc' },
    }),
    db.refund.findMany({
      where: { status: 'PROCESSED', processedAt: { gte: range.start, lt: range.end } },
      select: { amount: true, processedAt: true },
    }),
    getMergedSettings(),
  ])

  const revenue = round2(txs.reduce((s, t) => s + t.amount, 0))
  const fees = round2(txs.reduce((s, t) => s + t.fee + t.charge, 0))
  const refundsSum = round2(refunds.reduce((s, r) => s + r.amount, 0))
  const net = round2(revenue - fees - refundsSum)

  const vatRateRaw = Number(settings.vatRate ?? '0')
  const vatRate = Number.isFinite(vatRateRaw) && vatRateRaw > 0 ? vatRateRaw : 0
  const vat = round2((net * vatRate) / 100)

  // Daily rows
  const dailyMap = new Map<string, { day: string; count: number; gross: number; fees: number; refunds: number; net: number }>()
  const bump = (key: string) => {
    let row = dailyMap.get(key)
    if (!row) {
      row = { day: key, count: 0, gross: 0, fees: 0, refunds: 0, net: 0 }
      dailyMap.set(key, row)
    }
    return row
  }
  for (const t of txs) {
    const row = bump(dayKey(t.occurredAt))
    row.count += 1
    row.gross = round2(row.gross + t.amount)
    row.fees = round2(row.fees + t.fee + t.charge)
  }
  for (const r of refunds) {
    if (!r.processedAt) continue
    const row = bump(dayKey(r.processedAt))
    row.refunds = round2(row.refunds + r.amount)
  }
  const daily = [...dailyMap.values()]
    .map((r) => ({ ...r, net: round2(r.gross - r.fees - r.refunds) }))
    .sort((a, b) => a.day.localeCompare(b.day))

  // By-gateway breakdown (net excludes refunds — they are tracked globally)
  const gwMap = new Map<string, { mfs: string; count: number; gross: number; fees: number; net: number }>()
  for (const t of txs) {
    let g = gwMap.get(t.mfs)
    if (!g) {
      g = { mfs: t.mfs, count: 0, gross: 0, fees: 0, net: 0 }
      gwMap.set(t.mfs, g)
    }
    g.count += 1
    g.gross = round2(g.gross + t.amount)
    g.fees = round2(g.fees + t.fee + t.charge)
  }
  const byGateway = [...gwMap.values()]
    .map((g) => ({ ...g, net: round2(g.gross - g.fees) }))
    .sort((a, b) => b.gross - a.gross)

  return {
    month: period,
    summary: { revenue, fees, refunds: refundsSum, net, vat, vatRate, trxCount: txs.length, refundCount: refunds.length },
    daily,
    byGateway,
  }
}
