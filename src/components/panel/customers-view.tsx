'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { toast } from 'sonner'
import {
  Contact2, Plus, Eye, Pencil, Ban, RotateCcw, Trash2, UserRoundSearch, RefreshCw,
} from 'lucide-react'
import { formatBDT, formatDateTime } from '@/lib/format'
import { fetchApi } from '@/lib/api-client'
import { MfsBadge, StatusBadge, PageHeader, StatCard, EmptyState, ErrorCard, Pagination, SearchInput, DetailRow } from './ui-bits'
import { useLang } from '@/lib/i18n'
import { useUrlState } from '@/hooks/use-url-state'

// ── Types ────────────────────────────────────────────────────────────────────

interface CustomerRow {
  id: string
  name: string
  email: string | null
  phone: string | null
  suspended: boolean
  suspendReason: string | null
  notes: string | null
  insertedVia: string
  createdAt: string
  updatedAt: string
  _count: { transactions: number }
}

interface CustomersListData {
  customers: CustomerRow[]
  total: number
  page: number
  pages: number
}

interface SummaryData {
  total: number
  suspended: number
  withTx: number
}

interface DetailTx {
  id: string
  trxId: string | null
  mfs: string
  amount: number
  status: string
  occurredAt: string
}

interface CustomerDetail {
  customer: CustomerRow
  transactions: DetailTx[]
  counts: { transactions: number }
}

interface CustomerForm {
  name: string
  email: string
  phone: string
  notes: string
}

const EMPTY_FORM: CustomerForm = { name: '', email: '', phone: '', notes: '' }

// ── Small pieces ─────────────────────────────────────────────────────────────

function CustomerStatusBadge({ c, labelActive, labelSuspended }: { c: CustomerRow; labelActive: string; labelSuspended: string }) {
  if (!c.suspended) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-[11px] font-bold text-success">
        <span className="h-1.5 w-1.5 rounded-full bg-success" />
        {labelActive}
      </span>
    )
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex cursor-help items-center gap-1.5 rounded-full bg-destructive/10 px-2.5 py-1 text-[11px] font-bold text-destructive">
          <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
          {labelSuspended}
        </span>
      </TooltipTrigger>
      {c.suspendReason && (
        <TooltipContent className="max-w-56"><p className="font-semibold">{c.suspendReason}</p></TooltipContent>
      )}
    </Tooltip>
  )
}

function RowActions({
  onView, onEdit, onToggleSuspend, onDelete, suspended, labels,
}: {
  onView: () => void
  onEdit: () => void
  onToggleSuspend: () => void
  onDelete: () => void
  suspended: boolean
  labels: { view: string; edit: string; suspend: string; restore: string; del: string }
}) {
  const cls = 'press h-10 w-10'
  return (
    <div className="flex items-center justify-end gap-0.5">
      <Button variant="ghost" size="icon" className={cls} aria-label={labels.view} title={labels.view} onClick={onView}>
        <Eye className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon" className={cls} aria-label={labels.edit} title={labels.edit} onClick={onEdit}>
        <Pencil className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost" size="icon"
        className={cls}
        aria-label={suspended ? labels.restore : labels.suspend}
        title={suspended ? labels.restore : labels.suspend}
        onClick={onToggleSuspend}
      >
        {suspended ? <RotateCcw className="h-4 w-4 text-success" /> : <Ban className="h-4 w-4 text-amber-600" />}
      </Button>
      <Button
        variant="ghost" size="icon" className={cls}
        aria-label={labels.del} title={labels.del} onClick={onDelete}
      >
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    </div>
  )
}

// ── Main view ────────────────────────────────────────────────────────────────

export function CustomersView() {
  const { t } = useLang()
  const sp = useUrlState()

  const page = sp.getNum('page', 1)
  const q = sp.get('q')
  const suspended = sp.get('suspended') // '' | '1' | '0'

  const [data, setData] = useState<CustomersListData | null>(null)
  const [summary, setSummary] = useState<SummaryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Create / edit
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<CustomerRow | null>(null)
  const [form, setForm] = useState<CustomerForm>(EMPTY_FORM)
  const [busy, setBusy] = useState(false)

  // Suspend (reason required)
  const [suspendTarget, setSuspendTarget] = useState<CustomerRow | null>(null)
  const [suspendReason, setSuspendReason] = useState('')

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<CustomerRow | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  // Detail dialog
  const [detailId, setDetailId] = useState<string | null>(null)
  const [detail, setDetail] = useState<CustomerDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page) })
      if (q) params.set('q', q)
      if (suspended === '1' || suspended === '0') params.set('suspended', suspended)
      const [list, sum] = await Promise.all([
        fetchApi<CustomersListData>(`/api/admin/customers?${params.toString()}`),
        fetchApi<SummaryData>('/api/admin/customers?summary=1'),
      ])
      setData({ ...list, customers: Array.isArray(list.customers) ? list.customers : [] })
      setSummary(sum)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [page, q, suspended])

  useEffect(() => { load() }, [load])

  // ── Mutations ──────────────────────────────────────────────────────────────

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormOpen(true)
  }

  function openEdit(c: CustomerRow) {
    setEditing(c)
    setForm({ name: c.name, email: c.email ?? '', phone: c.phone ?? '', notes: c.notes ?? '' })
    setFormOpen(true)
  }

  async function saveForm() {
    setBusy(true)
    try {
      const body = JSON.stringify({
        name: form.name,
        email: form.email || undefined,
        phone: form.phone || undefined,
        notes: form.notes || undefined,
      })
      if (editing) {
        await fetchApi(`/api/admin/customers/${editing.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body })
        toast.success(t('custUpdatedMsg'))
      } else {
        await fetchApi('/api/admin/customers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
        toast.success(t('custCreatedMsg'))
      }
      setFormOpen(false)
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  async function confirmSuspend() {
    if (!suspendTarget) return
    if (!suspendReason.trim()) {
      toast.error(t('custSuspendRequired'))
      return
    }
    setBusy(true)
    try {
      await fetchApi(`/api/admin/customers/${suspendTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suspended: true, suspendReason: suspendReason.trim() }),
      })
      toast.success(t('custSuspendedMsg'))
      setSuspendTarget(null)
      setSuspendReason('')
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  async function restore(c: CustomerRow) {
    try {
      await fetchApi(`/api/admin/customers/${c.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suspended: false }),
      })
      toast.success(t('custRestoredMsg'))
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleteBusy(true)
    try {
      await fetchApi(`/api/admin/customers/${deleteTarget.id}`, { method: 'DELETE' })
      toast.success(t('custDeletedMsg'))
      setDeleteTarget(null)
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setDeleteBusy(false)
    }
  }

  async function openDetail(id: string) {
    setDetailId(id)
    setDetail(null)
    setDetailError(null)
    setDetailLoading(true)
    try {
      const d = await fetchApi<CustomerDetail>(`/api/admin/customers/${id}`)
      setDetail(d)
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setDetailLoading(false)
    }
  }

  const detailCustomer = detail?.customer ?? null

  // ── Render ─────────────────────────────────────────────────────────────────

  const actionLabels = {
    view: t('viewDetails'), edit: t('edit'), suspend: t('custSuspend'), restore: t('custRestore'), del: t('delete'),
  }

  return (
    <div className="space-y-5">
      <PageHeader
        icon={<Contact2 className="h-5 w-5" />}
        title={t('custTitle')}
        description={t('custDesc')}
        actions={
          <Button onClick={openCreate} className="press min-h-10 gap-1.5">
            <Plus className="h-4 w-4" /> {t('custNew')}
          </Button>
        }
      />

      {/* Stats */}
      <div className="stagger grid gap-4 sm:grid-cols-3">
        <StatCard
          loading={!summary}
          label={t('custStatTotal')}
          value={summary ? String(summary.total) : '0'}
          icon={<Contact2 className="h-5 w-5" />}
        />
        <StatCard
          loading={!summary}
          label={t('custStatSuspended')}
          value={summary ? String(summary.suspended) : '0'}
          icon={<Ban className="h-5 w-5" />}
          tone="text-destructive bg-destructive/10"
        />
        <StatCard
          loading={!summary}
          label={t('custStatWithTx')}
          value={summary ? String(summary.withTx) : '0'}
          icon={<UserRoundSearch className="h-5 w-5" />}
          tone="text-success bg-success/10"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput paramKey="q" placeholder={t('custSearchPh')} className="sm:max-w-xs" />
        <Select
          value={suspended === '1' || suspended === '0' ? suspended : 'ALL'}
          onValueChange={(v) => sp.set({ suspended: v === 'ALL' ? null : v, page: null })}
        >
          <SelectTrigger className="h-10 w-full sm:w-44" aria-label={t('status')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('custFilterAll')}</SelectItem>
            <SelectItem value="0">{t('custFilterActive')}</SelectItem>
            <SelectItem value="1">{t('custFilterSuspended')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Content */}
      {error && !loading ? (
        <ErrorCard message={error} onRetry={load} />
      ) : loading ? (
        <div className="space-y-2 rounded-xl border bg-card p-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
        </div>
      ) : (data?.customers.length ?? 0) === 0 ? (
        q || suspended ? (
          <EmptyState
            icon={<Contact2 className="h-10 w-10" />}
            title={t('custNoMatch')}
            action={
              <Button variant="outline" size="sm" className="press min-h-9 gap-1.5" onClick={() => sp.reset()}>
                <RefreshCw className="h-3.5 w-3.5" /> {t('clearFilters')}
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<Contact2 className="h-10 w-10" />}
            title={t('custEmpty')}
            hint={t('custEmptyHint')}
            action={
              <Button size="sm" className="press min-h-9 gap-1.5" onClick={openCreate}>
                <Plus className="h-4 w-4" /> {t('custNew')}
              </Button>
            }
          />
        )
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-xl border bg-card md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-3 font-semibold">{t('custName')}</th>
                  <th className="px-3 py-3 font-semibold">{t('custPhone')}</th>
                  <th className="px-3 py-3 font-semibold">{t('custEmail')}</th>
                  <th className="px-3 py-3 font-semibold text-right">{t('custTx')}</th>
                  <th className="px-3 py-3 font-semibold">{t('status')}</th>
                  <th className="px-5 py-3 text-right font-semibold">{t('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {data?.customers.map((c) => (
                  <tr key={c.id} className="border-b border-border/40 transition-colors last:border-0 hover:bg-muted/40">
                    <td className="cursor-pointer px-5 py-3" onClick={() => openDetail(c.id)}>
                      <p className="font-semibold text-foreground">{c.name}</p>
                      <p className="text-[11px] text-muted-foreground">{formatDateTime(c.createdAt)}</p>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-foreground/80">{c.phone ?? '—'}</td>
                    <td className="max-w-40 truncate px-3 py-3 text-xs text-foreground/70">{c.email ?? '—'}</td>
                    <td className="tabular px-3 py-3 text-right font-semibold">{c._count.transactions}</td>
                    <td className="px-3 py-3">
                      <CustomerStatusBadge c={c} labelActive={t('custActive')} labelSuspended={t('custSuspended')} />
                    </td>
                    <td className="px-5 py-2">
                      <RowActions
                        labels={actionLabels}
                        suspended={c.suspended}
                        onView={() => openDetail(c.id)}
                        onEdit={() => openEdit(c)}
                        onToggleSuspend={() => {
                          if (c.suspended) restore(c)
                          else { setSuspendReason(''); setSuspendTarget(c) }
                        }}
                        onDelete={() => setDeleteTarget(c)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="stagger grid gap-3 md:hidden">
            {data?.customers.map((c) => (
              <div key={c.id} className="hover-lift rounded-xl border bg-card p-4 shadow-brand">
                <div className="flex items-start justify-between gap-3">
                  <button className="min-w-0 flex-1 text-left" onClick={() => openDetail(c.id)}>
                    <p className="truncate text-sm font-bold text-foreground">{c.name}</p>
                    <p className="mt-0.5 font-mono text-xs text-muted-foreground">{c.phone ?? '—'}</p>
                  </button>
                  <CustomerStatusBadge c={c} labelActive={t('custActive')} labelSuspended={t('custSuspended')} />
                </div>
                <div className="mt-3 flex items-center justify-between gap-2 border-t pt-3">
                  <span className="text-xs text-muted-foreground">{t('custTx')}: <b className="text-foreground">{c._count.transactions}</b></span>
                  <RowActions
                    labels={actionLabels}
                    suspended={c.suspended}
                    onView={() => openDetail(c.id)}
                    onEdit={() => openEdit(c)}
                    onToggleSuspend={() => {
                      if (c.suspended) restore(c)
                      else { setSuspendReason(''); setSuspendTarget(c) }
                    }}
                    onDelete={() => setDeleteTarget(c)}
                  />
                </div>
              </div>
            ))}
          </div>

          <Pagination page={data?.page ?? page} pages={data?.pages ?? 1} total={data?.total ?? 0} />
        </>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? t('custEdit') : t('custNew')}</DialogTitle>
            <DialogDescription className="sr-only">{t('custTitle')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3.5">
            <div className="space-y-1.5">
              <Label htmlFor="cust-name">{t('custName')} *</Label>
              <Input
                id="cust-name" value={form.name} autoComplete="off"
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="grid gap-3.5 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cust-phone">{t('custPhone')}</Label>
                <Input
                  id="cust-phone" value={form.phone} inputMode="tel" autoComplete="off"
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cust-email">{t('custEmail')}</Label>
                <Input
                  id="cust-email" type="email" value={form.email} autoComplete="off"
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cust-notes">{t('custNotes')}</Label>
              <Textarea
                id="cust-notes" value={form.notes} rows={3}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="press min-h-10" onClick={() => setFormOpen(false)}>{t('cancel')}</Button>
            <Button className="press min-h-10" disabled={busy || !form.name.trim()} onClick={saveForm}>
              {editing ? t('saveChanges') : t('create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Suspend dialog — reason required */}
      <Dialog open={!!suspendTarget} onOpenChange={(o) => !o && setSuspendTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ban className="h-4 w-4 text-amber-600" /> {t('custSuspendTitle')}
            </DialogTitle>
            <DialogDescription>
              {suspendTarget?.name} — {t('custSuspendHint')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="cust-suspend-reason">{t('custSuspendReason')} *</Label>
            <Textarea
              id="cust-suspend-reason" value={suspendReason} rows={3}
              onChange={(e) => setSuspendReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" className="press min-h-10" onClick={() => setSuspendTarget(null)}>{t('cancel')}</Button>
            <Button
              variant="destructive" className="press min-h-10"
              disabled={busy || !suspendReason.trim()} onClick={confirmSuspend}
            >
              {t('custSuspendConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('custDeleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.name} — {t('custDeleteHint')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="press min-h-10">{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="press min-h-10 bg-destructive text-white hover:bg-destructive/90"
              disabled={deleteBusy}
              onClick={(e) => { e.preventDefault(); confirmDelete() }}
            >
              {t('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Detail dialog */}
      <Dialog open={!!detailId} onOpenChange={(o) => !o && setDetailId(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('custDetails')}</DialogTitle>
            <DialogDescription className="truncate">{detailCustomer?.name ?? ''}</DialogDescription>
          </DialogHeader>

          {detailLoading ? (
            <div className="space-y-2 py-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 rounded-lg" />)}
            </div>
          ) : detailError ? (
            <ErrorCard message={detailError} onRetry={() => detailId && openDetail(detailId)} />
          ) : detailCustomer ? (
            <div className="space-y-4">
              <section aria-label={t('custProfile')}>
                <DetailRow label={t('custName')} value={detailCustomer.name} />
                <DetailRow label={t('custPhone')} value={detailCustomer.phone ?? '—'} mono />
                <DetailRow label={t('custEmail')} value={detailCustomer.email ?? '—'} />
                <DetailRow label={t('custNotes')} value={detailCustomer.notes ?? '—'} />
                <DetailRow
                  label={t('status')}
                  value={
                    <CustomerStatusBadge c={detailCustomer} labelActive={t('custActive')} labelSuspended={t('custSuspended')} />
                  }
                />
                {detailCustomer.suspended && detailCustomer.suspendReason && (
                  <DetailRow label={t('custSuspendReason')} value={detailCustomer.suspendReason} />
                )}
                <DetailRow label={t('custAddedVia')} value={detailCustomer.insertedVia} mono />
                <DetailRow label={t('custSince')} value={formatDateTime(detailCustomer.createdAt)} />
              </section>

              <section aria-label={t('custRecentTx')}>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{t('custRecentTx')}</h3>
                  <span className="tabular rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
                    {detail?.counts.transactions ?? 0} {t('custTx').toLowerCase()}
                  </span>
                </div>
                {(detail?.transactions.length ?? 0) === 0 ? (
                  <p className="rounded-lg border border-dashed py-6 text-center text-xs text-muted-foreground">{t('custNever')}</p>
                ) : (
                  <div className="nice-scroll max-h-96 overflow-y-auto rounded-lg border">
                    <table className="w-full text-xs">
                      <tbody>
                        {detail?.transactions.map((tx) => (
                          <tr key={tx.id} className="border-b last:border-0">
                            <td className="px-3 py-2"><MfsBadge mfs={tx.mfs} /></td>
                            <td className="px-2 py-2 font-mono text-[11px] text-muted-foreground">{tx.trxId ?? '—'}</td>
                            <td className="tabular px-2 py-2 text-right font-semibold">{formatBDT(tx.amount)}</td>
                            <td className="px-2 py-2"><StatusBadge status={tx.status} /></td>
                            <td className="px-3 py-2 text-right text-[10px] text-muted-foreground">{formatDateTime(tx.occurredAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
