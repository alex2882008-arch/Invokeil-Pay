'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import {
  Wallet, ArrowLeftRight, Percent, Smartphone, RefreshCw, CheckCircle2, Circle,
  ArrowRight, History, Inbox, ChevronRight,
} from 'lucide-react'
import { formatBDT, timeAgo } from '@/lib/format'
import { fetchApi } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import { useUrlState } from '@/hooks/use-url-state'
import { useLang } from '@/lib/i18n'
import { StatCard, MfsBadge, StatusBadge, EmptyState, ErrorCard } from './ui-bits'

// ── Types / guards ───────────────────────────────────────────────────────────

type Range = 'today' | '7d' | '30d'

interface StatsData {
  today: { amount: number; count: number }
  yesterday: { amount: number; count: number }
  deltaPct: number | null
  successRate: number | null
  pendingCheckouts: number
  devicesOnline: number
  devicesTotal: number
  series: Array<{ date: string; amount: number; count: number }>
  gatewayShare: Array<{ mfs: string; amount: number; count: number; color: string }>
  recentTx: Array<{ id: string; trxId: string | null; mfs: string; amount: number; senderNumber: string | null; status: string; occurredAt: string }>
  activity: Array<{ id: string; actorName: string; action: string; target: string | null; createdAt: string }>
  checklist: {
    gatewaysEnabled: boolean
    devicePaired: boolean
    checkoutCreated: boolean
    webhookConfigured: boolean
    smsFlowTested: boolean
  }
}

function isStatsData(d: unknown): d is StatsData {
  if (!d || typeof d !== 'object') return false
  const s = d as Partial<StatsData>
  return (
    !!s.today && typeof s.today.amount === 'number' && typeof s.today.count === 'number' &&
    !!s.yesterday && typeof s.yesterday.amount === 'number' &&
    Array.isArray(s.series) &&
    Array.isArray(s.gatewayShare) &&
    Array.isArray(s.recentTx) &&
    Array.isArray(s.activity) &&
    typeof s.devicesOnline === 'number' &&
    typeof s.devicesTotal === 'number' &&
    !!s.checklist
  )
}

// ── View ─────────────────────────────────────────────────────────────────────

export function DashboardView() {
  const { t } = useLang()
  const { get, set } = useUrlState()

  const rangeParam = get('range', 'today')
  const range: Range = rangeParam === '7d' || rangeParam === '30d' ? rangeParam : 'today'

  const [data, setData] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const d = await fetchApi<unknown>(`/api/admin/stats?range=${range}`)
      if (!isStatsData(d)) throw new Error('Unexpected response from server')
      setError(null)
      setData(d)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [range])

  useEffect(() => {
    setLoading(true)
    load()
    const iv = setInterval(() => { load() }, 15000)
    return () => { clearInterval(iv) }
  }, [load])

  const checklistItems = data
    ? [
        { done: data.checklist.gatewaysEnabled, label: t('ckGateways'), href: '/admin/gateways' },
        { done: data.checklist.devicePaired, label: t('ckDevice'), href: '/admin/devices' },
        { done: data.checklist.checkoutCreated, label: t('ckCheckout'), href: '/admin/checkouts' },
        { done: data.checklist.webhookConfigured, label: t('ckWebhook'), href: '/admin/merchants' },
        { done: data.checklist.smsFlowTested, label: t('ckSms'), href: '/admin/sms' },
      ]
    : []
  const allChecklistDone = checklistItems.length > 0 && checklistItems.every((i) => i.done)

  // ── Skeleton ───────────────────────────────────────────────────────────────
  if (loading && !data) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
        <Skeleton className="h-80 rounded-xl" />
        <div className="grid gap-4 lg:grid-cols-5">
          <Skeleton className="h-72 rounded-xl lg:col-span-3" />
          <Skeleton className="h-72 rounded-xl lg:col-span-2" />
        </div>
      </div>
    )
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (error && !data) {
    return <ErrorCard message={error} onRetry={() => { setLoading(true); load() }} />
  }
  if (!data) return null

  const amountsSpark = data.series.map((s) => s.amount)
  const countsSpark = data.series.map((s) => s.count)
  const shareMax = Math.max(...data.gatewayShare.map((g) => g.amount), 1)

  return (
    <div className="space-y-5">
      {/* Header row: range switcher */}
      <div className="anim-fade-in flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border bg-muted/40 p-1" role="tablist" aria-label={t('collectionsOverview')}>
          {(['today', '7d', '30d'] as const).map((r) => (
            <button
              key={r}
              type="button"
              role="tab"
              aria-selected={range === r}
              onClick={() => set({ range: r === 'today' ? null : r })}
              className={cn(
                'press rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors sm:text-sm',
                range === r ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {r === 'today' ? t('rangeToday') : r === '7d' ? t('range7') : t('range30')}
            </button>
          ))}
        </div>
        <Button variant="ghost" size="sm" className="press h-8 gap-1.5 text-muted-foreground" onClick={() => { setLoading(true); load() }}>
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} /> {t('refresh')}
        </Button>
      </div>

      {/* Stat cards */}
      <div className="stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t('todaysCollections')}
          value={formatBDT(data.today.amount)}
          icon={<Wallet className="h-5 w-5" />}
          tone="text-success bg-success/10"
          delta={data.deltaPct}
          deltaLabel={t('vsYesterday')}
          spark={amountsSpark}
          sparkColor="#10B981"
          loading={loading && data.today.amount === 0 && data.today.count === 0}
        />
        <StatCard
          label={t('todaysTransactions')}
          value={String(data.today.count)}
          icon={<ArrowLeftRight className="h-5 w-5" />}
          tone="text-primary bg-primary/10"
          spark={countsSpark}
        />
        <StatCard
          label={t('successRate')}
          value={data.successRate == null ? '—' : `${data.successRate.toFixed(1)}%`}
          icon={<Percent className="h-5 w-5" />}
          tone="text-warning bg-warning/10"
        />
        <StatCard
          label={t('devicesOnline')}
          value={`${data.devicesOnline}/${data.devicesTotal}`}
          icon={<Smartphone className="h-5 w-5" />}
          tone="text-purple-600 bg-purple-500/10 dark:text-purple-400"
        />
      </div>

      {/* Onboarding checklist — auto-hides when complete */}
      {!allChecklistDone && (
        <Card className="anim-fade-up p-4 shadow-brand sm:p-5">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-foreground">{t('setupChecklist')}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">{t('setupChecklistHint')}</p>
            </div>
            <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-[11px] font-bold text-muted-foreground tabular">
              {checklistItems.filter((i) => i.done).length}/{checklistItems.length}
            </span>
          </div>
          <div className="stagger grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {checklistItems.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className={cn(
                  'press hover-lift group flex items-center gap-2.5 rounded-xl border p-3 transition-colors',
                  item.done ? 'border-success/25 bg-success/5' : 'hover:border-primary/40 hover:bg-primary/5'
                )}
              >
                {item.done
                  ? <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
                  : <Circle className="h-5 w-5 shrink-0 text-muted-foreground/50" />}
                <span className={cn('flex-1 text-xs font-semibold', item.done ? 'text-success' : 'text-foreground/80')}>
                  {item.label}
                </span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
              </Link>
            ))}
          </div>
        </Card>
      )}

      {/* Chart + gateway share */}
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="anim-fade-up p-4 shadow-brand sm:p-5 lg:col-span-3">
          <div className="mb-4">
            <h2 className="text-sm font-bold text-foreground">{t('collectionsOverview')}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{t('chartHint')}</p>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.series} margin={{ top: 5, right: 8, left: -14, bottom: 0 }}>
                <defs>
                  <linearGradient id="dashAmt" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563EB" stopOpacity={0.32} />
                    <stop offset="100%" stopColor="#2563EB" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(148 163 184 / 0.2)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : String(v))} />
                <Tooltip
                  formatter={(v: number | string, name) => [name === 'amount' ? formatBDT(Number(v)) : v, name === 'amount' ? t('collections') : t('todaysTransactions')]}
                  contentStyle={{ borderRadius: 12, border: '1px solid rgb(148 163 184 / 0.25)', background: 'hsl(var(--card))', fontSize: 12, color: 'hsl(var(--card-foreground))' }}
                />
                <Area type="monotone" dataKey="amount" stroke="#2563EB" strokeWidth={2.2} fill="url(#dashAmt)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="anim-fade-up p-4 shadow-brand sm:p-5 lg:col-span-2">
          <div className="mb-4">
            <h2 className="text-sm font-bold text-foreground">{t('gatewayShare')}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{t('gatewayShareHint')}</p>
          </div>
          {data.gatewayShare.length === 0 ? (
            <EmptyState icon={<Inbox className="h-7 w-7" />} title={t('noTxTitle')} hint={t('noTxHint')} />
          ) : (
            <div className="stagger space-y-3.5">
              {data.gatewayShare.map((g) => (
                <div key={g.mfs}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <MfsBadge mfs={g.mfs} />
                      <span className="truncate text-[11px] text-muted-foreground">{g.count} {t('txCountSuffix')}</span>
                    </span>
                    <span className="tabular text-xs font-bold text-foreground">{formatBDT(g.amount)}</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.max((g.amount / shareMax) * 100, 3)}%`, backgroundColor: g.color }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Recent transactions + activity feed */}
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="anim-fade-up min-w-0 p-0 shadow-brand lg:col-span-3">
          <div className="flex items-center justify-between gap-2 px-4 py-4 sm:px-5">
            <h2 className="text-sm font-bold text-foreground">{t('recentTransactions')}</h2>
            <Link href="/admin/transactions" className="press inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
              {t('viewAllTx')} <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {data.recentTx.length === 0 ? (
            <div className="px-5 pb-6">
              <EmptyState
                icon={<Inbox className="h-7 w-7" />}
                title={t('noTxTitle')}
                hint={t('noTxHint')}
                action={
                  <Link href="/admin/sms">
                    <Button size="sm" className="press gap-1.5">{t('openSmsCenter')}</Button>
                  </Link>
                }
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y bg-muted/50 text-left">
                    <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:px-5">{t('mfs')}</th>
                    <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t('trxId')}</th>
                    <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t('amount')}</th>
                    <th className="hidden px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:table-cell">{t('senderCol')}</th>
                    <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t('status')}</th>
                    <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:px-5">{t('timeCol')}</th>
                  </tr>
                </thead>
                <tbody className="stagger">
                  {data.recentTx.map((tx) => (
                    <tr key={tx.id} className="border-b transition-colors last:border-0 hover:bg-muted/40">
                      <td className="px-4 py-2.5 sm:px-5"><MfsBadge mfs={tx.mfs} /></td>
                      <td className="px-3 py-2.5">
                        <Link href={`/admin/transactions/${tx.id}`} className="block max-w-36 truncate font-mono text-xs font-medium text-primary hover:underline">
                          {tx.trxId ?? '—'}
                        </Link>
                      </td>
                      <td className="tabular px-3 py-2.5 font-semibold text-foreground">{formatBDT(tx.amount)}</td>
                      <td className="hidden max-w-32 truncate px-3 py-2.5 text-xs text-muted-foreground sm:table-cell">{tx.senderNumber ?? '—'}</td>
                      <td className="px-3 py-2.5"><StatusBadge status={tx.status} /></td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right text-xs text-muted-foreground sm:px-5">{timeAgo(tx.occurredAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="anim-fade-up p-4 shadow-brand sm:p-5 lg:col-span-2">
          <div className="mb-3 flex items-center gap-2">
            <History className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-bold text-foreground">{t('activityFeed')}</h2>
          </div>
          {data.activity.length === 0 ? (
            <EmptyState icon={<History className="h-7 w-7" />} title={t('noActivity')} hint={t('noActivityHint')} />
          ) : (
            <div className="nice-scroll max-h-96 space-y-1 overflow-y-auto pr-1">
              {data.activity.map((a) => (
                <div key={a.id} className="flex items-start gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/50">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                    {a.actorName.slice(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-1.5 text-xs">
                      <span className="font-semibold text-foreground">{a.actorName}</span>
                      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{a.action}</code>
                    </p>
                    {a.target && <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground/70">{a.target}</p>}
                  </div>
                  <span className="shrink-0 text-[10px] text-muted-foreground/70">{timeAgo(a.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Pending checkouts quick strip */}
      {data.pendingCheckouts > 0 && (
        <Link
          href="/admin/checkouts"
          className="press hover-lift anim-fade-up flex items-center justify-between gap-3 rounded-xl border border-warning/30 bg-warning/5 px-4 py-3"
        >
          <span className="text-xs font-semibold text-foreground/80">
            {data.pendingCheckouts} {t('pendingCheckouts')}
          </span>
          <ChevronRight className="h-4 w-4 text-warning" />
        </Link>
      )}
    </div>
  )
}
