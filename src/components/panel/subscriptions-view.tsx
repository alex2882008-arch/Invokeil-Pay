'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle, Ban, CalendarClock, MoreHorizontal, Play, Plus, RefreshCcw,
  Repeat, RotateCcw, Search, Trash2, TrendingUp,
} from 'lucide-react'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { EmptyState, ErrorCard, PageHeader, Pagination, SearchInput, StatCard, StatusBadge } from '@/components/panel/ui-bits'
import { useLang } from '@/lib/i18n'
import { fetchApi } from '@/lib/api-client'
import { formatBDT, formatDateTime, timeAgo } from '@/lib/format'
import { useUrlState } from '@/hooks/use-url-state'
import { cn } from '@/lib/utils'


// ── Types ────────────────────────────────────────────────────────────────────
type Subscription = {
  id: string
  customerId: string | null
  customerName: string | null
  planName: string
  amount: number
  interval: string
  status: string
  gatewayCode: string | null
  trialDays: number
  trialEndsAt: string | null
  nextBillingAt: string | null
  cycles: number
  autoRetry: boolean
  retryCount: number
  maxRetries: number
  notes: string | null
  createdAt: string
  customer?: { id: string; name: string; phone: string | null; suspended: boolean } | null
  _count?: { invoices: number }
}

type ListResp = {
  items: Subscription[]
  total: number
  page: number
  pages: number
  counts: { active: number; trialing: number; pastDue: number; cancelled: number }
  mrr: number
}

type CustomerHit = { id: string; name: string; phone: string | null }

type InvoiceRow = { id: string; number: string; title: string; status: string; total: number; createdAt: string }

const INTERVALS = ['WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'] as const

function countdownChip(next: string | null, dueLabel: string, inLabel: string) {
  if (!next) return <span className="text-xs text-muted-foreground">—</span>
  const diff = new Date(next).getTime() - Date.now()
  if (diff <= 0) {
    return <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive">{dueLabel}</Badge>
  }
  const days = Math.floor(diff / 86400_000)
  const hours = Math.floor((diff % 86400_000) / 3600_000)
  const label = days >= 1 ? `${inLabel} ${days}d` : `${inLabel} ${Math.max(hours, 1)}h`
  return (
    <Badge variant="outline" className={cn('gap-1', days <= 2 ? 'border-warning/40 bg-warning/10 text-amber-700 dark:text-amber-400' : 'border-success/25 bg-success/10 text-success')}>
      <CalendarClock className="h-3 w-3" /> {label}
    </Badge>
  )
}

// ── View ─────────────────────────────────────────────────────────────────────
export function SubscriptionsView() {
  const { t } = useLang()
  const { get, getNum, set } = useUrlState()

  const [data, setData] = useState<ListResp | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tickBusy, setTickBusy] = useState(false)
  const [actionBusy, setActionBusy] = useState<string | null>(null)

  // create dialog
  const [createOpen, setCreateOpen] = useState(false)
  const [planName, setPlanName] = useState('')
  const [amount, setAmount] = useState('')
  const [interval, setInterval_] = useState<string>('MONTHLY')
  const [customerQuery, setCustomerQuery] = useState('')
  const [customerHits, setCustomerHits] = useState<CustomerHit[]>([])
  const [pickedCustomer, setPickedCustomer] = useState<CustomerHit | null>(null)
  const [trialDays, setTrialDays] = useState('0')
  const [autoRetry, setAutoRetry] = useState(true)
  const [maxRetries, setMaxRetries] = useState('4')
  const [notes, setNotes] = useState('')
  const [createBusy, setCreateBusy] = useState(false)

  // detail dialog
  const [detail, setDetail] = useState<{ sub: Subscription; invoices: InvoiceRow[] } | null>(null)

  // confirm state
  const [confirm, setConfirm] = useState<{ kind: 'cancel' | 'delete'; sub: Subscription } | null>(null)

  const page = getNum('page', 1)
  const statusFilter = get('status', 'ALL')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      const q = get('q')
      if (q) params.set('q', q)
      if (statusFilter !== 'ALL') params.set('status', statusFilter)
      if (page > 1) params.set('page', String(page))
      const res = await fetchApi<ListResp>(`/api/admin/subscriptions?${params.toString()}`)
      setData(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [get, page, statusFilter])

  useEffect(() => { void load() }, [load])

  // customer search (create dialog)
  useEffect(() => {
    if (!createOpen || !customerQuery.trim()) { setCustomerHits([]); return }
    const id = window.setTimeout(async () => {
      try {
        const res = await fetchApi<{ customers: CustomerHit[] }>(`/api/admin/customers?q=${encodeURIComponent(customerQuery.trim())}&page=1`)
        setCustomerHits((res.customers ?? []).slice(0, 5))
      } catch { setCustomerHits([]) }
    }, 250)
    return () => window.clearTimeout(id)
  }, [customerQuery, createOpen])

  const items = useMemo(() => data?.items ?? [], [data])

  // ── Actions ──
  const runTick = async () => {
    setTickBusy(true)
    try {
      const res = await fetchApi<{ billed: number }>('/api/admin/subscriptions/tick', { method: 'POST' })
      if (res.billed > 0) toast.success(`${t('subBillingDone')} — ${res.billed} ${t('subBilled')}`)
      else toast.info(t('subBilledNone'))
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setTickBusy(false)
    }
  }

  const patch = async (sub: Subscription, body: Record<string, unknown>, successMsg: string) => {
    setActionBusy(sub.id)
    try {
      await fetchApi(`/api/admin/subscriptions/${sub.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      toast.success(successMsg)
      void load()
      if (detail?.sub.id === sub.id) void openDetail(sub.id, true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setActionBusy(null)
    }
  }

  const markRetried = async (sub: Subscription, failed: boolean) => {
    setActionBusy(sub.id)
    try {
      await fetchApi('/api/admin/subscriptions/dunning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscriptionId: sub.id, failed }),
      })
      toast.success(failed ? t('subRetryFailToast') : t('subRetryOkToast'))
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setActionBusy(null)
    }
  }

  const doDelete = async (sub: Subscription) => {
    setActionBusy(sub.id)
    try {
      await fetchApi(`/api/admin/subscriptions/${sub.id}`, { method: 'DELETE' })
      toast.success(t('subDeleteToast'))
      setConfirm(null)
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setActionBusy(null)
    }
  }

  const openDetail = async (id: string, keepOpen = false) => {
    try {
      const res = await fetchApi<{ subscription: Subscription & { invoices: InvoiceRow[] } }>(`/api/admin/subscriptions/${id}`)
      setDetail({ sub: res.subscription, invoices: res.subscription.invoices ?? [] })
    } catch (e) {
      if (!keepOpen) toast.error(e instanceof Error ? e.message : 'Failed')
    }
  }

  const create = async () => {
    if (!planName.trim()) { toast.error(t('subPlanName')); return }
    setCreateBusy(true)
    try {
      await fetchApi('/api/admin/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planName: planName.trim(),
          amount: Number(amount),
          interval,
          customerId: pickedCustomer?.id ?? undefined,
          trialDays: Number(trialDays || 0),
          autoRetry,
          maxRetries: Number(maxRetries || 4),
          notes: notes.trim() || undefined,
        }),
      })
      toast.success(t('subCreatedToast'))
      setCreateOpen(false)
      setPlanName(''); setAmount(''); setPickedCustomer(null); setCustomerQuery('')
      setTrialDays('0'); setAutoRetry(true); setMaxRetries('4'); setNotes('')
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setCreateBusy(false)
    }
  }

  const statusOptions = ['ALL', 'ACTIVE', 'TRIALING', 'PAST_DUE', 'CANCELLED', 'COMPLETED'] as const

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('subTitle')}
        description={t('subDesc')}
        icon={<Repeat className="h-5 w-5" />}
        actions={(
          <>
            <Button variant="outline" className="press gap-1.5" disabled={tickBusy} onClick={() => void runTick()} title={t('subRunBillingHint')}>
              <Play className="h-4 w-4" /> {t('subRunBilling')}
            </Button>
            <Button className="press gap-1.5" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> {t('subNew')}
            </Button>
          </>
        )}
      />

      {/* Dunning banner */}
      {data && data.counts.pastDue > 0 && (
        <div className="anim-fade-up flex flex-wrap items-center gap-3 rounded-xl border border-warning/40 bg-warning/5 p-4">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
          <p className="min-w-0 flex-1 text-sm font-medium text-foreground">
            <span className="font-bold">{data.counts.pastDue}</span> {t('subDunningBanner')}
          </p>
          <Badge variant="outline" className="border-warning/40 bg-warning/10 text-amber-700 dark:text-amber-400">PAST_DUE</Badge>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label={t('subStatActive')} value={loading ? '' : String(data?.counts.active ?? 0)} icon={<Repeat className="h-4 w-4" />} tone="bg-success/10 text-success" loading={loading} />
        <StatCard label={t('subStatTrialing')} value={loading ? '' : String(data?.counts.trialing ?? 0)} icon={<CalendarClock className="h-4 w-4" />} loading={loading} />
        <StatCard label={t('subStatPastDue')} value={loading ? '' : String(data?.counts.pastDue ?? 0)} icon={<AlertTriangle className="h-4 w-4" />} tone="bg-destructive/10 text-destructive" loading={loading} />
        <StatCard label={t('subStatMrr')} value={loading ? '' : formatBDT(data?.mrr ?? 0)} icon={<TrendingUp className="h-4 w-4" />} tone="bg-primary/10 text-primary" loading={loading} />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <SearchInput paramKey="q" placeholder={t('subSearch')} className="w-full sm:w-64" />
          <Select value={statusFilter} onValueChange={(v) => set({ status: v, page: 1 })}>
            <SelectTrigger className="h-9 w-[9.5rem]" aria-label={t('subColStatus')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((s) => <SelectItem key={s} value={s}>{s === 'ALL' ? 'All' : s.replaceAll('_', ' ')}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Error / table */}
      {error && !loading ? (
        <ErrorCard message={error} onRetry={() => void load()} />
      ) : (
        <Card className="overflow-hidden p-0">
          {loading ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              icon={<Repeat className="h-7 w-7" />}
              title={t('subEmptyTitle')}
              hint={t('subEmptyHint')}
              action={<Button className="press gap-1.5" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> {t('subEmptyCta')}</Button>}
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-left text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-3 font-semibold">{t('subColPlan')}</th>
                      <th className="px-4 py-3 font-semibold">{t('subColCustomer')}</th>
                      <th className="px-4 py-3 font-semibold">{t('subColAmount')}</th>
                      <th className="px-4 py-3 font-semibold">{t('subColNext')}</th>
                      <th className="px-4 py-3 font-semibold">{t('subColCycles')}</th>
                      <th className="px-4 py-3 font-semibold">{t('subColStatus')}</th>
                      <th className="px-4 py-3 text-right font-semibold">{t('subColActions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((s, i) => (
                      <tr key={s.id} className="border-b transition-colors last:border-0 hover:bg-muted/30" style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}>
                        <td className="px-4 py-3">
                          <button type="button" className="text-left font-semibold text-foreground hover:text-primary" onClick={() => void openDetail(s.id)}>
                            {s.planName}
                          </button>
                          {s.autoRetry && <span className="ml-2 inline-flex items-center gap-0.5 text-[10px] text-muted-foreground"><RefreshCcw className="h-2.5 w-2.5" />auto</span>}
                        </td>
                        <td className="px-4 py-3">
                          {s.customerId ? (
                            <Link href={`/admin/customers/${s.customerId}`} className="text-foreground hover:text-primary hover:underline">
                              {s.customer?.name ?? s.customerName ?? '—'}
                            </Link>
                          ) : (s.customerName || <span className="text-muted-foreground">—</span>)}
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-bold tabular">{formatBDT(s.amount)}</span>
                          <span className="ml-1 text-[11px] text-muted-foreground">/ {s.interval.toLowerCase()}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            {countdownChip(s.nextBillingAt, t('subDueNow'), t('subNextIn'))}
                            {s.nextBillingAt && <span className="text-[10px] text-muted-foreground">{formatDateTime(s.nextBillingAt)}</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3 tabular">
                          {s.cycles}
                          {s.retryCount > 0 && <span className="ml-1.5 text-[10px] font-semibold text-destructive">{s.retryCount}/{s.maxRetries} {t('subRetries')}</span>}
                        </td>
                        <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                        <td className="px-4 py-3 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="press h-8 w-8 p-0" aria-label={`${s.planName} actions`}>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {s.status === 'PAST_DUE' && (
                                <DropdownMenuItem onClick={() => void markRetried(s, false)}>
                                  <RotateCcw className="h-3.5 w-3.5" /> {t('subMarkRetried')}
                                </DropdownMenuItem>
                              )}
                              {['CANCELLED', 'PAST_DUE', 'COMPLETED'].includes(s.status) && (
                                <DropdownMenuItem onClick={() => void patch(s, { action: 'reactivate' }, t('subReactivateToast'))}>
                                  <Play className="h-3.5 w-3.5" /> {t('subActionReactivate')}
                                </DropdownMenuItem>
                              )}
                              {!['CANCELLED', 'COMPLETED'].includes(s.status) && (
                                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setConfirm({ kind: 'cancel', sub: s })}>
                                  <Ban className="h-3.5 w-3.5" /> {t('subActionCancel')}
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setConfirm({ kind: 'delete', sub: s })}>
                                <Trash2 className="h-3.5 w-3.5" /> {t('subActionDelete')}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="border-t px-4">
                <Pagination page={data?.page ?? 1} pages={data?.pages ?? 1} total={data?.total ?? 0} />
              </div>
            </>
          )}
        </Card>
      )}

      {/* ── Create dialog ── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto nice-scroll">
          <DialogHeader>
            <DialogTitle>{t('subCreateTitle')}</DialogTitle>
            <DialogDescription>{t('subEmptyHint')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="sub-plan">{t('subPlanName')}</Label>
              <Input id="sub-plan" value={planName} onChange={(e) => setPlanName(e.target.value)} placeholder={t('subPlanPlaceholder')} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="sub-amount">{t('subAmount')}</Label>
                <Input id="sub-amount" type="number" min="1" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="500" />
              </div>
              <div className="space-y-1.5">
                <Label>{t('subInterval')}</Label>
                <Select value={interval} onValueChange={setInterval_}>
                  <SelectTrigger aria-label={t('subInterval')}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {INTERVALS.map((ivl) => (
                      <SelectItem key={ivl} value={ivl}>{t(`subIvl${ivl.charAt(0)}${ivl.slice(1).toLowerCase()}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t('subCustomer')}</Label>
              {pickedCustomer ? (
                <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                  <span className="font-medium">{pickedCustomer.name}{pickedCustomer.phone ? ` · ${pickedCustomer.phone}` : ''}</span>
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setPickedCustomer(null)}>{t('subCustomerNone')}</Button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={customerQuery} onChange={(e) => setCustomerQuery(e.target.value)} placeholder={t('subCustomerSearch')} className="pl-9" />
                  {customerHits.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border bg-card shadow-lg">
                      {customerHits.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className="block w-full px-3 py-2.5 text-left text-sm hover:bg-muted"
                          onClick={() => { setPickedCustomer(c); setCustomerQuery('') }}
                        >
                          <span className="font-medium">{c.name}</span>
                          {c.phone && <span className="ml-2 text-xs text-muted-foreground">{c.phone}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="sub-trial">{t('subTrialDays')}</Label>
                <Input id="sub-trial" type="number" min="0" max="365" value={trialDays} onChange={(e) => setTrialDays(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sub-maxretry">{t('subMaxRetries')}</Label>
                <Input id="sub-maxretry" type="number" min="0" max="20" value={maxRetries} onChange={(e) => setMaxRetries(e.target.value)} />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
              <Label htmlFor="sub-autoretry" className="cursor-pointer text-sm">{t('subAutoRetry')}</Label>
              <Switch id="sub-autoretry" checked={autoRetry} onCheckedChange={setAutoRetry} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sub-notes">{t('subNotes')}</Label>
              <Textarea id="sub-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>{t('subActionCancel')}</Button>
            <Button className="press" disabled={createBusy} onClick={() => void create()}>{t('subCreateCta')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Detail dialog ── */}
      <Dialog open={!!detail} onOpenChange={(open) => { if (!open) setDetail(null) }}>
        <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto nice-scroll">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2">
                  {detail.sub.planName}
                  <StatusBadge status={detail.sub.status} />
                </DialogTitle>
                <DialogDescription>
                  {formatBDT(detail.sub.amount)} / {detail.sub.interval.toLowerCase()} · {detail.sub.cycles} {t('subCycleCount')}
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <div><span className="text-muted-foreground">{t('subDetailNext')}:</span> <span className="font-semibold">{formatDateTime(detail.sub.nextBillingAt)}</span></div>
                <div><span className="text-muted-foreground">{t('subDetailTrialEnds')}:</span> <span className="font-semibold">{detail.sub.trialEndsAt ? formatDateTime(detail.sub.trialEndsAt) : '—'}</span></div>
                <div><span className="text-muted-foreground">{t('subDetailCreated')}:</span> <span className="font-semibold">{formatDateTime(detail.sub.createdAt)}</span></div>
                <div><span className="text-muted-foreground">{t('subDetailGateway')}:</span> <span className="font-semibold">{detail.sub.gatewayCode ?? '—'}</span></div>
                <div><span className="text-muted-foreground">{t('subDetailAutoRetry')}:</span> <span className="font-semibold">{detail.sub.autoRetry ? 'On' : 'Off'}</span></div>
                <div><span className="text-muted-foreground">{t('subDetailRetries')}:</span> <span className="font-semibold">{detail.sub.retryCount}/{detail.sub.maxRetries}</span></div>
              </div>
              {detail.sub.notes && <p className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">{detail.sub.notes}</p>}
              <div>
                <p className="mb-2 mt-1 text-sm font-bold text-foreground">{t('subDetailInvoices')}</p>
                {detail.invoices.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t('subNoInvoices')}</p>
                ) : (
                  <div className="max-h-56 space-y-2 overflow-y-auto nice-scroll">
                    {detail.invoices.map((inv) => (
                      <div key={inv.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2.5 text-xs">
                        <div className="min-w-0">
                          <p className="font-mono font-semibold">{inv.number}</p>
                          <p className="truncate text-muted-foreground">{inv.title}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold tabular">{formatBDT(inv.total)}</span>
                          <StatusBadge status={inv.status} />
                          <span className="hidden text-[10px] text-muted-foreground sm:inline" title={inv.createdAt}>{timeAgo(inv.createdAt)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Confirm cancel / delete ── */}
      <AlertDialog open={!!confirm} onOpenChange={(open) => { if (!open) setConfirm(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.kind === 'cancel' ? t('subCancelConfirmTitle') : t('subDeleteConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.kind === 'cancel' ? t('subCancelConfirmHint') : t('subDeleteConfirmHint')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('subActionCancel')}</AlertDialogCancel>
            <AlertDialogAction
              className={cn(confirm?.kind === 'delete' && 'bg-destructive text-white hover:bg-destructive/90')}
              disabled={actionBusy === confirm?.sub.id}
              onClick={() => {
                if (!confirm) return
                if (confirm.kind === 'cancel') void patch(confirm.sub, { action: 'cancel' }, t('subCancelToast')).then(() => setConfirm(null))
                else void doDelete(confirm.sub)
              }}
            >
              {confirm?.kind === 'cancel' ? t('subActionCancel') : t('subActionDelete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
