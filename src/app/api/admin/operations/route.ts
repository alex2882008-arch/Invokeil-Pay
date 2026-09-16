import { db } from '@/lib/db'
import { requireRole, jsonError } from '@/lib/auth'
import { getMergedSettings } from '@/lib/settings-defaults'

/**
 * GET /api/admin/operations — single operations-health payload:
 * provider health (email/SMS), webhook stats, backlog counters,
 * payment error rate, device fleet status, feature flags, open incidents, app mode.
 */
export async function GET() {
  try {
    await requireRole(['OWNER', 'ADMIN', 'DEVELOPER'])
    const since24h = new Date(Date.now() - 24 * 3600_000)
    const since7d = new Date(Date.now() - 7 * 24 * 3600_000)

    const [
      emailProviders,
      smsProviders,
      webhookPending,
      webhookFailed24h,
      webhookTotal24h,
      webhookSuccess24h,
      emailBounce24h,
      smsFailed24h,
      automationsWaiting,
      eventsFailed,
      checkouts7d,
      checkoutsBad7d,
      devices,
      flags,
      incidentsOpen,
      settings,
    ] = await Promise.all([
      db.emailProvider.findMany({
        orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
        select: { type: true, label: true, enabled: true, healthy: true, sentCount: true, failCount: true, lastError: true, fromEmail: true },
      }),
      db.smsProvider.findMany({
        orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
        select: { type: true, label: true, enabled: true, healthy: true, sentCount: true, failCount: true, lastError: true },
      }),
      db.webhookDelivery.count({ where: { status: 'PENDING' } }),
      db.webhookDelivery.count({ where: { status: 'FAILED', createdAt: { gte: since24h } } }),
      db.webhookDelivery.count({ where: { createdAt: { gte: since24h } } }),
      db.webhookDelivery.count({ where: { status: 'SUCCESS', createdAt: { gte: since24h } } }),
      db.emailMessage.count({ where: { status: 'BOUNCED', createdAt: { gte: since24h } } }),
      db.smsMessage.count({ where: { status: 'FAILED', createdAt: { gte: since24h } } }),
      db.automationRun.count({ where: { status: 'WAITING' } }),
      db.eventLedger.count({ where: { status: 'FAILED' } }),
      db.checkoutPage.count({ where: { createdAt: { gte: since7d } } }),
      db.checkoutPage.count({ where: { createdAt: { gte: since7d }, status: { in: ['CANCELLED', 'EXPIRED'] } } }),
      db.device.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, status: true, lastSeen: true, battery: true, model: true } }),
      db.featureFlag.findMany({ orderBy: { key: 'asc' } }),
      db.incident.count({ where: { status: { not: 'RESOLVED' } } }),
      getMergedSettings(),
    ])

    const online = devices.filter((d) => d.status === 'ONLINE').length
    const offlineDevices = devices
      .filter((d) => d.status !== 'ONLINE')
      .map((d) => ({ id: d.id, name: d.name, model: d.model, battery: d.battery, lastSeen: d.lastSeen, status: d.status }))

    const successRate = webhookTotal24h > 0 ? Math.round((webhookSuccess24h / webhookTotal24h) * 1000) / 10 : null
    const paymentErrorRate = checkouts7d > 0 ? Math.round((checkoutsBad7d / checkouts7d) * 1000) / 10 : null

    // Health verdict: which areas need attention
    const issues: string[] = []
    if (webhookPending > 0) issues.push('webhookPending')
    if (eventsFailed > 0) issues.push('eventsFailed')
    if (emailBounce24h > 0) issues.push('emailBounce')
    if (smsFailed24h > 0) issues.push('smsFailed')
    if (devices.length > 0 && online < devices.length) issues.push('devicesOffline')
    if (incidentsOpen > 0) issues.push('incidentsOpen')
    if (emailProviders.some((p) => p.enabled && !p.healthy) || smsProviders.some((p) => p.enabled && !p.healthy)) issues.push('providerFailing')

    return Response.json({
      ok: true,
      data: {
        generatedAt: new Date().toISOString(),
        appMode: settings.appMode === 'PRODUCTION' ? 'PRODUCTION' : 'SANDBOX',
        emailProviders,
        smsProviders,
        webhookStats: {
          pending: webhookPending,
          failed24h: webhookFailed24h,
          total24h: webhookTotal24h,
          success24h: webhookSuccess24h,
          successRate,
        },
        emailBounce24h,
        smsFailed24h,
        backlog: {
          webhookPending,
          automationsWaiting,
          eventsFailed,
        },
        payment: {
          errorRate: paymentErrorRate,
          cancelled: checkoutsBad7d,
          total: checkouts7d,
        },
        devices: {
          online,
          total: devices.length,
          offlineDevices,
        },
        flags,
        incidentsOpen,
        issues,
      },
    })
  } catch (e) {
    return jsonError(e)
  }
}
