'use client'

import { useCallback, useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import {
  CreditCard, Plus, ExternalLink, MoreHorizontal, CheckCircle2, XCircle, Clock,
  Pencil, FileText, Trash2, RefreshCw, ReceiptText,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatBDT, formatDateTime, timeAgo } from '@/lib/format'
import { fetchApi } from '@/lib/api-client'
import { useUrlState } from '@/hooks/use-url-state'
import { PageHeader, StatCard, EmptyState, ErrorCard, MfsBadge, StatusBadge, SearchInput, Pagination, DetailRow, CopyButton } from './ui-bits'
import { useLang } from '@/lib/i18n'
import { GATEWAY_CATALOG } from '@/lib/gateways'
import { useMemo } from 'react'

interface CheckoutItem {
  id: string
  token: string
  title: string
  description: string | null
  customerId: string | null
  customer?: { id: string; name: string; phone: string | null } | null
  customerName: string | null
  customerPhone: string | null
  amount: number
  gatewayCode: string | null
  mfs: string
  note: string | null
  payToNumbers: string | null
  customFields: string | null
  answers: string | null
  successUrl: string | null
  status: string
  createdAt: string
  expiresAt: string | null
  paidAt: string | null
  paidTrxId: string | null
  store?: { id: string; name: string } | null
}

interface CheckoutSummary { pending: number; awaiting: number; paid: number; today: number; cancelled: number }

interface CfRow { name: string; label: string; required: boolean }

const STATUS_OPTIONS = ['ALL', 'PENDING', 'AWAITING', 'PAID', 'CANCELLED', 'EXPIRED']
const MFS_OPTIONS = ['ALL', 'ANY', 'BKASH', 'NAGAD', 'ROCKET', 'UPAY', 'BANK']

const EMPTY_FORM = {
  title: '', description: '', amount: '', customerName: '', customerPhone: '',
  gatewayCode: 'ANY', payToNumbers: '', expiresInHours: '24', note: '', successUrl: '',
}

/** Countdown chip: red when < 1h, neutral when farther, hidden when irrelevant. */
function ExpiryChip({ c, labels }: { c: CheckoutItem; labels: { left: string; expired: string; noExpiry: string } }) {
  if (c.status === 'PAID' || c.status === 'CANCELLED') return null
  if (!c.expiresAt) return <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground">{labels.noExpiry}</Badge>
  const ms = new Date(c.expiresAt).getTime() - Date.now()
  if (ms <= 0) return <Badge variant="outline" className="border-destructive/25 bg-destructive/10 text-[10px] text-destructive">{labels.expired}</Badge>
  const mins = Math.floor(ms / 60_000)
  const txt = mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`
  return (
    <Badge
      variant="outline"
      className={cn('text-[10px]', mins < 60
        ? 'border-destructive/40 bg-destructive/10 text-destructive'
        : 'border-warning/30 bg-warning/10 text-amber-700 dark:text-amber-400')}
    >
      <Clock className="mr-0.5 h-3 w-3" /> {txt} {labels.left}
    </Badge>
  )
}

export function CheckoutsView() {
  const { t } = useLang()
  const { get, getNum, set } = useUrlState()
  const page = getNum('page', 1)
  const status = get('status', 'ALL')
  const mfs = get('mfs', 'ALL')

  const [items, setItems] = useState<CheckoutItem[]>([])
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [summary, setSummary] = useState<CheckoutSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  // create / edit dialog
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<CheckoutItem | null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [cfRows, setCfRows] = useState<CfRow[]>([])
  const [busy, setBusy] = useState(false)

  const [detail, setDetail] = useState<CheckoutItem | null>(null)

  const load = useCallback(async (silent = false) => {
    if (!silent) setErr(null)
    try {
      const params = new URLSearchParams({ page: String(page) })
      if (status && status !== 'ALL') params.set('status', status)
      if (mfs && mfs !== 'ALL') params.set('mfs', mfs)
      const q = get('q')
      if (q) params.set('q', q)
      const [list, sum] = await Promise.all([
        fetchApi<{ items: CheckoutItem[]; total: number; pageSize: number }>(`/api/admin/checkouts?${params}`),
        fetchApi<CheckoutSummary>('/api/admin/checkouts?summary=1'),
      ])
      setItems(Array.isArray(list.items) ? list.items : [])
      setTotal(list.total ?? 0)
      setPages(Math.max(1, Math.ceil((list.total ?? 0) / (list.pageSize ?? 20))))
      setSummary(sum ?? null)
    } catch (e) {
      if (!silent) setErr(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [page, status, mfs, get])

  useEffect(() => {
    load()
    const iv = setInterval(() => load(true), 30_000)
    return () => clearInterval(iv)
  }, [load])

  function openCreate() {
    setEditing(null)
    setForm({ ...EMPTY_FORM })
    setCfRows([])
    setDialogOpen(true)
  }

  function openEdit(c: CheckoutItem) {
    setEditing(c)
    setForm({
      title: c.title,
      description: c.description ?? '',
      amount: String(c.amount),
      customerName: c.customerName ?? '',
      customerPhone: c.customerPhone ?? '',
      gatewayCode: c.gatewayCode ?? 'ANY',
      payToNumbers: (() => { try { return c.payToNumbers ? (JSON.parse(c.payToNumbers) as string[]).join(', ') : '' } catch { return '' } })(),
      expiresInHours: '',
      note: c.note ?? '',
      successUrl: c.successUrl ?? '',
    })
    setCfRows((() => {
      try { return c.customFields ? (JSON.parse(c.customFields) as CfRow[]) : [] } catch { return [] }
    })())
    setDialogOpen(true)
  }

  async function submit() {
    if (!form.title.trim()) { toast.error(t('titleRequired')); return }
    const amount = Number(form.amount)
    if (!Number.isFinite(amount) || amount <= 0) { toast.error(t('amountRequired')); return }
    setBusy(true)
    try {
      if (editing) {
        await fetchApi(`/api/admin/checkouts/${editing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: form.title,
            description: form.description,
            note: form.note,
            successUrl: form.successUrl,
            customFields: cfRows.filter((r) => r.name.trim()),
          }),
        })
        toast.success(t('checkoutUpdated'))
      } else {
        await fetchApi('/api/admin/checkouts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...form,
            amount,
            expiresInHours: form.expiresInHours || undefined,
            customFields: cfRows.filter((r) => r.name.trim()),
          }),
        })
        toast.success(t('checkoutCreated'))
      }
      setDialogOpen(false)
      load(true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  async function patch(c: CheckoutItem, body: Record<string, unknown>, successMsg?: string) {
    try {
      await fetchApi(`/api/admin/checkouts/${c.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (successMsg) toast.success(successMsg)
      load(true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    }
  }

  async function remove(c: CheckoutItem) {
    try {
      await fetchApi(`/api/admin/checkouts/${c.id}`, { method: 'DELETE' })
      toast.success(t('checkoutDeleted'))
      load(true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    }
  }

  const payLink = (token: string) =>
    typeof window !== 'undefined' ? `${window.location.origin}/pay/${token}` : `/pay/${token}`

  const groupedGateways = useMemo(() => {
    const pick = (cat: string) => GATEWAY_CATALOG.filter((g) => g.category === cat)
    return [
      { label: 'Mobile Financial Services', items: pick('MFS') },
      { label: 'Bank', items: pick('BANK') },
      { label: 'Global', items: pick('GLOBAL') },
    ].filter((g) => g.items.length > 0)
  }, [])

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('checkoutPages')}
        description={t('checkoutsSub')}
        icon={<CreditCard className="h-5 w-5" />}
        actions={
          <>
            <Button variant="outline" size="icon" className="h-9 w-9" aria-label={t('refresh')} onClick={() => load()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button onClick={openCreate} className="press gap-1.5">
              <Plus className="h-4 w-4" /> {t('newCheckout')}
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard loading={!summary && loading} label={t('statPending')} value={String(summary?.pending ?? 0)} icon={<ReceiptText className="h-4 w-4" />} />
        <StatCard
          loading={!summary && loading}
          label={t('coStatAwaiting')}
          value={String(summary?.awaiting ?? 0)}
          icon={<Clock className="h-4 w-4" />}
          tone="text-amber-600 bg-warning/15"
        />
        <StatCard
          loading={!summary && loading}
          label={t('statPaid')}
          value={String(summary?.paid ?? 0)}
          icon={<CheckCircle2 className="h-4 w-4" />}
          tone="text-success bg-success/10"
        />
        <StatCard
          loading={!summary && loading}
          label={t('statCancelled')}
          value={String(summary?.cancelled ?? 0)}
          icon={<XCircle className="h-4 w-4" />}
          tone="text-destructive bg-destructive/10"
        />
      </div>

      {/* URL-driven filters */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchInput paramKey="q" placeholder={t('search')} className="sm:w-64" />
        <Select value={status || 'ALL'} onValueChange={(v) => set({ status: v === 'ALL' ? null : v, page: null })}>
          <SelectTrigger className="h-9 w-full sm:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s === 'ALL' ? `${t('all')}` : s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={mfs || 'ALL'} onValueChange={(v) => set({ mfs: v === 'ALL' ? null : v, page: null })}>
          <SelectTrigger className="h-9 w-full sm:w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            {MFS_OPTIONS.map((m) => <SelectItem key={m} value={m}>{m === 'ALL' ? `${t('mfs')}: ${t('all')}` : m}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
      ) : err ? (
        <ErrorCard message={err} onRetry={() => load()} />
      ) : items.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={<CreditCard className="h-10 w-10" />}
              title={total > 0 ? t('noResults') : t('noCheckouts')}
              hint={total > 0 ? t('clearFilters') : t('noCheckoutsHint')}
              action={total === 0 ? (
                <Button onClick={openCreate} className="press gap-1.5">
                  <Plus className="h-4 w-4" /> {t('newCheckout')}
                </Button>
              ) : undefined}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2.5 stagger">
          {items.map((c) => (
            <Card key={c.id} className="hover-lift">
              <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setDetail(c)} aria-label={t('viewDetails')}>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-semibold text-foreground">{c.title}</p>
                    <MfsBadge mfs={c.mfs} />
                    <StatusBadge status={c.status} />
                    <ExpiryChip c={c} labels={{ left: t('left'), expired: t('expired'), noExpiry: t('noExpiry') }} />
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {c.customerName ?? '—'}{c.customerPhone ? ` · ${c.customerPhone}` : ''} · {t('created')} {timeAgo(c.createdAt)}
                  </p>
                </button>

                <p className="tabular shrink-0 text-lg font-bold text-foreground lg:w-32 lg:text-right">{formatBDT(c.amount)}</p>

                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  <a href={`/pay/${c.token}`} target="_blank" rel="noreferrer">
                    <Button size="sm" variant="outline" className="press h-9 gap-1.5">
                      <ExternalLink className="h-3.5 w-3.5" /> {t('openPage')}
                    </Button>
                  </a>
                  <CopyButton value={payLink(c.token)} label={t('copyLink')} compact className="h-9" />

                  {(c.status === 'PENDING' || c.status === 'AWAITING' || c.status === 'EXPIRED') && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-9 w-9" aria-label={t('actions')}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem onClick={() => patch(c, { markPaid: true }, t('markedPaid'))}>
                          <CheckCircle2 className="mr-2 h-4 w-4 text-success" /> {t('markPaid')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => patch(c, { extendHours: 24 }, t('extended'))}>
                          <Clock className="mr-2 h-4 w-4" /> {t('extend24h')}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => openEdit(c)}>
                          <Pencil className="mr-2 h-4 w-4" /> {t('edit')}
                        </DropdownMenuItem>
                        {c.answers && (
                          <DropdownMenuItem onClick={() => setDetail(c)}>
                            <FileText className="mr-2 h-4 w-4" /> {t('viewAnswers')}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => patch(c, { cancel: true }, t('cancelledToast'))}>
                          <XCircle className="mr-2 h-4 w-4" /> {t('cancel')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}

                  {(c.status === 'PAID' || c.status === 'CANCELLED') && (
                    <Button size="icon" variant="ghost" className="h-9 w-9" aria-label={t('viewDetails')} onClick={() => setDetail(c)}>
                      <FileText className="h-4 w-4" />
                    </Button>
                  )}

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="icon" variant="ghost" className="h-9 w-9 text-muted-foreground hover:text-destructive" aria-label={t('delete')}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t('deleteCheckoutTitle')}</AlertDialogTitle>
                        <AlertDialogDescription>{t('confirmDelete')}</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
                        <AlertDialogAction onClick={() => remove(c)} className="bg-destructive text-white hover:bg-destructive/90">
                          {t('delete')}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          ))}
          <Pagination page={page} pages={pages} total={total} />
        </div>
      )}

      {/* Create / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? t('editCheckout') : t('newCheckout')}</DialogTitle>
            {!editing && <DialogDescription>{t('customerHint')}</DialogDescription>}
          </DialogHeader>
          <div className="grid gap-3.5">
            <div className="space-y-1.5">
              <Label>{t('checkoutTitle')} *</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Order #INV-1101 — Chain Wallet" disabled={!!editing} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('description')}</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} disabled={!!editing} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t('amount')} (৳) *</Label>
                <Input type="number" min="1" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} disabled={!!editing} />
              </div>
              <div className="space-y-1.5">
                <Label>{t('gateway')}</Label>
                <Select value={form.gatewayCode || 'ANY'} onValueChange={(v) => setForm({ ...form, gatewayCode: v })} disabled={!!editing}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ANY">{t('gatewayAny')}</SelectItem>
                    {groupedGateways.map((group) => (
                      <SelectGroup key={group.label}>
                        <SelectLabel>{group.label}</SelectLabel>
                        {group.items.map((g) => (
                          <SelectItem key={g.code} value={g.code}>{g.name}</SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t('customerName')}</Label>
                <Input value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} disabled={!!editing} />
              </div>
              <div className="space-y-1.5">
                <Label>{t('customerPhone')}</Label>
                <Input value={form.customerPhone} onChange={(e) => setForm({ ...form, customerPhone: e.target.value })} placeholder="017…" disabled={!!editing} />
              </div>
            </div>
            {!editing && (
              <div className="space-y-1.5">
                <Label>{t('payToNumbers')}</Label>
                <Input value={form.payToNumbers} onChange={(e) => setForm({ ...form, payToNumbers: e.target.value })} placeholder="01711-000111, 01811-000222" />
                <p className="text-[11px] text-muted-foreground">{t('payToNumbersHint')}</p>
              </div>
            )}
            {!editing && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{t('expiresAt')} ({t('hours')})</Label>
                  <Input type="number" min="0" value={form.expiresInHours} onChange={(e) => setForm({ ...form, expiresInHours: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('note')}</Label>
                  <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>{t('successUrl')}</Label>
              <Input value={form.successUrl} onChange={(e) => setForm({ ...form, successUrl: e.target.value })} placeholder="https://yoursite.com/thank-you" />
            </div>

            {/* Custom fields builder */}
            <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs">{t('customFields')}</Label>
                <Button
                  type="button" size="sm" variant="outline"
                  className="press h-7 gap-1 px-2 text-[11px]"
                  onClick={() => setCfRows((r) => [...r, { name: '', label: '', required: false }])}
                >
                  <Plus className="h-3 w-3" /> {t('addField')}
                </Button>
              </div>
              {cfRows.length === 0 && <p className="text-[11px] text-muted-foreground/70">{t('noCustomFields')}</p>}
              {cfRows.map((row, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <Input
                    value={row.name} placeholder={t('fieldName')}
                    onChange={(e) => setCfRows((r) => r.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                    className="h-9 w-28 flex-none sm:w-32"
                  />
                  <Input
                    value={row.label} placeholder={t('fieldLabel')}
                    onChange={(e) => setCfRows((r) => r.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                    className="h-9 min-w-0 flex-1"
                  />
                  <label className="flex h-9 shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Checkbox
                      checked={row.required}
                      onCheckedChange={(v) => setCfRows((r) => r.map((x, j) => (j === i ? { ...x, required: v === true } : x)))}
                    />
                    {t('fieldRequired')}
                  </label>
                  <Button
                    type="button" size="icon" variant="ghost"
                    className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                    aria-label={t('delete')}
                    onClick={() => setCfRows((r) => r.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('cancel')}</Button>
            <Button onClick={submit} disabled={busy}>{editing ? t('save') : t('create')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail dialog */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="truncate pr-6">{detail?.title}</DialogTitle>
            <DialogDescription>
              {detail && <StatusBadge status={detail.status} className="mr-2" />}
              {detail?.store?.name}
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="space-y-3">
              <div>
                <DetailRow label={t('amount')} value={formatBDT(detail.amount)} />
                <DetailRow label={t('customer')} value={`${detail.customerName ?? '—'}${detail.customerPhone ? ` · ${detail.customerPhone}` : ''}`} />
                {detail.customer?.id && <DetailRow label="Customer ID" value={detail.customer.id} mono />}
                <DetailRow label={t('gateway')} value={detail.gatewayCode ?? t('gatewayAny')} />
                <DetailRow label={t('token')} value={detail.token} mono />
                <DetailRow label={t('created')} value={formatDateTime(detail.createdAt)} />
                <DetailRow label={t('expiresAt')} value={detail.expiresAt ? formatDateTime(detail.expiresAt) : t('noExpiry')} />
                <DetailRow label={t('paidAt')} value={detail.paidAt ? formatDateTime(detail.paidAt) : '—'} />
                {detail.paidTrxId && <DetailRow label={t('paidTrxId')} value={detail.paidTrxId} mono />}
                {detail.note && <DetailRow label={t('note')} value={detail.note} />}
                {detail.successUrl && <DetailRow label={t('successUrl')} value={detail.successUrl} mono />}
                {detail.payToNumbers && (
                  <DetailRow label={t('payToNumbers')} value={(() => {
                    try { return (JSON.parse(detail.payToNumbers ?? '[]') as string[]).join(', ') } catch { return detail.payToNumbers ?? '' }
                  })()} />
                )}
              </div>
              {detail.answers ? (
                <div>
                  <p className="mb-1.5 text-xs font-semibold text-foreground">{t('answers')}</p>
                  <pre className="max-h-56 overflow-y-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs leading-relaxed">
                    {(() => { try { return JSON.stringify(JSON.parse(detail.answers), null, 2) } catch { return detail.answers } })()}
                  </pre>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">{t('noAnswers')}</p>
              )}
            </div>
          )}
          <DialogFooter>
            {detail && <CopyButton value={payLink(detail.token)} label={t('copyLink')} />}
            <Button variant="outline" onClick={() => setDetail(null)}>{t('close')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
