'use client'

import { useCallback, useEffect, useState } from 'react'
import { Activity, CalendarClock, CheckCircle2, RefreshCw } from 'lucide-react'
import { SITE } from '@/lib/site/site-config'

interface StatusPayload {
  ok: boolean
  data?: {
    overall: string
    components: Array<{ id: string; name: string; status: string }>
    activeIncidents: Array<{
      id: string; title: string; body: string; impact: string; status: string
      components: string[]; updates: Array<{ at: string; body: string; status: string }>
      startedAt: string; resolvedAt: string | null
    }>
    pastIncidents: Array<{ id: string; title: string; impact: string; startedAt: string; resolvedAt: string | null }>
    summary: { days: number; incidents90d: number; resolved90d: number; open: number; uptimeEstimate: number }
    generatedAt: string
  }
  error?: string
}

const COMPONENT_STYLES: Record<string, { label: string; dot: string; row: string }> = {
  OPERATIONAL: { label: 'Operational', dot: 'bg-emerald-500', row: 'text-foreground' },
  DEGRADED: { label: 'Degraded performance', dot: 'bg-amber-500', row: 'text-foreground' },
  PARTIAL: { label: 'Partial outage', dot: 'bg-amber-500', row: 'text-foreground' },
  OUTAGE: { label: 'Major outage', dot: 'bg-red-500', row: 'text-foreground' },
  MAINTENANCE: { label: 'Maintenance', dot: 'bg-sky-500', row: 'text-foreground' },
}

const BANNER: Record<string, { title: string; sub: string; cls: string; pulse: string }> = {
  OPERATIONAL: { title: 'All systems operational', sub: 'Every component is reporting healthy.', cls: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200', pulse: 'bg-emerald-500' },
  DEGRADED: { title: 'Degraded performance', sub: 'Some components are slower than usual — we are on it.', cls: 'border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200', pulse: 'bg-amber-500' },
  PARTIAL: { title: 'Partial outage', sub: 'A subset of components is affected.', cls: 'border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200', pulse: 'bg-amber-500' },
  OUTAGE: { title: 'Major outage', sub: 'We are actively investigating. Follow the incident updates below.', cls: 'border-red-500/40 bg-red-500/10 text-red-900 dark:text-red-200', pulse: 'bg-red-500' },
  MAINTENANCE: { title: 'Scheduled maintenance', sub: 'Planned work is in progress — payments are unaffected unless stated.', cls: 'border-sky-500/40 bg-sky-500/10 text-sky-900 dark:text-sky-200', pulse: 'bg-sky-500' },
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
}

function duration(start: string, end: string | null) {
  const ms = (end ? new Date(end).getTime() : Date.now()) - new Date(start).getTime()
  const m = Math.max(0, Math.round(ms / 60000))
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  return `${h} h ${m % 60} min`
}

export function StatusLive() {
  const [state, setState] = useState<{ data: StatusPayload['data'] | null; error: string | null; loading: boolean }>({
    data: null, error: null, loading: true,
  })

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/public/status', { cache: 'no-store' })
      const json = (await res.json()) as StatusPayload
      if (!res.ok || !json.ok || !json.data) throw new Error(json.error ?? 'Status unavailable')
      setState({ data: json.data, error: null, loading: false })
    } catch (e) {
      setState((s) => ({ ...s, error: e instanceof Error ? e.message : 'Status unavailable', loading: false }))
    }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 60_000) // auto-refresh every 60s
    return () => clearInterval(t)
  }, [load])

  if (state.loading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-live="polite">
        <div className="h-24 animate-pulse rounded-2xl bg-muted" />
        <div className="h-40 animate-pulse rounded-2xl bg-muted" />
        <div className="h-64 animate-pulse rounded-2xl bg-muted" />
        <span className="sr-only">Loading system status…</span>
      </div>
    )
  }

  if (state.error || !state.data) {
    return (
      <div role="alert" className="rounded-2xl border border-red-500/40 bg-red-500/5 p-6">
        <h2 className="font-semibold text-foreground">Status is temporarily unavailable</h2>
        <p className="mt-1 text-sm text-muted-foreground">{state.error} — retrying in 60 seconds.</p>
      </div>
    )
  }

  const d = state.data
  const banner = BANNER[d.overall] ?? BANNER.OPERATIONAL

  return (
    <div className="space-y-10">
      {/* Overall banner */}
      <section aria-label="Overall system status" className={`anim-fade-up rounded-2xl border p-6 ${banner.cls}`}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3" aria-hidden="true">
              <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${banner.pulse}`} />
              <span className={`relative inline-flex h-3 w-3 rounded-full ${banner.pulse}`} />
            </span>
            <div>
              <h2 className="text-lg font-bold">{banner.title}</h2>
              <p className="text-sm opacity-80">{banner.sub}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs opacity-80">
            <span className="inline-flex items-center gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Auto-refreshes every 60 s
            </span>
            <a
              href={`mailto:${SITE.emails.support}?subject=Subscribe%20to%20Invokeil%20Pay%20status%20updates`}
              className="press inline-flex h-9 items-center rounded-lg border bg-background/60 px-3 font-semibold text-inherit"
            >
              Subscribe to updates
            </a>
          </div>
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-current/10 pt-4 text-sm sm:grid-cols-4" aria-label="90-day summary">
          <div><dt className="opacity-70">Uptime (90d)</dt><dd className="font-bold">{d.summary.uptimeEstimate}%</dd></div>
          <div><dt className="opacity-70">Incidents (90d)</dt><dd className="font-bold">{d.summary.incidents90d}</dd></div>
          <div><dt className="opacity-70">Open now</dt><dd className="font-bold">{d.summary.open}</dd></div>
          <div><dt className="opacity-70">Last check</dt><dd className="font-bold">{fmt(d.generatedAt)}</dd></div>
        </dl>
      </section>

      {/* Components */}
      <section aria-labelledby="components-h">
        <h2 id="components-h" className="flex items-center gap-2 text-xl font-bold tracking-tight text-foreground">
          <Activity className="h-5 w-5 text-primary" aria-hidden="true" /> Components
        </h2>
        {d.components.length === 0 ? (
          <p className="mt-3 rounded-2xl border bg-card p-5 text-sm text-muted-foreground">
            No components are published yet. Administrators configure them under Admin → Status components; the overall
            banner above reflects live incident data.
          </p>
        ) : (
          <ul className="stagger mt-4 grid gap-2 sm:grid-cols-2">
            {d.components.map((c) => {
              const st = COMPONENT_STYLES[c.status] ?? COMPONENT_STYLES.OPERATIONAL
              return (
                <li key={c.id} className="flex items-center justify-between rounded-xl border bg-card px-4 py-3">
                  <span className={`text-sm font-medium ${st.row}`}>{c.name}</span>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className={`h-2 w-2 rounded-full ${st.dot}`} aria-hidden="true" />
                    {st.label}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* Active incidents */}
      <section aria-labelledby="active-h">
        <h2 id="active-h" className="text-xl font-bold tracking-tight text-foreground">Active incidents</h2>
        {d.activeIncidents.length === 0 ? (
          <div className="mt-4 flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
            <p className="text-sm text-foreground">No active incidents — nothing to see here.</p>
          </div>
        ) : (
          <ul className="mt-4 space-y-4">
            {d.activeIncidents.map((inc) => (
              <li key={inc.id} className="rounded-2xl border bg-card p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                    inc.impact === 'CRITICAL' ? 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400'
                    : inc.impact === 'MAINTENANCE' ? 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-400'
                    : 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400'
                  }`}>{inc.impact}</span>
                  <span className="rounded-full border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">{inc.status}</span>
                  <h3 className="text-base font-semibold text-foreground">{inc.title}</h3>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Started {fmt(inc.startedAt)} · ongoing {duration(inc.startedAt, inc.resolvedAt)}
                  {inc.components.length > 0 && <> · affecting {inc.components.join(', ')}</>}
                </p>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{inc.body}</p>
                {inc.updates.length > 0 && (
                  <ol className="mt-4 space-y-3 border-l pl-4" aria-label="Incident updates">
                    {inc.updates.map((u, i) => (
                      <li key={i} className="relative text-sm">
                        <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
                        <p className="text-xs text-muted-foreground">{fmt(u.at)} · <span className="font-semibold text-foreground">{u.status}</span></p>
                        <p className="mt-0.5 leading-relaxed text-foreground/90">{u.body}</p>
                      </li>
                    ))}
                  </ol>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Past incidents */}
      <section aria-labelledby="past-h">
        <h2 id="past-h" className="flex items-center gap-2 text-xl font-bold tracking-tight text-foreground">
          <CalendarClock className="h-5 w-5 text-primary" aria-hidden="true" /> Past 90 days
        </h2>
        {d.pastIncidents.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">No incidents resolved in the last 90 days.</p>
        ) : (
          <ul className="mt-4 divide-y rounded-2xl border bg-card">
            {d.pastIncidents.map((inc) => (
              <li key={inc.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5">
                <div>
                  <p className="text-sm font-medium text-foreground">{inc.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {fmt(inc.startedAt)} → {inc.resolvedAt ? fmt(inc.resolvedAt) : '—'} · {duration(inc.startedAt, inc.resolvedAt)}
                  </p>
                </div>
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">Resolved</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
