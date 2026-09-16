'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  ClipboardCheck, Plus, RefreshCw, FileJson, Check, X, History, ShieldQuestion,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { fetchApi } from '@/lib/api-client'
import { formatDateTime, timeAgo } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useUrlState } from '@/hooks/use-url-state'
import { useLang } from '@/lib/i18n'
import { isAdminRole } from '@/lib/roles'
import {
  PageHeader, StatCard, EmptyState, ErrorCard, Pagination, SearchInput,
} from './ui-bits'

// ── Types ────────────────────────────────────────────────────────────────────

interface Approval {
  id: string
  type: string
  summary: string
  payload: Record<string, unknown>
  thresholdAmount: number | null
  status: string
  requestedByName: string | null
  approvedByName: string | null
  notes: string | null
  decidedAt: string | null
  createdAt: string
}

interface ApprovalsData {
  items: Approval[]
  total: number
  page: number
  pages: number
  counts: { pending: number; approved: number; rejected: number; expired: number }
  thresholdAmount: number
}

interface Me {
  id: string
  name: string
  role: string
}

const EMPTY_FORM = { type: 'REFUND', summary: '', thresholdAmount: '', payload: '' }
type ApprovalsForm = typeof EMPTY_FORM

const TYPE_BADGE: Record<string, string> = {
  REFUND: 'bg-warning/15 text-amber-700 dark:text-amber-400 border-warning/30',
  PAYOUT: 'bg-warning/15 text-amber-700 dark:text-amber-400 border-warning/30',
  API_KEY: 'bg-primary/10 text-primary border-primary/25',
  GATEWAY_CHANGE: 'bg-primary/10 text-primary border-primary/25',
  SETTING: 'bg-muted text-muted-foreground border-border',
  EMAIL_PROVIDER: 'bg-muted text-muted-foreground border-border',
}

const STATUS_BADGE: Record<string, string> = {
  PENDING: 'bg-warning/15 text-amber-700 dark:text-amber-400 border-warning/30',
  APPROVED: 'bg-success/10 text-success border-success/20',
  REJECTED: 'bg-destructive/10 text-destructive border-destructive/25',
  EXPIRED: 'bg-muted text-muted-foreground border-border',
}

// ── Component ────────────────────────────────────────────────────────────────

export function ApprovalsView() {
  const { t } = useLang()
  const { get, getNum, set } = useUrlState()
  const tab = get('tab', 'pending')
  const page = getNum('page', 1)
  const statusFilter = get('status', 'ALL')
  const typeFilter = get('type', 'ALL')

  const [me, setMe] = useState<Me | null>(null)
  const [data, setData] = useState<ApprovalsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState<ApprovalsForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  // Decide dialog
  const [decide, setDecide] = useState<{ approval: Approval; action: 'approve' | 'reject' } | null>(null)
  const [decideNotes, setDecideNotes] = useState('')
  const [decideBusy, setDecideBusy] = useState(false)

  // Payload viewer
  const [payloadView, setPayloadView] = useState<Approval | null>(null)

  const typeLabel = (ty: string) =>
    ty === 'REFUND' ? t('apvTypeRefund')
      : ty === 'PAYOUT' ? t('apvTypePayout')
      : ty === 'API_KEY' ? t('apvTypeApiKey')
      : ty === 'GATEWAY_CHANGE' ? t('apvTypeGateway')
      : ty === 'SETTING' ? t('apvTypeSetting')
      : ty === 'EMAIL_PROVIDER' ? t('apvTypeEmail')
      : ty

  const statusLabel = (s: string) =>
    s === 'PENDING' ? t('apvStatusPending')
      : s === 'APPROVED' ? t('apvStatusApproved')
      : s === 'REJECTED' ? t('apvStatusRejected')
      : t('apvStatusExpired')

  const isOwnRequest = (a: Approval) => !!me?.name && !!a.requestedByName && a.requestedByName === me.name

  // ── Data loading ──

  const loadMe = useCallback(async () => {
    try {
      const res = await fetchApi<{ user: Me | null }>('/api/auth/me')
      setMe(res.user)
    } catch { /* non-fatal */ }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ page: String(page) })
      if (statusFilter !== 'ALL') params.set('status', tab === 'history' ? statusFilter : 'PENDING')
      if (typeFilter !== 'ALL') params.set('type', typeFilter)
      const res = await fetchApi<ApprovalsData>(`/api/admin/approvals?${params}`)
      setData(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setLoading(false)
    }
  }, [page, statusFilter, tab, typeFilter])

  useEffect(() => { void loadMe() }, [loadMe])
  useEffect(() => { void load() }, [load])

  // ── Create ──

  const submitCreate = async () => {
    if (!form.summary.trim()) { toast.error(t('apvNeedSummary')); return }
    let payload: unknown = {}
    if (form.payload.trim()) {
      try {
        payload = JSON.parse(form.payload)
      } catch {
        toast.error(t('apvInvalidPayload'))
        return
      }
    }
    setSaving(true)
    try {
      await fetchApi('/api/admin/approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: form.type,
          summary: form.summary.trim(),
          payload,
          thresholdAmount: form.thresholdAmount.trim() || undefined,
        }),
      })
      toast.success(t('apvCreatedToast'))
      setCreateOpen(false)
      setForm(EMPTY_FORM)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setSaving(false)
    }
  }

  // ── Decide ──

  const openDecide = (a: Approval, action: 'approve' | 'reject') => {
    setDecide({ approval: a, action })
    setDecideNotes('')
  }

  const submitDecide = async () => {
    if (!decide) return
    setDecideBusy(true)
    try {
      await fetchApi(`/api/admin/approvals/${decide.approval.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: decide.action, notes: decideNotes.trim() || undefined }),
      })
      toast.success(decide.action === 'approve' ? t('apvApprovedToast') : t('apvRejectedToast'))
      setDecide(null)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setDecideBusy(false)
    }
  }

  const decideButtons = (a: Approval) => {
    const own = isOwnRequest(a)
    return (
      <TooltipProvider delayDuration={200}>
        <div className="flex items-center justify-end gap-1.5">
          {own ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0} className="inline-flex cursor-not-allowed items-center gap-1.5">
                  <Button variant="outline" size="sm" className="press h-8 gap-1.5 border-success/30 text-success hover:bg-success/10 hover:text-success" disabled>
                    <Check className="h-3.5 w-3.5" /> {t('apvApprove')}
                  </Button>
                  <Button variant="outline" size="sm" className="press h-8 gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive" disabled>
                    <X className="h-3.5 w-3.5" /> {t('apvReject')}
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[240px] text-center">
                <ShieldQuestion className="mr-1 inline h-3.5 w-3.5" />
                {t('apvSecondPerson')}
              </TooltipContent>
            </Tooltip>
          ) : (
            <>
              <Button
                variant="outline" size="sm"
                className="press h-8 gap-1.5 border-success/30 text-success hover:bg-success/10 hover:text-success"
                onClick={() => openDecide(a, 'approve')}
              >
                <Check className="h-3.5 w-3.5" /> {t('apvApprove')}
              </Button>
              <Button
                variant="outline" size="sm"
                className="press h-8 gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => openDecide(a, 'reject')}
              >
                <X className="h-3.5 w-3.5" /> {t('apvReject')}
              </Button>
            </>
          )}
        </div>
      </TooltipProvider>
    )
  }

  const pendingCard = (a: Approval, i: number) => (
    <Card key={a.id} className="hover-lift p-4 shadow-brand" style={{ animationDelay: `${i * 40}ms` }}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className={cn('text-[10px] font-bold', TYPE_BADGE[a.type] ?? TYPE_BADGE.SETTING)}>
              {typeLabel(a.type)}
            </Badge>
            {a.thresholdAmount != null && (
              <Badge variant="outline" className="text-[10px] font-semibold tabular">
                ৳ {a.thresholdAmount.toLocaleString('en-IN')}
              </Badge>
            )}
          </div>
          <p className="mt-1.5 break-words text-sm font-semibold leading-snug text-foreground">{a.summary}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {t('apvColRequester')}: <span className="font-semibold text-foreground/80">{a.requestedByName ?? '—'}</span>
            {isOwnRequest(a) && <span className="ml-1.5 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">{t('youBadge') ?? 'You'}</span>}
            {' · '}
            <span title={formatDateTime(a.createdAt)}>{timeAgo(a.createdAt)}</span>
          </p>
        </div>
        {Object.keys(a.payload ?? {}).length > 0 && (
          <Button variant="ghost" size="sm" className="press h-8 shrink-0 gap-1.5" onClick={() => setPayloadView(a)}>
            <FileJson className="h-3.5 w-3.5" /> {t('apvViewPayload')}
          </Button>
        )}
      </div>
      <div className="mt-3 border-t pt-3">
        {decideButtons(a)}
      </div>
    </Card>
  )

  return (
    <div>
      <PageHeader
        title={t('apvTitle')}
        description={t('apvSubtitle')}
        icon={<ClipboardCheck className="h-5 w-5" />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {isAdminRole(me?.role) && (
              <Button onClick={() => { setForm(EMPTY_FORM); setCreateOpen(true) }} className="press gap-1.5">
                <Plus className="h-4 w-4" /> {t('apvNewApproval')}
              </Button>
            )}
            <Button variant="outline" size="icon" className="press h-9 w-9" onClick={() => void load()} aria-label={t('refresh')}>
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            </Button>
          </div>
        }
      />

      {/* Stats */}
      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t('apvStatPending')}
          value={data ? String(data.counts.pending) : '—'}
          icon={<ClipboardCheck className="h-5 w-5" />}
          tone="text-warning bg-warning/10"
          loading={!data}
        />
        <StatCard
          label={t('apvStatApproved')}
          value={data ? String(data.counts.approved) : '—'}
          icon={<Check className="h-5 w-5" />}
          tone="text-success bg-success/10"
          loading={!data}
        />
        <StatCard
          label={t('apvStatRejected')}
          value={data ? String(data.counts.rejected) : '—'}
          icon={<X className="h-5 w-5" />}
          tone="text-destructive bg-destructive/10"
          loading={!data}
        />
        <StatCard
          label={t('apvStatThreshold')}
          value={data ? `৳ ${data.thresholdAmount.toLocaleString('en-IN')}` : '—'}
          icon={<ShieldQuestion className="h-5 w-5" />}
          tone="text-primary bg-primary/10"
          loading={!data}
        />
      </div>

      {error && !data ? (
        <ErrorCard message={error} onRetry={() => void load()} />
      ) : (
        <Tabs value={tab} onValueChange={(v) => set({ tab: v === 'pending' ? null : v, page: null, status: null })}>
          <TabsList className="h-auto w-full flex-wrap justify-start gap-1 sm:grid sm:w-full sm:grid-cols-2">
            <TabsTrigger value="pending" className="gap-1.5 px-3">
              {t('apvTabPending')}
              {data && data.counts.pending > 0 && (
                <span className="ml-1 rounded-full bg-warning/20 px-1.5 text-[10px] font-bold text-amber-700 dark:text-amber-400">
                  {data.counts.pending}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-1.5 px-3">{t('apvTabHistory')}</TabsTrigger>
          </TabsList>

          {/* ── Pending ── */}
          <TabsContent value="pending" className="mt-4">
            {!data ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
              </div>
            ) : data.items.length === 0 ? (
              <Card className="border-dashed p-2 shadow-brand">
                <EmptyState
                  icon={<ClipboardCheck className="h-7 w-7" />}
                  title={t('apvEmptyPending')}
                  hint={t('apvEmptyPendingHint')}
                />
              </Card>
            ) : (
              <>
                <div className="stagger grid gap-3 lg:grid-cols-2">
                  {data.items.map((a, i) => pendingCard(a, i))}
                </div>
                <Pagination page={data.page} pages={data.pages} total={data.total} />
              </>
            )}
          </TabsContent>

          {/* ── History ── */}
          <TabsContent value="history" className="mt-4">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
              <SearchInput paramKey="q" placeholder={t('apvSearchPh')} className="sm:max-w-xs" />
              <Select value={statusFilter} onValueChange={(v) => set({ status: v === 'ALL' ? null : v, page: 1 })}>
                <SelectTrigger className="h-9 w-full sm:w-40" aria-label={t('apvColStatus')}>
                  <SelectValue placeholder={t('apvColStatus')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">{t('apvColStatus')}</SelectItem>
                  <SelectItem value="APPROVED">{t('apvStatusApproved')}</SelectItem>
                  <SelectItem value="REJECTED">{t('apvStatusRejected')}</SelectItem>
                  <SelectItem value="EXPIRED">{t('apvStatusExpired')}</SelectItem>
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={(v) => set({ type: v === 'ALL' ? null : v, page: 1 })}>
                <SelectTrigger className="h-9 w-full sm:w-44" aria-label={t('apvColType')}>
                  <SelectValue placeholder={t('apvColType')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">{t('apvColType')}</SelectItem>
                  <SelectItem value="REFUND">{t('apvTypeRefund')}</SelectItem>
                  <SelectItem value="PAYOUT">{t('apvTypePayout')}</SelectItem>
                  <SelectItem value="API_KEY">{t('apvTypeApiKey')}</SelectItem>
                  <SelectItem value="GATEWAY_CHANGE">{t('apvTypeGateway')}</SelectItem>
                  <SelectItem value="SETTING">{t('apvTypeSetting')}</SelectItem>
                  <SelectItem value="EMAIL_PROVIDER">{t('apvTypeEmail')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {!data ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
              </div>
            ) : data.items.length === 0 ? (
              <Card className="border-dashed p-2 shadow-brand">
                <EmptyState
                  icon={<History className="h-7 w-7" />}
                  title={t('apvEmptyHistory')}
                  hint={t('apvEmptyHistoryHint')}
                  action={(statusFilter !== 'ALL' || typeFilter !== 'ALL') ? (
                    <Button variant="outline" size="sm" className="press" onClick={() => set({ status: null, type: null, page: 1 })}>
                      {t('apvClearFilter')}
                    </Button>
                  ) : undefined}
                />
              </Card>
            ) : (
              <>
                {/* Desktop table */}
                <Card className="hidden overflow-hidden p-0 shadow-brand md:block">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50 text-left">
                          <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('apvColType')}</th>
                          <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('apvColSummary')}</th>
                          <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('apvColStatus')}</th>
                          <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('apvColRequester')}</th>
                          <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('apvColDecidedBy')}</th>
                          <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('apvColDecidedAt')}</th>
                        </tr>
                      </thead>
                      <tbody className="stagger">
                        {data.items.map((a, i) => (
                          <tr key={a.id} className="border-b transition-colors last:border-0 hover:bg-muted/40" style={{ animationDelay: `${i * 40}ms` }}>
                            <td className="px-4 py-3">
                              <Badge variant="outline" className={cn('text-[10px] font-bold', TYPE_BADGE[a.type] ?? TYPE_BADGE.SETTING)}>
                                {typeLabel(a.type)}
                              </Badge>
                            </td>
                            <td className="max-w-[260px] px-4 py-3">
                              <p className="truncate font-medium text-foreground">{a.summary}</p>
                              {a.notes && <p className="truncate text-[11px] text-muted-foreground">{t('apvColNotes')}: {a.notes}</p>}
                            </td>
                            <td className="px-4 py-3">
                              <Badge variant="outline" className={cn('font-bold', STATUS_BADGE[a.status] ?? STATUS_BADGE.EXPIRED)}>
                                {statusLabel(a.status)}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-xs text-foreground/80">{a.requestedByName ?? '—'}</td>
                            <td className="px-4 py-3 text-xs text-foreground/80">{a.approvedByName ?? '—'}</td>
                            <td className="px-4 py-3 text-xs text-foreground/70" title={a.decidedAt ? formatDateTime(a.decidedAt) : undefined}>
                              {a.decidedAt ? timeAgo(a.decidedAt) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>

                {/* Mobile cards */}
                <div className="stagger space-y-3 md:hidden">
                  {data.items.map((a, i) => (
                    <Card key={a.id} className="hover-lift p-4 shadow-brand" style={{ animationDelay: `${i * 40}ms` }}>
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 break-words text-sm font-semibold text-foreground">{a.summary}</p>
                        <Badge variant="outline" className={cn('shrink-0 text-[10px] font-bold', STATUS_BADGE[a.status] ?? STATUS_BADGE.EXPIRED)}>
                          {statusLabel(a.status)}
                        </Badge>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline" className={cn('text-[10px] font-bold', TYPE_BADGE[a.type] ?? TYPE_BADGE.SETTING)}>
                          {typeLabel(a.type)}
                        </Badge>
                      </div>
                      <div className="mt-3 space-y-0.5 border-t pt-3 text-[11px] text-muted-foreground">
                        <p>{t('apvColRequester')}: <span className="font-semibold text-foreground/80">{a.requestedByName ?? '—'}</span></p>
                        <p>{t('apvColDecidedBy')}: <span className="font-semibold text-foreground/80">{a.approvedByName ?? '—'}</span></p>
                        <p title={a.decidedAt ? formatDateTime(a.decidedAt) : undefined}>
                          {a.decidedAt ? timeAgo(a.decidedAt) : '—'}
                        </p>
                      </div>
                    </Card>
                  ))}
                </div>

                <Pagination page={data.page} pages={data.pages} total={data.total} />
              </>
            )}
          </TabsContent>
        </Tabs>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="nice-scroll max-h-[92vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('apvCreateTitle')}</DialogTitle>
            <DialogDescription className="sr-only">{t('apvCreateDesc')}</DialogDescription>
          </DialogHeader>
          <p className="text-xs leading-relaxed text-muted-foreground">{t('apvCreateDesc')}</p>

          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label>{t('apvType')} *</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="REFUND">{t('apvTypeRefund')}</SelectItem>
                  <SelectItem value="PAYOUT">{t('apvTypePayout')}</SelectItem>
                  <SelectItem value="API_KEY">{t('apvTypeApiKey')}</SelectItem>
                  <SelectItem value="GATEWAY_CHANGE">{t('apvTypeGateway')}</SelectItem>
                  <SelectItem value="SETTING">{t('apvTypeSetting')}</SelectItem>
                  <SelectItem value="EMAIL_PROVIDER">{t('apvTypeEmail')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="apv-summary">{t('apvSummary')} *</Label>
              <Input
                id="apv-summary"
                value={form.summary}
                onChange={(e) => setForm({ ...form, summary: e.target.value })}
                placeholder={t('apvSummaryPh')}
                autoFocus
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="apv-threshold">{t('apvThreshold')} <span className="text-muted-foreground">({t('apvThresholdOptional')})</span></Label>
              <Input
                id="apv-threshold" inputMode="decimal"
                value={form.thresholdAmount}
                onChange={(e) => setForm({ ...form, thresholdAmount: e.target.value.replace(/[^\d.]/g, '') })}
                className="tabular"
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="apv-payload">{t('apvPayload')}</Label>
              <Textarea
                id="apv-payload"
                value={form.payload}
                onChange={(e) => setForm({ ...form, payload: e.target.value })}
                placeholder='{ "refundId": "..." }'
                rows={4}
                className="font-mono text-xs"
              />
              <p className="text-[11px] text-muted-foreground">{t('apvPayloadHint')}</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>{t('cancel')}</Button>
            <Button className="press" onClick={() => void submitCreate()} disabled={saving}>
              {t('create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Decide dialog */}
      <Dialog open={!!decide} onOpenChange={(o) => !o && setDecide(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {decide?.action === 'approve' ? t('apvDecideApproveTitle') : t('apvDecideRejectTitle')}
            </DialogTitle>
            <DialogDescription className="sr-only">{t('apvDecideDesc')}</DialogDescription>
          </DialogHeader>
          {decide && (
            <>
              <p className="break-words rounded-lg bg-muted/50 p-3 text-sm font-medium text-foreground">
                {decide.approval.summary}
              </p>
              <p className="text-xs leading-relaxed text-muted-foreground">{t('apvDecideDesc')}</p>
              <div className="grid gap-1.5">
                <Label htmlFor="apv-decide-notes">{t('apvNotes')}</Label>
                <Textarea
                  id="apv-decide-notes"
                  value={decideNotes}
                  onChange={(e) => setDecideNotes(e.target.value)}
                  placeholder={t('apvNotesPh')}
                  rows={3}
                  autoFocus
                />
              </div>
            </>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecide(null)}>{t('cancel')}</Button>
            <Button
              className={cn(
                'press',
                decide?.action === 'approve'
                  ? 'bg-success text-white hover:bg-success/90'
                  : 'bg-destructive text-white hover:bg-destructive/90',
              )}
              onClick={() => void submitDecide()}
              disabled={decideBusy}
            >
              {decide?.action === 'approve' ? t('apvApprove') : t('apvReject')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payload viewer */}
      <Dialog open={!!payloadView} onOpenChange={(o) => !o && setPayloadView(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('apvPayloadTitle')}</DialogTitle>
            <DialogDescription className="sr-only">{t('apvPayloadTitle')}</DialogDescription>
          </DialogHeader>
          {payloadView && Object.keys(payloadView.payload ?? {}).length > 0 ? (
            <pre className="nice-scroll max-h-[50vh] overflow-auto rounded-lg bg-muted p-4 font-mono text-xs leading-relaxed text-foreground">
              {JSON.stringify(payloadView.payload, null, 2)}
            </pre>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">{t('apvPayloadEmpty')}</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
