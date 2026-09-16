import { db } from '@/lib/db'
import { requireRole, jsonError } from '@/lib/auth'
import { MFS_COLORS } from '@/lib/gateways'
import { processWebhookRetries } from '@/lib/webhook'
import { processDueRuns } from '@/lib/automation-engine'

/**
 * Stats API v2 — dashboard contract:
 * { today, yesterday, deltaPct, successRate, pendingCheckouts, devicesOnline,
 *   devicesTotal, series, gatewayShare, recentTx, activity, checklist }
 * ?range=today|7d|30d drives the series/gateway window.
 */

// Opportunistic webhook retry pump — max once per 60s, never blocks the response.
let lastRetryRun = 0

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export async function GET(req: Request) {
  try {
    const user = await requireRole(['ADMIN', 'AGENT', 'VIEWER'])

    const url = new URL(req.url)
    const rangeParam = url.searchParams.get('range')
    const range: 'today' | '7d' | '30d' =
      rangeParam === '7d' || rangeParam === '30d' ? rangeParam : 'today'

    const now = Date.now()
    if (now - lastRetryRun > 60_000) {
      lastRetryRun = now
      processWebhookRetries(3).catch(() => undefined)
      // v3 lazy scheduler: resume WAITING automation runs + time-based triggers
      processDueRuns(5).catch(() => undefined)
    }

    // AGENTS only see transactions captured by their own devices
    const deviceScope = user.role === 'AGENT' ? { ownerId: user.id } : {}
    const scopeDeviceIds = (
      await db.device.findMany({ where: deviceScope, select: { id: true } })
    ).map((d) => d.id)
    const baseWhere: Record<string, unknown> = scopeDeviceIds.length
      ? { deviceId: { in: scopeDeviceIds } }
      : {}

    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    const startOfYesterday = new Date(startOfToday.getTime() - 86_400_000)
    const rangeDays = range === 'today' ? 1 : range === '7d' ? 7 : 30
    const rangeStart =
      range === 'today' ? startOfToday : new Date(startOfToday.getTime() - (rangeDays - 1) * 86_400_000)

    const rangeWhere = { ...baseWhere, occurredAt: { gte: rangeStart } }
    const activeRangeWhere = { ...rangeWhere, status: { not: 'REVERSED' } }

    const [
      todayAgg,
      yesterdayAgg,
      rangeTx,
      pendingCheckouts,
      devices,
      recentTx,
      activity,
      gatewaysEnabled,
      devicePaired,
      checkoutCreated,
      webhookConfigured,
      anyTx,
    ] = await Promise.all([
      db.transaction.aggregate({
        where: { ...baseWhere, occurredAt: { gte: startOfToday }, status: { not: 'REVERSED' } },
        _sum: { amount: true },
        _count: true,
      }),
      db.transaction.aggregate({
        where: {
          ...baseWhere,
          occurredAt: { gte: startOfYesterday, lt: startOfToday },
          status: { not: 'REVERSED' },
        },
        _sum: { amount: true },
        _count: true,
      }),
      db.transaction.findMany({
        where: activeRangeWhere,
        select: { amount: true, mfs: true, occurredAt: true, status: true },
      }),
      db.checkoutPage.count({ where: { status: { in: ['PENDING', 'AWAITING'] } } }),
      db.device.findMany({
        where: deviceScope,
        select: { id: true, status: true, lastSeen: true },
      }),
      db.transaction.findMany({
        where: { ...baseWhere, status: { not: 'REVERSED' } },
        orderBy: { occurredAt: 'desc' },
        take: 8,
        select: {
          id: true, trxId: true, mfs: true, amount: true,
          senderNumber: true, status: true, occurredAt: true,
        },
      }),
      db.activityLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: { id: true, actorName: true, action: true, target: true, createdAt: true },
      }),
      db.gateway.count({ where: { enabled: true } }),
      db.device.count({ where: { OR: [{ pairedAt: { not: null } }, { lastSeen: { not: null } }] } }),
      db.checkoutPage.count(),
      db.store.count({ where: { OR: [{ webhookUrl: { not: null } }, { webhookEndpoints: { some: {} } }] } }),
      db.transaction.count(),
    ])

    // ── Series buckets ──────────────────────────────────────────────
    const series: Array<{ date: string; amount: number; count: number }> = []
    if (range === 'today') {
      // 8 three-hour buckets across the local day, labeled '00:00' … '21:00'
      for (let b = 0; b < 8; b++) {
        const from = new Date(startOfToday.getTime() + b * 3 * 3_600_000)
        const to = new Date(from.getTime() + 3 * 3_600_000)
        const bucketTx = rangeTx.filter((t) => t.occurredAt >= from && t.occurredAt < to)
        series.push({
          date: `${String(b * 3).padStart(2, '0')}:00`,
          amount: round2(bucketTx.reduce((s, t) => s + t.amount, 0)),
          count: bucketTx.length,
        })
      }
    } else {
      for (let i = rangeDays - 1; i >= 0; i--) {
        const day = new Date(startOfToday.getTime() - i * 86_400_000)
        const next = new Date(day.getTime() + 86_400_000)
        const dayTx = rangeTx.filter((t) => t.occurredAt >= day && t.occurredAt < next)
        series.push({
          date:
            range === '7d'
              ? day.toLocaleString('en-US', { weekday: 'short' })
              : `${day.getDate()} ${day.toLocaleString('en-US', { month: 'short' })}`,
          amount: round2(dayTx.reduce((s, t) => s + t.amount, 0)),
          count: dayTx.length,
        })
      }
    }

    // ── Gateway share (over the range window) ───────────────────────
    const shareMap = new Map<string, { amount: number; count: number }>()
    for (const t of rangeTx) {
      const cur = shareMap.get(t.mfs) ?? { amount: 0, count: 0 }
      cur.amount += t.amount
      cur.count += 1
      shareMap.set(t.mfs, cur)
    }
    const gatewayShare = [...shareMap.entries()]
      .map(([mfs, v]) => ({ mfs, amount: round2(v.amount), count: v.count, color: MFS_COLORS[mfs] ?? '#94A3B8' }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6)

    // ── Success rate (range window, REVERSED excluded) ──────────────
    const okCount = rangeTx.filter((t) => t.status === 'PAID' || t.status === 'MATCHED').length
    const successRate = rangeTx.length > 0 ? round2((okCount / rangeTx.length) * 100) : null

    // ── Delta today vs yesterday (amount) ───────────────────────────
    const todayAmount = round2(todayAgg._sum.amount ?? 0)
    const yesterdayAmount = round2(yesterdayAgg._sum.amount ?? 0)
    const deltaPct = yesterdayAmount > 0 ? round2(((todayAmount - yesterdayAmount) / yesterdayAmount) * 100) : null

    const onlineCutoff = Date.now() - 5 * 60 * 1000
    const devicesOnline = devices.filter(
      (d) => d.status === 'ONLINE' && d.lastSeen && d.lastSeen.getTime() > onlineCutoff
    ).length

    return Response.json({
      today: { amount: todayAmount, count: todayAgg._count },
      yesterday: { amount: yesterdayAmount, count: yesterdayAgg._count },
      deltaPct,
      successRate,
      pendingCheckouts,
      devicesOnline,
      devicesTotal: devices.length,
      series,
      gatewayShare,
      recentTx,
      activity,
      checklist: {
        gatewaysEnabled: gatewaysEnabled > 0,
        devicePaired: devicePaired > 0,
        checkoutCreated: checkoutCreated > 0,
        webhookConfigured: webhookConfigured > 0,
        smsFlowTested: anyTx > 0,
      },
    })
  } catch (err) {
    return jsonError(err)
  }
}
