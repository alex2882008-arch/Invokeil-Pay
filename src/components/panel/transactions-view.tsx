'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
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
import { Download, ArrowLeftRight, Inbox, Undo2, LinkIcon, Trash2, X } from 'lucide-react'
import { formatBDT, timeAgo } from '@/lib/format'
import { fetchApi } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import { useUrlState } from '@/hooks/use-url-state'
import { useLang } from '@/lib/i18n'
import { isAdminRole } from '@/lib/roles'
import {
  PageHeader, StatCard, MfsBadge, StatusBadge, EmptyState, ErrorCard, Pagination, SearchInput,
} from './ui-bits'
import { GatewayLogo } from './gateway-logo'

// ── Types / guards ───────────────────────────────────────────────────────────

interface TxItem {
  id: string
  trxId: string | null
  mfs: string
  gatewayCode?: string | null
  amount: number
  status: string
  senderNumber: string | null
  senderName: string | null
  occurredAt: string
  device?: { name: string | null } | null
  checkout?: { token: string; title: string } | null
}

interface ListData {
  items: TxItem[]
  total: number
  page: number
  pageSize: number
}

interface SummaryData {
  total: number
  volume: number
  unmatched: number
  today: number
}

interface CheckoutOption {
  id: string
  token: string
  title: string
  amount: number
  status: string
}

function isListData(d: unknown): d is ListData {
  if (!d || typeof d !== 'object') return false
  const o = d as Partial<ListData>
  return Array.isArray(o.items) && typeof o.total === 'number' && typeof o.page === 'number'
}

function isSummaryData(d: unknown): d is SummaryData {
  if (!d || typeof d !== 'object') return false
  const s = d as Partial<SummaryData>
  return typeof s.total === 'number' && typeof s.volume === 'number' && typeof s.unmatched === 'number' && typeof s.today === 'number'
}

const STATUS_OPTIONS = ['PAID', 'MATCHED', 'UNMATCHED', 'REVERSED'] as const
const MFS_OPTIONS = ['BKASH', 'NAGAD', 'ROCKET', 'UPAY', 'BANK', 'OTHER'] as const

// ── View ─────────────────────────────────────────────────────────────────────

export function TransactionsView() {
  const { t } = useLang()
  const router = useRouter()
  const { get, getNum, set } = useUrlState()

  const q = get('q')
  const status = get('status', 'ALL')
  const mfs = get('mfs', 'ALL')
  const from = get('from')
  const to = get('to')
  const page = getNum('page', 1)

  const [data, setData] = useState<ListData | null>(null)
  const [summary, setSummary] = useState<SummaryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [role, setRole] = useState<string>('VIEWER')

  // selection + bulk
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [reverseOpen, setReverseOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [matchOpen, setMatchOpen] = useState(false)
  const [checkouts, setCheckouts] = useState<CheckoutOption[] | null>(null)
  const [checkoutsLoading, setCheckoutsLoading] = useState(false)
  const [pickedCheckout, setPickedCheckout] = useState<string>('')

  const listParams = useCallback((): URLSearchParams => {
    const p = new URLSearchParams({ page: String(page) })
    if (q) p.set('q', q)
    if (status && status !== 'ALL') p.set('status', status)
    if (mfs && mfs !== 'ALL') p.set('mfs', mfs)
    if (from) p.set('from', from)
    if (to) p.set('to', to)
    return p
  }, [page, q, status, mfs, from, to])

  const load = useCallback(async () => {
    try {
      const d = await fetchApi<unknown>(`/api/admin/transactions?${listParams().toString()}`)
      if (!isListData(d)) throw new Error('Unexpected response from server')
      setError(null)
      setData(d)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [listParams])

  const loadSummary = useCallback(async () => {
    try {
      const p = listParams()
      p.delete('page')
      p.set('summary', '1')
      const d = await fetchApi<unknown>(`/api/admin/transactions?${p.toString()}`)
      if (isSummaryData(d)) setSummary(d)
    } catch { /* stat cards stay stale — non-fatal */ }
  }, [listParams])

  useEffect(() => { load() }, [load])
  useEffect(() => { loadSummary() }, [loadSummary])

  // Role (delete is ADMIN-only)
  useEffect(() => {
    const id = window.setTimeout(() => {
      fetchApi<{ user: { role: string } | null }>('/api/auth/me')
        .then((d) => setRole(d.user?.role ?? 'VIEWER'))
        .catch(() => { /* stays VIEWER */ })
    }, 0)
    return () => window.clearTimeout(id)
  }, [])

  // Prune selection to rows still on the current page (filters/pages changed)
  useEffect(() => {
    const id = window.setTimeout(() => {
      setSelected((prev) => {
        const onPage = new Set((data?.items ?? []).map((i) => i.id))
        const next = new Set([...prev].filter((x) => onPage.has(x)))
        return next.size === prev.size ? prev : next
      })
    }, 0)
    return () => window.clearTimeout(id)
  }, [data])

  const isAdmin = isAdminRole(role)
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1
  const items = data?.items ?? []
  const selectedCount = selected.size
  const allPageSelected = items.length > 0 && items.every((i) => selected.has(i.id))

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    setSelected((prev) => {
      if (items.every((i) => prev.has(i.id))) {
        const next = new Set(prev)
        for (const i of items) next.delete(i.id)
        return next
      }
      return new Set([...prev, ...items.map((i) => i.id)])
    })
  }

  const exportCsv = () => {
    const p = listParams()
    p.delete('page')
    p.set('format', 'csv')
    const a = document.createElement('a')
    a.href = `/api/admin/transactions?${p.toString()}`
    a.download = 'transactions.csv'
    document.body.appendChild(a)
    a.click()
    a.remove()
    toast.success(t('exportStarted'))
  }

  // ── Bulk actions ───────────────────────────────────────────────────────────

  const loadOpenCheckouts = useCallback(async () => {
    setCheckoutsLoading(true)
    try {
      let list: CheckoutOption[] = []
      try {
        const r = await fetchApi<{ items?: CheckoutOption[] }>('/api/admin/checkouts?status=open&page=1')
        list = Array.isArray(r.items) ? r.items : []
      } catch { /* fall through to explicit statuses */ }
      if (list.length === 0) {
        const [a, b] = await Promise.all([
          fetchApi<{ items?: CheckoutOption[] }>('/api/admin/checkouts?status=AWAITING&page=1'),
          fetchApi<{ items?: CheckoutOption[] }>('/api/admin/checkouts?status=PENDING&page=1'),
        ])
        list = [...(a.items ?? []), ...(b.items ?? [])]
      }
      setCheckouts(list.filter((c) => c.status !== 'PAID' && c.status !== 'CANCELLED' && c.status !== 'EXPIRED'))
    } catch {
      setCheckouts([])
    } finally {
      setCheckoutsLoading(false)
    }
  }, [])

  const openMatchDialog = () => {
    setPickedCheckout('')
    setCheckouts(null)
    setMatchOpen(true)
    loadOpenCheckouts()
  }

  const runBulk = async (action: 'reverse' | 'delete' | 'match', checkoutId?: string) => {
    setBulkBusy(true)
    try {
      await fetchApi('/api/admin/transactions/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [...selected], action, checkoutId }),
      })
      toast.success(action === 'reverse' ? t('bulkReversed') : action === 'delete' ? t('bulkDeleted') : t('bulkMatched'))
      setSelected(new Set())
      setReverseOpen(false)
      setDeleteOpen(false)
      setMatchOpen(false)
      load()
      loadSummary()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed')
    } finally {
      setBulkBusy(false)
    }
  }

  const clearFilters = () => set({ q: null, status: null, mfs: null, from: null, to: null, page: 1 })
  const hasFilters = !!(q || (status && status !== 'ALL') || (mfs && mfs !== 'ALL') || from || to)

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('transactions')}
        description={t('txPageDesc')}
        icon={<ArrowLeftRight className="h-5 w-5" />}
        actions={
          <Button variant="outline" className="press gap-1.5" onClick={exportCsv}>
            <Download className="h-4 w-4" /> {t('export')}
          </Button>
        }
      />

      {/* Summary cards */}
      <div className="stagger grid gap-4 sm:grid-cols-3">
        <StatCard
          label={t('volume')}
          value={summary ? formatBDT(summary.volume) : '—'}
          icon={<ArrowLeftRight className="h-5 w-5" />}
          tone="text-success bg-success/10"
          loading={!summary}
        />
        <StatCard
          label={t('totalTx')}
          value={summary ? String(summary.total) : '—'}
          icon={<Inbox className="h-5 w-5" />}
          tone="text-primary bg-primary/10"
          loading={!summary}
        />
        <StatCard
          label={t('unmatched')}
          value={summary ? String(summary.unmatched) : '—'}
          icon={<Undo2 className="h-5 w-5" />}
          tone="text-warning bg-warning/10"
          loading={!summary}
        />
      </div>

      {/* Filter bar */}
      <div className="anim-fade-in flex flex-col gap-2 lg:flex-row lg:items-center">
        <SearchInput paramKey="q" placeholder={t('searchTx')} className="lg:w-64" />
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <Select value={status} onValueChange={(v) => set({ status: v === 'ALL' ? null : v, page: 1 })}>
            <SelectTrigger className="h-9 w-full sm:w-36" aria-label={t('status')}>
              <SelectValue placeholder={t('status')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t('status')}: {t('all')}</SelectItem>
              {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={mfs} onValueChange={(v) => set({ mfs: v === 'ALL' ? null : v, page: 1 })}>
            <SelectTrigger className="h-9 w-full sm:w-36" aria-label={t('mfs')}>
              <SelectValue placeholder={t('mfs')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t('mfs')}: {t('all')}</SelectItem>
              {MFS_OPTIONS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input
            type="date"
            value={from}
            onChange={(e) => set({ from: e.target.value || null, page: 1 })}
            className="h-9"
            aria-label={t('dateFrom')}
          />
          <Input
            type="date"
            value={to}
            onChange={(e) => set({ to: e.target.value || null, page: 1 })}
            className="h-9"
            aria-label={t('dateTo')}
          />
        </div>
        {hasFilters && (
          <Button variant="ghost" size="sm" className="press h-9 gap-1.5 text-muted-foreground lg:ml-auto" onClick={clearFilters}>
            <X className="h-3.5 w-3.5" /> {t('clearFilters')}
          </Button>
        )}
      </div>

      {/* Content */}
      {error && !data ? (
        <ErrorCard message={error} onRetry={() => { setLoading(true); load() }} />
      ) : loading && !data ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
        </div>
      ) : items.length === 0 ? (
        <Card className="border-dashed p-2 shadow-brand">
          {hasFilters ? (
            <EmptyState
              icon={<ArrowLeftRight className="h-7 w-7" />}
              title={t('noResults')}
              action={
                <Button variant="outline" size="sm" className="press" onClick={clearFilters}>
                  {t('clearFilters')}
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={<ArrowLeftRight className="h-7 w-7" />}
              title={t('noData')}
              hint={t('simHint')}
              action={
                <Link href="/admin/sms">
                  <Button className="press gap-1.5">{t('openSmsCenter')}</Button>
                </Link>
              }
            />
          )}
        </Card>
      ) : (
        <>
          {/* Desktop table */}
          <Card className="hidden overflow-hidden p-0 shadow-brand md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left">
                    <th className="w-10 px-4 py-3">
                      <Checkbox
                        checked={allPageSelected}
                        onCheckedChange={toggleAll}
                        aria-label={t('selectAll')}
                      />
                    </th>
                    <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('mfs')}</th>
                    <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('trxId')}</th>
                    <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('senderCol')}</th>
                    <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('amount')}</th>
                    <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('status')}</th>
                    <th className="hidden px-3 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground lg:table-cell">{t('deviceCol')}</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('timeCol')}</th>
                  </tr>
                </thead>
                <tbody className="stagger">
                  {items.map((tx) => (
                    <tr
                      key={tx.id}
                      className="cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/40"
                      onClick={() => router.push(`/admin/transactions/${tx.id}`)}
                    >
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selected.has(tx.id)}
                          onCheckedChange={() => toggleOne(tx.id)}
                          aria-label={`${t('selectRow')} ${tx.trxId ?? tx.id}`}
                        />
                      </td>
                      <td className="px-3 py-3">
                        <span className="inline-flex items-center gap-1.5">
                          <GatewayLogo code={tx.gatewayCode} mfs={tx.mfs} size={28} rounded="rounded-lg" />
                          <MfsBadge mfs={tx.mfs} />
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <Link
                          href={`/admin/transactions/${tx.id}`}
                          className="block max-w-40 truncate font-mono text-xs font-medium text-primary hover:underline"
                        >
                          {tx.trxId ?? '—'}
                        </Link>
                        {tx.checkout && (
                          <span className="block max-w-40 truncate text-[11px] text-muted-foreground/70">{tx.checkout.title}</span>
                        )}
                      </td>
                      <td className="max-w-36 truncate px-3 py-3 text-xs text-foreground/80">
                        {tx.senderNumber ?? tx.senderName ?? '—'}
                      </td>
                      <td className="tabular px-3 py-3 font-semibold text-foreground">{formatBDT(tx.amount)}</td>
                      <td className="px-3 py-3"><StatusBadge status={tx.status} /></td>
                      <td className="hidden max-w-32 truncate px-3 py-3 text-xs text-muted-foreground lg:table-cell">{tx.device?.name ?? '—'}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-xs text-muted-foreground">{timeAgo(tx.occurredAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Mobile cards */}
          <div className="stagger space-y-3 md:hidden">
            {items.map((tx) => (
              <Card
                key={tx.id}
                className="hover-lift cursor-pointer p-4 shadow-brand"
                onClick={() => router.push(`/admin/transactions/${tx.id}`)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2.5" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selected.has(tx.id)}
                      onCheckedChange={() => toggleOne(tx.id)}
                      aria-label={`${t('selectRow')} ${tx.trxId ?? tx.id}`}
                    />
                    <div className="min-w-0">
                      <span className="flex items-center gap-1.5">
                        <GatewayLogo code={tx.gatewayCode} mfs={tx.mfs} size={28} rounded="rounded-lg" />
                        <MfsBadge mfs={tx.mfs} />
                      </span>
                      <p className="mt-1 truncate font-mono text-xs text-primary">{tx.trxId ?? '—'}</p>
                    </div>
                  </div>
                  <StatusBadge status={tx.status} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-muted-foreground">{t('amount')}</p>
                    <p className="tabular font-semibold text-foreground">{formatBDT(tx.amount)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">{t('senderCol')}</p>
                    <p className="truncate text-foreground/80">{tx.senderNumber ?? tx.senderName ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">{t('deviceCol')}</p>
                    <p className="truncate text-foreground/80">{tx.device?.name ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">{t('timeCol')}</p>
                    <p className="text-foreground/80">{timeAgo(tx.occurredAt)}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          <Pagination page={data?.page ?? page} pages={pages} total={data?.total ?? 0} />
        </>
      )}

      {/* Floating bulk action bar */}
      {selectedCount > 0 && (
        <div
          className="anim-fade-up fixed bottom-20 left-1/2 z-40 flex -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-2xl border bg-card/95 p-2.5 shadow-lg backdrop-blur md:bottom-6"
          role="toolbar"
          aria-label={t('bulkActions')}
        >
          <span className="px-1.5 text-xs font-bold text-foreground tabular">
            {t('selectedCount').replace('{n}', String(selectedCount))}
          </span>
          <Button
            size="sm"
            variant="outline"
            className="press h-8 gap-1.5 border-warning/40 text-amber-700 hover:bg-warning/10 dark:text-amber-400"
            disabled={bulkBusy}
            onClick={() => setReverseOpen(true)}
          >
            <Undo2 className="h-3.5 w-3.5" /> {t('reverse')}
          </Button>
          <Button size="sm" variant="outline" className="press h-8 gap-1.5" disabled={bulkBusy} onClick={openMatchDialog}>
            <LinkIcon className="h-3.5 w-3.5" /> {t('matchAction')}
          </Button>
          {isAdmin && (
            <Button
              size="sm"
              variant="outline"
              className="press h-8 gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10"
              disabled={bulkBusy}
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="h-3.5 w-3.5" /> {t('delete')}
            </Button>
          )}
          <Button size="icon" variant="ghost" className="press h-8 w-8 text-muted-foreground" aria-label={t('clearSelection')} onClick={() => setSelected(new Set())}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Bulk reverse confirm */}
      <AlertDialog open={reverseOpen} onOpenChange={setReverseOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('reverse')} ({selectedCount})</AlertDialogTitle>
            <AlertDialogDescription>{t('bulkReverseConfirm').replace('{n}', String(selectedCount))}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction className="press bg-warning text-warning-foreground hover:bg-warning/90" disabled={bulkBusy} onClick={() => runBulk('reverse')}>
              {t('reverse')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk delete confirm */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('delete')} ({selectedCount})</AlertDialogTitle>
            <AlertDialogDescription>{t('bulkDeleteConfirm').replace('{n}', String(selectedCount))}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction className="press bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={bulkBusy} onClick={() => runBulk('delete')}>
              {t('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk match dialog */}
      <Dialog open={matchOpen} onOpenChange={setMatchOpen}>
        <DialogContent className="nice-scroll max-h-[92vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('matchToCheckout')} ({selectedCount})</DialogTitle>
            <DialogDescription>{t('matchDialogDesc')}</DialogDescription>
          </DialogHeader>
          {checkoutsLoading ? (
            <div className="space-y-2 py-2">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
              <p className="text-center text-xs text-muted-foreground">{t('openCheckoutsLoading')}</p>
            </div>
          ) : !checkouts || checkouts.length === 0 ? (
            <div className="py-4">
              <EmptyState icon={<Inbox className="h-6 w-6" />} title={t('noOpenCheckouts')} hint={t('createCheckoutFirst')} />
            </div>
          ) : (
            <div className="nice-scroll max-h-72 space-y-2 overflow-y-auto pr-1">
              {checkouts.map((c) => (
                <Label
                  key={c.id}
                  htmlFor={`ck-${c.id}`}
                  className={cn(
                    'press flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors',
                    pickedCheckout === c.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                  )}
                >
                  <input
                    id={`ck-${c.id}`}
                    type="radio"
                    name="bulk-checkout"
                    className="accent-[hsl(var(--primary))]"
                    checked={pickedCheckout === c.id}
                    onChange={() => setPickedCheckout(c.id)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-foreground">{c.title}</span>
                    <span className="block truncate font-mono text-[11px] text-muted-foreground">{c.token}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="tabular block text-sm font-bold text-foreground">{formatBDT(c.amount)}</span>
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{c.status}</span>
                  </span>
                </Label>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setMatchOpen(false)}>{t('cancel')}</Button>
            <Button className="press" disabled={!pickedCheckout || bulkBusy} onClick={() => runBulk('match', pickedCheckout)}>
              {t('applyMatch')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
