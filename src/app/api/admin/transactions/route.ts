import { db } from '@/lib/db'
import { requireRole, jsonError, safeInt } from '@/lib/auth'

/**
 * Transactions API v2
 * GET  ?page(20)&q&status&mfs&from&to        → paged list (device name + checkout title included)
 * GET  ?format=csv&…                          → text/csv attachment export (no pagination)
 * GET  ?summary=1&…                           → { total, volume, unmatched, today }
 */

const PAGE_SIZE = 20
const CSV_LIMIT = 5000

function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Parse YYYY-MM-DD into a Date at local midnight, or null when invalid. */
function parseDay(v: string | null, endOfDay = false): Date | null {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
  const d = new Date(`${v}T00:00:00`)
  if (isNaN(d.getTime())) return null
  return endOfDay ? new Date(d.getTime() + 86_400_000 - 1) : d
}

function buildWhere(
  user: { role: string; id: string },
  q: string | null,
  status: string | null,
  mfs: string | null,
  from: Date | null,
  to: Date | null
): Record<string, unknown> {
  const where: Record<string, unknown> = {}
  if (user.role === 'AGENT') where.device = { ownerId: user.id }
  if (status && status !== 'ALL') where.status = status
  if (mfs && mfs !== 'ALL') where.mfs = mfs
  const occurredAt: Record<string, Date> = {}
  if (from) occurredAt.gte = from
  if (to) occurredAt.lte = to
  if (Object.keys(occurredAt).length) where.occurredAt = occurredAt
  if (q) {
    where.OR = [
      { trxId: { contains: q } },
      { senderNumber: { contains: q } },
      { senderName: { contains: q } },
    ]
  }
  return where
}

export async function GET(req: Request) {
  try {
    // v3: OWNER/FINANCE/SUPPORT added — refunds & dispute flows look up transactions here
    const user = await requireRole(['OWNER', 'ADMIN', 'FINANCE', 'SUPPORT', 'AGENT', 'VIEWER'])
    const url = new URL(req.url)
    const sp = url.searchParams
    const q = sp.get('q')?.trim() || null
    const status = sp.get('status')
    const mfs = sp.get('mfs')
    const from = parseDay(sp.get('from'))
    const to = parseDay(sp.get('to'), true)
    const where = buildWhere(user, q, status, mfs, from, to)

    // ── CSV export ─────────────────────────────────────────────────
    if (sp.get('format') === 'csv') {
      const rows = await db.transaction.findMany({
        where,
        orderBy: { occurredAt: 'desc' },
        take: CSV_LIMIT,
        select: {
          id: true, trxId: true, mfs: true, amount: true, charge: true,
          netAmount: true, senderNumber: true, status: true, occurredAt: true,
        },
      })
      const header = 'id,trxId,mfs,amount,charge,net,senderNumber,status,occurredAt'
      const body = rows
        .map((r) =>
          [
            r.id,
            r.trxId,
            r.mfs,
            r.amount,
            r.charge,
            r.netAmount,
            r.senderNumber,
            r.status,
            r.occurredAt.toISOString(),
          ]
            .map(csvCell)
            .join(',')
        )
        .join('\n')
      return new Response(`${header}\n${body}\n`, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="transactions.csv"',
          'Cache-Control': 'no-store',
        },
      })
    }

    // ── Summary cards ──────────────────────────────────────────────
    if (sp.get('summary')) {
      const startOfToday = new Date()
      startOfToday.setHours(0, 0, 0, 0)
      const filterCore = buildWhere(user, q, status, mfs, null, null) // date range excluded from "today"
      const [total, volumeAgg, unmatched, today] = await Promise.all([
        db.transaction.count({ where }),
        db.transaction.aggregate({
          where: { ...where, status: { in: ['PAID', 'MATCHED'] } },
          _sum: { amount: true },
        }),
        db.transaction.count({ where: { ...where, status: 'UNMATCHED' } }),
        db.transaction.count({
          where: { ...filterCore, occurredAt: { gte: startOfToday } },
        }),
      ])
      return Response.json({
        total,
        volume: Math.round((volumeAgg._sum.amount ?? 0) * 100) / 100,
        unmatched,
        today,
      })
    }

    // ── Paged list ─────────────────────────────────────────────────
    const page = safeInt(sp.get('page'), 1)
    const [total, items] = await Promise.all([
      db.transaction.count({ where }),
      db.transaction.findMany({
        where,
        orderBy: { occurredAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true, trxId: true, mfs: true, amount: true, status: true,
          senderNumber: true, senderName: true, occurredAt: true,
          device: { select: { name: true } },
          checkout: { select: { token: true, title: true } },
        },
      }),
    ])

    return Response.json({ total, page, pageSize: PAGE_SIZE, items })
  } catch (err) {
    return jsonError(err)
  }
}
