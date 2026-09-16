'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader, EmptyState, ErrorCard } from './ui-bits'
import { useLang } from '@/lib/i18n'
import { OPS_EN, OPS_BN } from '@/lib/i18n/operations'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { formatDateTime } from '@/lib/format'
import {
  Activity, Mail, MessageSquare, Globe, Clock, AlertTriangle, Smartphone,
  FlaskConical, RefreshCw, Plus, Trash2, ArrowRight, ShieldCheck, ChevronRight, TriangleAlert,
} from 'lucide-react'

// ── i18n helper (module dict fallback until main agent registers) ────────────

function useOpsT() {
  const { t, lang } = useLang()
  return useCallback((k: string) => {
    const v = t(k)
    if (v && v !== k) return v
    return (lang === 'bn' ? OPS_BN[k] : OPS_EN[k]) ?? OPS_EN[k] ?? k
  }, [t, lang])
}

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' })
  const j = (await res.json().catch(() => ({}))) as { data?: T; error?: string }
  if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
  return (j.data ?? j) as T
}

async function sendJSON<T>(url: string, body: unknown, method = 'POST'): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
  const j = (await res.json().catch(() => ({}))) as { data?: T; error?: string }
  if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
  return (j.data ?? j) as T
}

// ── types ────────────────────────────────────────────────────────────────────

type ProviderRow = {
  type: string
  label: string
  enabled: boolean
  healthy: boolean
  sentCount: number
  failCount: number
  lastError: string | null
  fromEmail?: string
}

type OpsData = {
  generatedAt: string
  appMode: 'SANDBOX' | 'PRODUCTION'
  emailProviders: ProviderRow[]
  smsProviders: ProviderRow[]
  webhookStats: { pending: number; failed24h: number; total24h: number; success24h: number; successRate: number | null }
  emailBounce24h: number
  smsFailed24h: number
  backlog: { webhookPending: number; automationsWaiting: number; eventsFailed: number }
  payment: { errorRate: number | null; cancelled: number; total: number }
  devices: { online: number; total: number; offlineDevices: Array<{ id: string; name: string; model: string | null; battery: number | null; lastSeen: string | null; status: string }> }
  flags: FlagRow[]
  incidentsOpen: number
  issues: string[]
}

type FlagRow = {
  id: string
  key: string
  name: string
  description: string | null
  enabled: boolean
  rolloutPercent: number
}

// ── small pieces ─────────────────────────────────────────────────────────────

function SuccessBar({ sent, failed }: { sent: number; failed: number }) {
  const total = sent + failed
  const pct = total > 0 ? Math.round((sent / total) * 100) : null
  return (
    <div className="flex items-center gap-2" aria-hidden="true">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full transition-all', pct == null ? 'w-0 bg-muted-foreground/30' : pct >= 95 ? 'w-full bg-success' : pct >= 80 ? 'bg-warning' : 'bg-destructive')}
          style={pct == null ? undefined : { width: `${pct}%` }}
        />
      </div>
      <span className="w-10 shrink-0 text-right text-[10px] font-semibold tabular text-muted-foreground">{pct == null ? '—' : `${pct}%`}</span>
    </div>
  )
}

function ProviderRowItem({ p, toneLabel }: { p: ProviderRow; toneLabel: { healthy: string; failing: string; disabled: string } }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border bg-background/50 px-3 py-2.5">
      <span
        className={cn(
          'h-2 w-2 shrink-0 rounded-full',
          !p.enabled ? 'bg-muted-foreground/40' : p.healthy ? 'live-dot bg-success' : 'bg-destructive'
        )}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">{p.label}</p>
        <p className="truncate text-[11px] text-muted-foreground">
          {p.type}{p.fromEmail ? ` · ${p.fromEmail}` : ''}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {p.sentCount} sent{p.failCount > 0 ? ` · ${p.failCount} failed` : ''}
          </p>
          <SuccessBar sent={p.sentCount} failed={p.failCount} />
        </div>
        <Badge variant="outline" className={cn(
          'shrink-0 text-[10px]',
          !p.enabled ? 'border-border bg-muted text-muted-foreground' : p.healthy ? 'border-success/25 bg-success/10 text-success' : 'border-destructive/25 bg-destructive/10 text-destructive'
        )}>
          {!p.enabled ? toneLabel.disabled : p.healthy ? toneLabel.healthy : toneLabel.failing}
        </Badge>
      </div>
      {p.lastError && (
        <p className="w-full truncate rounded bg-destructive/5 px-2 py-1 text-[11px] text-destructive" title={p.lastError}>
          {p.lastError}
        </p>
      )}
    </div>
  )
}

function Donut({ pct, label, sub }: { pct: number | null; label: string; sub: string }) {
  const R = 52
  const C = 2 * Math.PI * R
  const shown = pct == null ? 0 : Math.max(0, Math.min(100, pct))
  const color = pct == null ? 'text-muted-foreground/40' : pct >= 95 ? 'text-success' : pct >= 80 ? 'text-warning' : 'text-destructive'
  return (
    <div className="flex flex-col items-center gap-2">
      <div className={cn('relative h-32 w-32', color)}>
        <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90" aria-hidden="true">
          <circle cx="64" cy="64" r={R} fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="11" className="text-foreground" />
          <circle
            cx="64" cy="64" r={R} fill="none" stroke="currentColor" strokeWidth="11" strokeLinecap="round"
            strokeDasharray={C} strokeDashoffset={C - (shown / 100) * C}
            className="transition-[stroke-dashoffset] duration-700"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold tabular text-foreground">{pct == null ? '—' : `${pct}%`}</span>
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        </div>
      </div>
      <p className="text-center text-[11px] text-muted-foreground">{sub}</p>
    </div>
  )
}

function BacklogCard({ href, icon, value, label, danger, external }: { href?: string; icon: React.ReactNode; value: number; label: string; danger?: boolean; external?: boolean }) {
  const inner = (
    <div className={cn(
      'hover-lift flex items-center justify-between gap-3 rounded-xl border bg-card p-4',
      href && 'press cursor-pointer'
    )}>
      <div className="flex items-center gap-3">
        <div className={cn('rounded-lg p-2.5', danger && value > 0 ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary')}>{icon}</div>
        <div>
          <p className="text-xl font-bold tabular leading-none text-foreground">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{label}</p>
        </div>
      </div>
      {href && (external ? <ArrowRight className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />)}
    </div>
  )
  return href ? <Link href={href} className="ilp-fade-up block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{inner}</Link> : <div className="ilp-fade-up">{inner}</div>
}

// ── main view ────────────────────────────────────────────────────────────────

export function OperationsView() {
  const t = useOpsT()
  const [data, setData] = useState<OpsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState('health')

  // flags form
  const [flagDialog, setFlagDialog] = useState(false)
  const [flagSaving, setFlagSaving] = useState(false)
  const [flagForm, setFlagForm] = useState({ key: '', name: '', description: '', enabled: false })
  const [deletingFlag, setDeletingFlag] = useState<FlagRow | null>(null)

  const load = useCallback(async () => {
    try {
      setError(null)
      const d = await getJSON<OpsData>('/api/admin/operations')
      setData(d)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const id = window.setInterval(() => { load() }, 60_000)
    return () => window.clearInterval(id)
  }, [load])

  const issueCount = data?.issues.length ?? 0
  const verdictTone = !data ? 'muted' : issueCount === 0 ? 'ok' : issueCount <= 2 ? 'warn' : 'bad'

  async function toggleFlag(f: FlagRow, enabled: boolean) {
    try {
      await sendJSON(`/api/admin/flags/${f.id}`, { enabled }, 'PATCH')
      setData((d) => d ? { ...d, flags: d.flags.map((x) => x.id === f.id ? { ...x, enabled } : x) } : d)
      toast.success(t('opsFlagsSaved'))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('opsFlagsSaveFail'))
    }
  }

  async function setRollout(f: FlagRow, rolloutPercent: number) {
    try {
      await sendJSON(`/api/admin/flags/${f.id}`, { rolloutPercent }, 'PATCH')
      setData((d) => d ? { ...d, flags: d.flags.map((x) => x.id === f.id ? { ...x, rolloutPercent } : x) } : d)
      toast.success(t('opsFlagsSaved'))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('opsFlagsSaveFail'))
    }
  }

  async function createFlag() {
    if (!flagForm.key.trim() || !flagForm.name.trim()) {
      toast.error(t('opsFlagsKeyInvalid'))
      return
    }
    setFlagSaving(true)
    try {
      const created = await sendJSON<{ id: string }>('/api/admin/flags', flagForm)
      setData((d) => d ? { ...d, flags: [...d.flags, { id: created.id, ...flagForm, rolloutPercent: 0, description: flagForm.description || null }].sort((a, b) => a.key.localeCompare(b.key)) } : d)
      setFlagDialog(false)
      setFlagForm({ key: '', name: '', description: '', enabled: false })
      toast.success(t('opsFlagsCreated'))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('opsFlagsSaveFail'))
    } finally {
      setFlagSaving(false)
    }
  }

  async function deleteFlag(id: string) {
    try {
      await sendJSON(`/api/admin/flags/${id}`, undefined, 'DELETE')
      setData((d) => d ? { ...d, flags: d.flags.filter((x) => x.id !== id) } : d)
      toast.success(t('opsFlagsDeleted'))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('opsFlagsSaveFail'))
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title={t('opsTitle')}
        description={t('opsSub')}
        icon={<Activity className="h-5 w-5" />}
        actions={
          <>
            <span className="hidden text-xs text-muted-foreground sm:inline">{t('opsAutoNote')}</span>
            <Button variant="outline" size="sm" className="press h-9 gap-1.5" onClick={() => { setLoading(true); load() }} disabled={loading}>
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
              {loading ? t('opsRefreshing') : t('opsRefresh')}
            </Button>
          </>
        }
      />

      {loading && !data ? (
        <div className="space-y-4">
          <Skeleton className="h-16 w-full rounded-xl" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
          </div>
        </div>
      ) : error && !data ? (
        <ErrorCard message={error} onRetry={load} />
      ) : data ? (
        <>
          {/* Verdict banner */}
          <div className={cn(
            'ilp-fade-up flex items-center gap-3 rounded-xl border p-4',
            verdictTone === 'ok' && 'border-success/25 bg-success/5',
            verdictTone === 'warn' && 'border-warning/40 bg-warning/10',
            verdictTone === 'bad' && 'border-destructive/30 bg-destructive/5',
            verdictTone === 'muted' && 'border bg-card'
          )}>
            {verdictTone === 'ok' ? <ShieldCheck className="h-5 w-5 shrink-0 text-success" /> : <TriangleAlert className={cn('h-5 w-5 shrink-0', verdictTone === 'bad' ? 'text-destructive' : 'text-amber-600 dark:text-amber-400')} />}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-foreground">
                {verdictTone === 'ok' ? t('opsVerdictAllGood') : verdictTone === 'muted' ? t('opsVerdictOk') : issueCount <= 2 ? t('opsVerdictDegraded') : t('opsVerdictAttention')}
              </p>
              <p className="text-xs text-muted-foreground">
                {verdictTone === 'ok' || verdictTone === 'muted' ? t('opsVerdictOk') : t('opsVerdictIssues').replace('{n}', String(issueCount))}
              </p>
            </div>
            <span className="hidden shrink-0 text-[11px] text-muted-foreground md:block">{t('opsLastChecked')} {formatDateTime(data.generatedAt)}</span>
          </div>

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="h-10 w-full justify-start overflow-x-auto sm:w-auto">
              <TabsTrigger value="health" className="gap-1.5 px-3">{t('opsTitle')}</TabsTrigger>
              <TabsTrigger value="flags" className="gap-1.5 px-3">{t('opsFlags')}</TabsTrigger>
            </TabsList>

            {/* ── Health tab ── */}
            <TabsContent value="health" className="mt-4 space-y-4">
              {/* Top row: webhook donut, payment error, system mode */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                <Card className="ilp-fade-up">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm font-semibold"><Globe className="h-4 w-4 text-primary" />{t('opsWebhookHealth')}</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 items-center gap-3 sm:grid-cols-2">
                    <Donut pct={data.webhookStats.successRate} label={t('opsWebhookSuccessRate')} sub={t('opsWebhookOk')} />
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                        <span className="text-xs text-muted-foreground">{t('opsWebhookPending')}</span>
                        <span className="text-sm font-bold tabular text-foreground">{data.webhookStats.pending}</span>
                      </div>
                      <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                        <span className="text-xs text-muted-foreground">{t('opsWebhookFailed')}</span>
                        <span className={cn('text-sm font-bold tabular', data.webhookStats.failed24h > 0 ? 'text-destructive' : 'text-foreground')}>{data.webhookStats.failed24h}</span>
                      </div>
                      <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                        <span className="text-xs text-muted-foreground">24h</span>
                        <span className="text-sm font-bold tabular text-foreground">{data.webhookStats.total24h}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="ilp-fade-up" style={{ animationDelay: '60ms' }}>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm font-semibold"><FlaskConical className="h-4 w-4 text-primary" />{t('opsPaymentError')}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-baseline gap-2">
                      <span className={cn('text-4xl font-bold tabular', data.payment.errorRate != null && data.payment.errorRate > 40 ? 'text-destructive' : data.payment.errorRate != null && data.payment.errorRate > 20 ? 'text-amber-600 dark:text-amber-400' : 'text-success')}>
                        {data.payment.errorRate == null ? '—' : `${data.payment.errorRate}%`}
                      </span>
                    </div>
                    <p className="text-xs leading-relaxed text-muted-foreground">{t('opsPaymentErrorHint')}</p>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-lg border px-2.5 py-2 text-center">
                        <p className="text-sm font-bold tabular text-foreground">{data.payment.cancelled}</p>
                        <p className="text-[10px] text-muted-foreground">{t('opsPaymentCancelled')}</p>
                      </div>
                      <div className="rounded-lg border px-2.5 py-2 text-center">
                        <p className="text-sm font-bold tabular text-foreground">{Math.max(0, data.payment.total - data.payment.cancelled)}</p>
                        <p className="text-[10px] text-muted-foreground">{t('opsPaymentExpired')}</p>
                      </div>
                      <div className="rounded-lg border px-2.5 py-2 text-center">
                        <p className="text-sm font-bold tabular text-foreground">{data.payment.total}</p>
                        <p className="text-[10px] text-muted-foreground">{t('opsPaymentTotal')}</p>
                      </div>
                    </div>
                    {data.payment.errorRate != null && data.payment.errorRate <= 20 && (
                      <p className="text-[11px] font-medium text-success">✓ {t('opsPaymentHealthy')}</p>
                    )}
                  </CardContent>
                </Card>

                <Card className={cn('ilp-fade-up', data.appMode === 'SANDBOX' && 'border-warning/40')} style={{ animationDelay: '120ms' }}>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-primary" />{t('opsSystemMode')}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Badge variant="outline" className={cn(
                      'px-3 py-1 text-xs font-bold',
                      data.appMode === 'SANDBOX' ? 'border-warning/40 bg-warning/10 text-amber-700 dark:text-amber-400' : 'border-success/30 bg-success/10 text-success'
                    )}>
                      {data.appMode === 'SANDBOX' ? t('opsModeSandbox') : t('opsModeProduction')}
                    </Badge>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {data.appMode === 'SANDBOX' ? t('opsModeSandboxNote') : t('opsModeProductionNote')}
                    </p>
                    {data.appMode === 'SANDBOX' && (
                      <Link href="/admin/settings" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                        {t('opsSystemMode')} <ArrowRight className="h-3 w-3" />
                      </Link>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Backlog */}
              <div>
                <div className="mb-2 flex items-baseline justify-between">
                  <h2 className="text-sm font-bold text-foreground">{t('opsBacklog')}</h2>
                  <p className="text-[11px] text-muted-foreground">{t('opsBacklogHint')}</p>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <BacklogCard
                    href={data.backlog.webhookPending > 0 ? '/admin/webhooks?tab=deliveries' : undefined}
                    icon={<Globe className="h-4 w-4" />}
                    value={data.backlog.webhookPending}
                    label={t('opsBacklogWebhook')}
                    danger={data.backlog.webhookPending > 0}
                  />
                  <BacklogCard
                    href="/admin/automations"
                    icon={<Clock className="h-4 w-4" />}
                    value={data.backlog.automationsWaiting}
                    label={t('opsBacklogAutomations')}
                    danger={data.backlog.automationsWaiting > 0}
                  />
                  <BacklogCard
                    icon={<AlertTriangle className="h-4 w-4" />}
                    value={data.backlog.eventsFailed}
                    label={t('opsBacklogEvents')}
                    danger={data.backlog.eventsFailed > 0}
                  />
                </div>
              </div>

              {/* Providers + devices */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Card className="ilp-fade-up">
                  <CardHeader className="flex-row items-center justify-between pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm font-semibold"><Mail className="h-4 w-4 text-primary" />{t('opsEmailProviders')}</CardTitle>
                    <Link href="/admin/email" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                      {t('opsProviderOpenEmail')} <ChevronRight className="h-3 w-3" />
                    </Link>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {data.emailProviders.length === 0
                      ? <p className="py-4 text-center text-xs text-muted-foreground">{t('opsProviderNone')}<br />{t('opsProviderHint')}</p>
                      : data.emailProviders.map((p, i) => <ProviderRowItem key={`${p.type}-${i}`} p={p} toneLabel={{ healthy: t('opsProviderHealthy'), failing: t('opsProviderFailing'), disabled: t('opsProviderDisabled') }} />)}
                    {data.emailBounce24h > 0 && (
                      <p className="rounded-lg bg-destructive/5 px-3 py-2 text-[11px] font-semibold text-destructive">
                        {data.emailBounce24h} × {t('opsEmailProviders')} — 24h bounces
                      </p>
                    )}
                  </CardContent>
                </Card>

                <Card className="ilp-fade-up" style={{ animationDelay: '60ms' }}>
                  <CardHeader className="flex-row items-center justify-between pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm font-semibold"><MessageSquare className="h-4 w-4 text-primary" />{t('opsSmsProviders')}</CardTitle>
                    <Link href="/admin/sms-gateway" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                      {t('opsProviderOpenSms')} <ChevronRight className="h-3 w-3" />
                    </Link>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {data.smsProviders.length === 0
                      ? <p className="py-4 text-center text-xs text-muted-foreground">{t('opsProviderNone')}<br />{t('opsProviderHint')}</p>
                      : data.smsProviders.map((p, i) => <ProviderRowItem key={`${p.type}-${i}`} p={p} toneLabel={{ healthy: t('opsProviderHealthy'), failing: t('opsProviderFailing'), disabled: t('opsProviderDisabled') }} />)}
                    {data.smsFailed24h > 0 && (
                      <p className="rounded-lg bg-destructive/5 px-3 py-2 text-[11px] font-semibold text-destructive">
                        {data.smsFailed24h} × SMS — 24h failures
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Devices + incidents */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Card className="ilp-fade-up">
                  <CardHeader className="flex-row items-center justify-between pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm font-semibold"><Smartphone className="h-4 w-4 text-primary" />{t('opsDevices')}</CardTitle>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{t('opsDevicesOnline')} <span className="font-bold tabular text-foreground">{data.devices.online}</span> / {t('opsDevicesTotal')} <span className="font-bold tabular text-foreground">{data.devices.total}</span></span>
                      <Link href="/admin/devices" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                        {t('opsDevicesOpen')} <ChevronRight className="h-3 w-3" />
                      </Link>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {data.devices.total === 0 ? (
                      <p className="py-4 text-center text-xs text-muted-foreground">{t('opsDevicesOfflineNone')}</p>
                    ) : data.devices.offlineDevices.length === 0 ? (
                      <p className="flex items-center gap-2 rounded-lg border border-success/20 bg-success/5 px-3 py-2.5 text-xs font-semibold text-success">
                        <ShieldCheck className="h-4 w-4" /> {t('opsDevicesAllOnline')}
                      </p>
                    ) : (
                      <>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t('opsDevicesOfflineList')}</p>
                        {data.devices.offlineDevices.map((d) => (
                          <div key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border bg-background/50 px-3 py-2.5">
                            <span className="h-2 w-2 rounded-full bg-muted-foreground/40" aria-hidden="true" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-foreground">{d.name}</p>
                              <p className="text-[11px] text-muted-foreground">
                                {d.model ?? '—'}{d.battery != null ? ` · ${d.battery}%` : ''} · {t('opsDevicesLastSeen')} {d.lastSeen ? formatDateTime(d.lastSeen) : t('opsDevicesNever')}
                              </p>
                            </div>
                          </div>
                        ))}
                      </>
                    )}
                  </CardContent>
                </Card>

                <Card className="ilp-fade-up" style={{ animationDelay: '60ms' }}>
                  <CardHeader className="flex-row items-center justify-between pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm font-semibold"><AlertTriangle className="h-4 w-4 text-primary" />{t('opsIncidentsOpen')}</CardTitle>
                    <Link href="/admin/incidents" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                      {t('opsIncidentsOpenLink')} <ChevronRight className="h-3 w-3" />
                    </Link>
                  </CardHeader>
                  <CardContent>
                    {data.incidentsOpen === 0 ? (
                      <p className="flex items-center gap-2 rounded-lg border border-success/20 bg-success/5 px-3 py-2.5 text-xs font-semibold text-success">
                        <ShieldCheck className="h-4 w-4" /> {t('opsIncidentsNone')}
                      </p>
                    ) : (
                      <p className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5 text-xs font-bold text-amber-700 dark:text-amber-400">
                        <TriangleAlert className="h-4 w-4" /> {data.incidentsOpen} × {t('opsIncidentsOpen')}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* ── Feature flags tab ── */}
            <TabsContent value="flags" className="mt-4 space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-sm font-semibold">
                    <span className="flex items-center gap-2"><FlaskConical className="h-4 w-4 text-primary" />{t('opsFlags')}</span>
                    <Button size="sm" className="press h-8 gap-1.5" onClick={() => setFlagDialog(true)}>
                      <Plus className="h-3.5 w-3.5" /> {t('opsFlagsCreate')}
                    </Button>
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">{t('opsFlagsHint')}</p>
                </CardHeader>
                <CardContent>
                  {data.flags.length === 0 ? (
                    <EmptyState
                      icon={<FlaskConical className="h-6 w-6" />}
                      title={t('opsFlagsNone')}
                      action={
                        <Button size="sm" variant="outline" className="press gap-1.5" onClick={() => setFlagDialog(true)}>
                          <Plus className="h-3.5 w-3.5" /> {t('opsFlagsCreate')}
                        </Button>
                      }
                    />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[640px] text-sm">
                        <thead>
                          <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                            <th className="py-2.5 pr-3 font-semibold">{t('opsFlagsKey')}</th>
                            <th className="py-2.5 pr-3 font-semibold">{t('opsFlagsName')}</th>
                            <th className="py-2.5 pr-3 font-semibold">{t('opsFlagsRollout')}</th>
                            <th className="py-2.5 pr-3 text-right font-semibold">{t('opsFlagsEnabled')}</th>
                            <th className="py-2.5 text-right font-semibold"><span className="sr-only">Actions</span></th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.flags.map((f, i) => (
                            <tr key={f.id} className="ilp-fade-up border-b last:border-0" style={{ animationDelay: `${i * 40}ms` }}>
                              <td className="py-3 pr-3">
                                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">{f.key}</code>
                                {f.description && <p className="mt-1 max-w-xs truncate text-[11px] text-muted-foreground" title={f.description}>{f.description}</p>}
                              </td>
                              <td className="py-3 pr-3 font-semibold text-foreground">{f.name}</td>
                              <td className="py-3 pr-3">
                                <div className="flex items-center gap-2">
                                  <Slider
                                    value={[f.rolloutPercent]}
                                    min={0} max={100} step={5}
                                    className="w-28"
                                    onValueCommit={(v) => setRollout(f, v[0] ?? f.rolloutPercent)}
                                    aria-label={`${f.key} rollout`}
                                  />
                                  <span className="w-9 text-right text-xs font-semibold tabular text-foreground">{f.rolloutPercent}%</span>
                                </div>
                              </td>
                              <td className="py-3 pr-3 text-right">
                                <Switch checked={f.enabled} onCheckedChange={(v) => toggleFlag(f, v)} aria-label={f.key} />
                              </td>
                              <td className="py-3 text-right">
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button variant="ghost" size="icon" className="press h-8 w-8 text-muted-foreground hover:text-destructive" aria-label={`${t('brdDelete')} ${f.key}`}>
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>{t('opsFlagsDeleteMsg')}</AlertDialogTitle>
                                      <AlertDialogDescription><code className="font-mono text-xs">{f.key}</code></AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel className="press">{t('impClose')}</AlertDialogCancel>
                                      <AlertDialogAction className="press bg-destructive text-white hover:bg-destructive/90" onClick={() => deleteFlag(f.id)}>
                                        {t('brdDelete')}
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Create flag dialog */}
          <Dialog open={flagDialog} onOpenChange={setFlagDialog}>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{t('opsFlagsCreateTitle')}</DialogTitle>
                <DialogDescription>{t('opsFlagsHint')}</DialogDescription>
              </DialogHeader>
              <div className="space-y-3.5">
                <div className="space-y-1.5">
                  <Label htmlFor="flag-key">{t('opsFlagsKey')}</Label>
                  <Input
                    id="flag-key"
                    value={flagForm.key}
                    onChange={(e) => setFlagForm((f) => ({ ...f, key: e.target.value }))}
                    placeholder={t('opsFlagsKeyPh')}
                    className="font-mono"
                    autoFocus
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="flag-name">{t('opsFlagsName')}</Label>
                  <Input
                    id="flag-name"
                    value={flagForm.name}
                    onChange={(e) => setFlagForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder={t('opsFlagsNamePh')}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="flag-desc">{t('opsFlagsDescription')}</Label>
                  <Textarea
                    id="flag-desc"
                    value={flagForm.description}
                    onChange={(e) => setFlagForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder={t('opsFlagsDescPh')}
                    rows={2}
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
                  <Label htmlFor="flag-enabled" className="cursor-pointer">{t('opsFlagsEnabled')}</Label>
                  <Switch id="flag-enabled" checked={flagForm.enabled} onCheckedChange={(v) => setFlagForm((f) => ({ ...f, enabled: v }))} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" className="press" onClick={() => setFlagDialog(false)}>{t('impClose')}</Button>
                <Button className="press gap-1.5" onClick={createFlag} disabled={flagSaving}>
                  <Plus className="h-3.5 w-3.5" /> {flagSaving ? t('opsFlagsCreate') : t('opsFlagsCreate')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      ) : null}
    </div>
  )
}
