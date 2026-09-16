'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { BarChart3, Download, PieChart as PieIcon, CalendarRange } from 'lucide-react'
import { toast } from 'sonner'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend,
} from 'recharts'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { fetchApi } from '@/lib/api-client'
import { MFS_META, formatBDT } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useUrlState } from '@/hooks/use-url-state'
import { useLang } from '@/lib/i18n'
import { MfsBadge, StatusBadge } from './ui-bits'
import {
  PageHeader, StatCard, EmptyState, ErrorCard,
} from './ui-bits'

// ── Types ────────────────────────────────────────────────────────────────────

interface ReportData {
  range: { from: string; to: string }
  summary: {
    volume: number
    count: number
    successRate: number | null
    avgValue: number | null
    fees: number
    unmatched: number
  }
  daily: Array<{ date: string; count: number; volume: number; fees: number }>
  byGateway: Array<{ mfs: string; count: number; volume: number }>
  byStatus: Array<{ status: string; count: number }>
}

const RANGES = ['today', 'yesterday', '7d', '30d', 'month', 'custom'] as const
type RangeKey = (typeof RANGES)[number]

/** Hex colors matching STATUS_META tones (chart-safe). */
const STATUS_COLORS: Record<string, string> = {
  PAID: '#16a34a',
  MATCHED: '#2563EB',
  UNMATCHED: '#f59e0b',
  REVERSED: '#dc2626',
  PENDING: '#94a3b8',
  AWAITING: '#f59e0b',
  CANCELLED: '#dc2626',
  EXPIRED: '#94a3b8',
}

function isReportData(d: unknown): d is ReportData {
  if (!d || typeof d !== 'object') return false
  const o = d as Partial<ReportData>
  return !!o.summary && Array.isArray(o.daily) && Array.isArray(o.byGateway) && Array.isArray(o.byStatus)
}

function statusLabel(s: string): string {
  return s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ')
}

// ── View ─────────────────────────────────────────────────────────────────────

export function ReportsView() {
  const { t } = useLang()
  const { get, set } = useUrlState()

  const rangeParam = get('range', '7d')
  const range: RangeKey = (RANGES as readonly string[]).includes(rangeParam) ? (rangeParam as RangeKey) : '7d'
  const from = get('from')
  const to = get('to')

  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const effectiveFrom = range === 'custom' ? from : ''
  const effectiveTo = range === 'custom' ? to : ''
  const customReady = range !== 'custom' || (!!from && !!to)

  const query = useMemo(() => {
    const params = new URLSearchParams({ range })
    if (range === 'custom' && from && to) {
      params.set('from', from)
      params.set('to', to)
    }
    return params
  }, [range, from, to])

  const load = useCallback(async () => {
    if (!customReady) return
    setLoading(true)
    try {
      const d = await fetchApi<unknown>(`/api/admin/reports?${query.toString()}`)
      if (!isReportData(d)) throw new Error('Unexpected response from server')
      setError(null)
      setData(d)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [query, customReady])

  useEffect(() => { load() }, [load])

  const pickRange = (r: RangeKey) => {
    if (r === 'custom') {
      set({ range: r, from: from || undefined, to: to || undefined })
    } else {
      set({ range: r, from: null, to: null })
    }
  }

  const maxGatewayVolume = useMemo(
    () => (data?.byGateway ?? []).reduce((m, g) => Math.max(m, g.volume), 0),
    [data]
  )
  const totalStatusCount = useMemo(
    () => (data?.byStatus ?? []).reduce((s, x) => s + x.count, 0),
    [data]
  )
  const pieData = useMemo(
    () => (data?.byStatus ?? []).map((s) => ({ ...s, label: statusLabel(s.status) })),
    [data]
  )

  const rangeLabel = useMemo(() => {
    if (!data) return ''
    const f = new Date(data.range.from)
    const to2 = new Date(data.range.to)
    const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    return `${fmt(f)} → ${fmt(to2)}`
  }, [data])

  return (
    <div>
      <PageHeader
        title={t('reports')}
        description={t('rpSub')}
        icon={<BarChart3 className="h-5 w-5" />}
        actions={
          <a
            href={customReady ? `/api/admin/reports?${query.toString()}&format=csv` : '#'}
            onClick={(e) => { if (!customReady) { e.preventDefault(); toast.error(t('rpInvalidRange')) } }}
            download
            className={cn('inline-flex h-9 items-center gap-1.5 rounded-md border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted press', !customReady && 'pointer-events-none opacity-50')}
            aria-label={t('rpExportCsv')}
          >
            <Download className="h-4 w-4" /> {t('rpExportCsv')}
          </a>
        }
      />

      {/* Range presets */}
      <div className="mb-5 flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t('reports')}>
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => pickRange(r)}
              aria-pressed={range === r}
              className={cn(
                'press min-h-9 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors',
                range === r
                  ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                  : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              {t(`rpRange${r.charAt(0).toUpperCase()}${r.slice(1)}`)}
            </button>
          ))}
        </div>
        {range === 'custom' && (
          <div className="anim-fade-in flex flex-wrap items-end gap-3 rounded-xl border bg-card p-3.5 shadow-brand">
            <div className="grid gap-1.5">
              <Label htmlFor="rp-from" className="text-xs">{t('rpFrom')}</Label>
              <Input
                id="rp-from" type="date" value={from}
                onChange={(e) => set({ from: e.target.value || undefined })}
                className="h-9 w-40"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rp-to" className="text-xs">{t('rpTo')}</Label>
              <Input
                id="rp-to" type="date" value={to}
                onChange={(e) => set({ to: e.target.value || undefined })}
                className="h-9 w-40"
              />
            </div>
          </div>
        )}
      </div>

      {error && !data ? (
        <ErrorCard message={error} onRetry={load} />
      ) : loading && !data ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
          </div>
          <Skeleton className="h-72 rounded-xl" />
        </div>
      ) : !data ? (
        <Card className="border-dashed p-2 shadow-brand">
          <EmptyState icon={<CalendarRange className="h-7 w-7" />} title={t('rpInvalidRange')} />
        </Card>
      ) : (
        <>
          {/* Summary stat cards */}
          <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard
              label={t('rpStatVolume')}
              value={formatBDT(data.summary.volume)}
              icon={<BarChart3 className="h-5 w-5" />}
              tone="text-primary bg-primary/10"
              deltaLabel={t('rpVolumeHint')}
            />
            <StatCard
              label={t('rpStatCount')}
              value={String(data.summary.count)}
              icon={<PieIcon className="h-5 w-5" />}
              tone="text-success bg-success/10"
              deltaLabel={t('rpCountHint')}
            />
            <StatCard
              label={t('rpStatSuccess')}
              value={data.summary.successRate != null ? `${data.summary.successRate}%` : '—'}
              icon={<PieIcon className="h-5 w-5" />}
              tone="text-warning bg-warning/10"
              deltaLabel={t('rpSuccessHint')}
            />
            <StatCard
              label={t('rpStatAvg')}
              value={data.summary.avgValue != null ? formatBDT(data.summary.avgValue) : '—'}
              icon={<BarChart3 className="h-5 w-5" />}
              tone="text-primary bg-primary/10"
              deltaLabel={t('rpAvgHint')}
            />
            <StatCard
              label={t('rpStatFees')}
              value={formatBDT(data.summary.fees)}
              icon={<Download className="h-5 w-5" />}
              tone="text-destructive bg-destructive/10"
              deltaLabel={t('rpFeesHint')}
            />
          </div>

          {data.summary.count === 0 && data.byStatus.length === 0 ? (
            <Card className="border-dashed p-2 shadow-brand">
              <EmptyState icon={<BarChart3 className="h-7 w-7" />} title={t('rpNoData')} hint={t('rpNoDataHint')} />
            </Card>
          ) : (
            <div className="space-y-4">
              {/* Charts row */}
              <div className="grid gap-4 lg:grid-cols-5">
                <Card className="anim-fade-up p-4 shadow-brand sm:p-5 lg:col-span-3">
                  <div className="mb-4">
                    <h2 className="text-sm font-bold text-foreground">{t('rpDailyChart')}</h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">{t('rpDailyChartHint')}</p>
                  </div>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.daily} margin={{ top: 5, right: 8, left: -10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgb(148 163 184 / 0.2)" vertical={false} />
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v: string) => v.slice(5)} />
                        <YAxis
                          tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={52}
                          tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : String(v))}
                        />
                        <Tooltip
                          formatter={(v: number | string) => [formatBDT(Number(v)), t('rpStatVolume')]}
                          contentStyle={{ borderRadius: 12, border: '1px solid rgb(148 163 184 / 0.25)', background: 'hsl(var(--card))', fontSize: 12, color: 'hsl(var(--card-foreground))' }}
                        />
                        <Bar dataKey="volume" fill="#2563EB" radius={[5, 5, 0, 0]} maxBarSize={42} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Card>

                <Card className="anim-fade-up p-4 shadow-brand sm:p-5 lg:col-span-2">
                  <div className="mb-4">
                    <h2 className="text-sm font-bold text-foreground">{t('rpByStatus')}</h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">{t('rpByStatusHint')}</p>
                  </div>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData} dataKey="count" nameKey="label"
                          cx="50%" cy="45%" innerRadius="52%" outerRadius="80%"
                          paddingAngle={2} strokeWidth={2}
                        >
                          {pieData.map((s) => (
                            <Cell key={s.status} fill={STATUS_COLORS[s.status] ?? '#94a3b8'} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(v: number | string, name) => [`${v} ${t('rpTxSuffix').trim()}`, name]}
                          contentStyle={{ borderRadius: 12, border: '1px solid rgb(148 163 184 / 0.25)', background: 'hsl(var(--card))', fontSize: 12, color: 'hsl(var(--card-foreground))' }}
                        />
                        <Legend
                          iconType="circle" iconSize={8}
                          formatter={(value: string) => <span className="text-xs text-muted-foreground">{value}</span>}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              </div>

              {/* Tables row */}
              <div className="grid gap-4 lg:grid-cols-2">
                {/* By gateway */}
                <Card className="anim-fade-up p-4 shadow-brand sm:p-5">
                  <div className="mb-4">
                    <h2 className="text-sm font-bold text-foreground">{t('rpByGateway')}</h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">{t('rpByGatewayHint')}</p>
                  </div>
                  {data.byGateway.length === 0 ? (
                    <p className="py-6 text-center text-xs text-muted-foreground">{t('rpNoData')}</p>
                  ) : (
                    <div className="space-y-3">
                      {data.byGateway.map((g) => (
                        <div key={g.mfs} className="group">
                          <div className="mb-1 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <MfsBadge mfs={g.mfs} />
                              <span className="text-[11px] text-muted-foreground">{g.count}{t('rpTxSuffix')}</span>
                            </div>
                            <span className="tabular text-xs font-bold text-foreground">{formatBDT(g.volume)}</span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{
                                width: `${maxGatewayVolume > 0 ? Math.max((g.volume / maxGatewayVolume) * 100, 4) : 0}%`,
                                backgroundColor: MFS_META[g.mfs]?.color ?? '#64748B',
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>

                {/* By status */}
                <Card className="anim-fade-up p-4 shadow-brand sm:p-5">
                  <div className="mb-4">
                    <h2 className="text-sm font-bold text-foreground">{t('rpByStatus')}</h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">{t('rpByStatusHint')}</p>
                  </div>
                  <div className="space-y-2.5">
                    {data.byStatus.map((s) => (
                      <div key={s.status} className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <StatusBadge status={s.status} />
                        </div>
                        <div className="flex items-center gap-2.5">
                          <span className="tabular text-sm font-bold text-foreground">{s.count}</span>
                          <span className="w-14 text-right text-[11px] text-muted-foreground">
                            {totalStatusCount > 0 ? `${Math.round((s.count / totalStatusCount) * 100)}%` : '—'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>

              {/* Daily table */}
              <Card className="anim-fade-up overflow-hidden p-0 shadow-brand">
                <div className="flex items-center justify-between gap-2 px-4 py-3.5 sm:px-5">
                  <div>
                    <h2 className="text-sm font-bold text-foreground">{t('rpDailyTable')}</h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">{rangeLabel}</p>
                  </div>
                  <a
                    href={customReady ? `/api/admin/reports?${query.toString()}&format=csv` : '#'}
                    download
                    className={cn('press inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border bg-background px-2.5 text-xs font-medium hover:bg-muted', !customReady && 'pointer-events-none opacity-50')}
                    aria-label={t('rpExportCsv')}
                  >
                    <Download className="h-3.5 w-3.5" /> CSV
                  </a>
                </div>
                <div className="overflow-x-auto border-t">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50 text-left">
                        <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('rpDateCol')}</th>
                        <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('rpCountCol')}</th>
                        <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('rpVolumeCol')}</th>
                        <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('rpFeesCol')}</th>
                      </tr>
                    </thead>
                    <tbody className="stagger">
                      {data.daily.map((d) => (
                        <tr key={d.date} className="border-b transition-colors last:border-0 hover:bg-muted/40">
                          <td className="px-4 py-2.5 font-mono text-xs font-semibold text-foreground">{d.date}</td>
                          <td className="px-4 py-2.5 tabular text-sm">{d.count}</td>
                          <td className="px-4 py-2.5 tabular text-sm font-bold text-foreground">{formatBDT(d.volume)}</td>
                          <td className="px-4 py-2.5 text-right tabular text-xs text-muted-foreground">{formatBDT(d.fees)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  )
}
