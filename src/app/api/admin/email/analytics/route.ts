import { db } from '@/lib/db'
import { requireRole, jsonError } from '@/lib/auth'

/** GET — communication analytics: totals, per-provider health, 14-day daily sent, rates. */
export async function GET() {
  try {
    await requireRole(['OWNER', 'ADMIN', 'FINANCE'])

    const [sent, failed, bounced, delivered, opened, clicked, received, costAgg, providers, recent] = await Promise.all([
      db.emailMessage.count({ where: { direction: 'SENT' } }),
      db.emailMessage.count({ where: { status: 'FAILED' } }),
      db.emailMessage.count({ where: { status: 'BOUNCED' } }),
      db.emailMessage.count({ where: { status: { in: ['DELIVERED', 'OPENED', 'CLICKED'] } } }),
      db.emailMessage.count({ where: { status: { in: ['OPENED', 'CLICKED'] } } }),
      db.emailMessage.count({ where: { status: 'CLICKED' } }),
      db.emailMessage.count({ where: { direction: 'RECEIVED' } }),
      db.emailMessage.aggregate({ _sum: { cost: true } }),
      db.emailProvider.findMany({ orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }] }),
      db.emailMessage.findMany({
        where: { direction: 'SENT', createdAt: { gte: fourteenDaysAgo() } },
        select: { createdAt: true },
      }),
    ])

    // 14-day daily sent counts (JS aggregation — SQLite-safe, timezone = server)
    const days: Array<{ date: string; sent: number }> = []
    const byDay = new Map<string, number>()
    for (let i = 13; i >= 0; i--) {
      const d = new Date()
      d.setHours(0, 0, 0, 0)
      d.setDate(d.getDate() - i)
      byDay.set(d.toISOString().slice(0, 10), 0)
    }
    for (const row of recent) {
      const key = new Date(row.createdAt).toISOString().slice(0, 10)
      if (byDay.has(key)) byDay.set(key, (byDay.get(key) ?? 0) + 1)
    }
    for (const [date, count] of byDay) days.push({ date, sent: count })

    const totalSent = sent || 0
    return Response.json({
      ok: true,
      data: {
        totals: { sent: totalSent, failed, bounced, delivered, opened, clicked, received, costTotal: costAgg._sum.cost ?? 0 },
        // Placeholder engagement rates until open/click webhooks are wired to a provider.
        openRate: totalSent > 0 ? ((opened / totalSent) * 100) : 0,
        clickRate: totalSent > 0 ? ((clicked / totalSent) * 100) : 0,
        providers: providers.map((p) => ({
          id: p.id,
          type: p.type,
          label: p.label,
          enabled: p.enabled,
          healthy: p.healthy,
          sentCount: p.sentCount,
          failCount: p.failCount,
          lastError: p.lastError,
        })),
        daily: days,
      },
    })
  } catch (e) {
    return jsonError(e)
  }
}

function fourteenDaysAgo(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - 13)
  return d
}
