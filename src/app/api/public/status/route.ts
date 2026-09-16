import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

/** Public (no-auth) health data powering /status. */
function parseJsonArray(raw: string | null | undefined): string[] | Array<Record<string, unknown>> {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

const SEVERITY: Record<string, number> = {
  OUTAGE: 4,
  PARTIAL: 3,
  DEGRADED: 2,
  MAINTENANCE: 1,
  OPERATIONAL: 0,
}

const INCIDENT_SEVERITY: Record<string, string> = {
  CRITICAL: 'OUTAGE',
  MAJOR: 'DEGRADED',
  MINOR: 'DEGRADED',
  MAINTENANCE: 'MAINTENANCE',
}

export async function GET() {
  try {
    const [components, incidents] = await Promise.all([
      db.statusComponent.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
      db.incident.findMany({
        where: { startedAt: { gte: new Date(Date.now() - 90 * 24 * 3600_000) } },
        orderBy: { startedAt: 'desc' },
        take: 100,
      }),
    ])

    const activeIncidents = incidents
      .filter((i) => i.status !== 'RESOLVED')
      .map((i) => ({
        id: i.id,
        title: i.title,
        body: i.body,
        impact: i.impact,
        status: i.status,
        components: parseJsonArray(i.components) as string[],
        updates: parseJsonArray(i.updates) as Array<{ at: string; body: string; status: string }>,
        startedAt: i.startedAt.toISOString(),
        resolvedAt: i.resolvedAt?.toISOString() ?? null,
      }))

    const pastIncidents = incidents
      .filter((i) => i.status === 'RESOLVED')
      .map((i) => ({
        id: i.id,
        title: i.title,
        impact: i.impact,
        status: i.status,
        startedAt: i.startedAt.toISOString(),
        resolvedAt: i.resolvedAt?.toISOString() ?? null,
      }))

    // Overall = worst signal across components + active incidents
    let overall = 'OPERATIONAL'
    let worst = 0
    for (const c of components) {
      const s = SEVERITY[c.status] ?? 0
      if (s > worst) { worst = s; overall = c.status }
    }
    for (const inc of activeIncidents) {
      const mapped = INCIDENT_SEVERITY[inc.impact] ?? 'DEGRADED'
      const s = SEVERITY[mapped] ?? 2
      if (s > worst) { worst = s; overall = mapped }
    }

    // Uptime-ish estimate from incident durations over the 90-day window
    const windowMinutes = 90 * 24 * 60
    let downtimeMinutes = 0
    for (const i of incidents) {
      if (i.impact === 'MAINTENANCE') continue
      const end = i.resolvedAt ?? new Date()
      const mins = Math.min(24 * 60, Math.max(0, (end.getTime() - i.startedAt.getTime()) / 60_000))
      downtimeMinutes += mins
    }
    const uptimeEstimate = Math.max(90, Math.min(100, 100 - (downtimeMinutes / windowMinutes) * 100))

    return Response.json({
      ok: true,
      data: {
        overall,
        components: components.map((c) => ({ id: c.id, name: c.name, status: c.status, sortOrder: c.sortOrder })),
        activeIncidents,
        pastIncidents,
        summary: {
          days: 90,
          incidents90d: incidents.length,
          resolved90d: pastIncidents.length,
          open: activeIncidents.length,
          uptimeEstimate: Math.round(uptimeEstimate * 100) / 100,
        },
        generatedAt: new Date().toISOString(),
      },
    })
  } catch {
    return Response.json({ ok: false, error: 'Status temporarily unavailable' }, { status: 500 })
  }
}
