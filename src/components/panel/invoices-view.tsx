'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  FileText, Plus, Download, ExternalLink, Pencil, Trash2, Printer, Send, CheckCircle2, Ban,
  Wallet, AlertTriangle, CalendarClock,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Card } from '@/components/ui/card'
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
import { fetchApi } from '@/lib/api-client'
import { formatBDT, formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useUrlState } from '@/hooks/use-url-state'
import { useLang } from '@/lib/i18n'
import {
  PageHeader, StatCard, EmptyState, ErrorCard, Pagination, SearchInput, CopyButton, DetailRow,
} from './ui-bits'

// ── Types ────────────────────────────────────────────────────────────────────

interface ItemRow {
  id: string
  description: string
  quantity: number
  unitPrice: number
  total: number
}

interface InvoiceRow {
  id: string
  number: string
  token: string
  title: string
  status: string
  customerId: string | null
  customerName: string | null
  customerPhone: string | null
  subtotal: number
  discount: number
  tax: number
  shipping: number
  total: number
  currency: string
  dueDate: string | null
  notes: string | null
  publicNote: string | null
  paidAt: string | null
  createdAt: string
  updatedAt: string
  items: ItemRow[]
}

interface ListData {
  invoices: InvoiceRow[]
  total: number
  page: number
  pages: number
}

interface SummaryData {
  summary: { outstanding: number; paidThisMonth: number; overdue: number }
}

interface CustomerOpt {
  id: string
  name: string
  phone: string | null
  email: string | null
}

interface FormItem {
  description: string
  quantity: string
  unitPrice: string
}

interface InvoiceForm {
  title: string
  customerName: string
  customerPhone: string
  customerId: string
  items: FormItem[]
  discount: string
  tax: string
  shipping: string
  dueDate: string
  notes: string
  publicNote: string
  send: boolean
}

function isListData(d: unknown): d is ListData {
  if (!d || typeof d !== 'object') return false
  const o = d as Partial<ListData>
  return Array.isArray(o.invoices) && typeof o.total === 'number' && typeof o.page === 'number' && typeof o.pages === 'number'
}

function isSummaryData(d: unknown): d is SummaryData {
  if (!d || typeof d !== 'object') return false
  const s = (d as Partial<SummaryData>).summary
  return !!s && typeof s.outstanding === 'number' && typeof s.paidThisMonth === 'number' && typeof s.overdue === 'number'
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const round2 = (n: number) => Math.round(n * 100) / 100

function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return '—'
  const date = typeof d === 'string' ? new Date(d) : d
  if (isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(date)
}

function toDateInput(d: string | null): string {
  if (!d) return ''
  const date = new Date(d)
  if (isNaN(date.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`
}

const INV_TONE: Record<string, string> = {
  DRAFT: 'border-border bg-muted text-muted-foreground',
  SENT: 'border-primary/25 bg-primary/10 text-primary',
  AWAITING: 'border-warning/30 bg-warning/15 text-amber-700 dark:text-amber-400',
  PAID: 'border-success/20 bg-success/10 text-success',
  OVERDUE: 'border-destructive/25 bg-destructive/10 text-destructive',
  CANCELLED: 'border-border bg-muted text-muted-foreground/70',
  REFUNDED: 'border-warning/30 bg-warning/10 text-amber-700 dark:text-amber-400',
}

const CLOSED_STATUSES = ['PAID', 'CANCELLED', 'REFUNDED']

const EMPTY_FORM: InvoiceForm = {
  title: '',
  customerName: '',
  customerPhone: '',
  customerId: '',
  items: [{ description: '', quantity: '1', unitPrice: '' }],
  discount: '',
  tax: '',
  shipping: '',
  dueDate: '',
  notes: '',
  publicNote: '',
  send: false,
}

/** Print-only invoice document (visible via body.printing-invoice @media print rules). */
function PrintDoc({ inv, t }: { inv: InvoiceRow; t: (k: string) => string }) {
  const stKey = `st${inv.status.charAt(0)}${inv.status.slice(1).toLowerCase()}`
  return (
    <div className="p-8 text-black">
      <div className="flex items-start justify-between border-b border-gray-300 pb-4">
        <div>
          <p className="text-xl font-extrabold">Invokeil Pay</p>
          <p className="mt-0.5 font-mono text-xs text-gray-500">{inv.number}</p>
          <p className="mt-1 text-xs font-semibold">{t(stKey)}</p>
        </div>
        <div className="text-right text-xs text-gray-600">
          <p>{t('invIssued')}: {fmtDate(inv.createdAt)}</p>
          <p>{t('invDueDate')}: {inv.dueDate ? fmtDate(inv.dueDate) : '—'}</p>
          {inv.paidAt && <p>{t('invPaidOn')}: {fmtDate(inv.paidAt)}</p>}
        </div>
      </div>
      {inv.customerName && (
        <p className="mt-3 text-sm">
          <span className="font-semibold">{t('invBillTo')}:</span> {inv.customerName}
          {inv.customerPhone ? ` · ${inv.customerPhone}` : ''}
        </p>
      )}
      <h2 className="mt-2 text-base font-bold">{inv.title}</h2>
      <table className="mt-3 w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-gray-300 text-left">
            <th className="py-1.5">{t('ipubDesc')}</th>
            <th className="py-1.5 text-right">{t('ipubQty')}</th>
            <th className="py-1.5 text-right">{t('ipubUnitPrice')}</th>
            <th className="py-1.5 text-right">{t('invLineTotal')}</th>
          </tr>
        </thead>
        <tbody>
          {inv.items.map((it) => (
            <tr key={it.id} className="border-b border-gray-200">
              <td className="py-1.5">{it.description}</td>
              <td className="py-1.5 text-right tabular">{it.quantity}</td>
              <td className="py-1.5 text-right tabular">{formatBDT(it.unitPrice, false)}</td>
              <td className="py-1.5 text-right tabular font-semibold">{formatBDT(it.total, false)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="ml-auto mt-3 w-56 space-y-1 text-xs">
        <div className="flex justify-between"><span>{t('invSubtotal')}</span><span className="tabular font-semibold">{formatBDT(inv.subtotal, false)}</span></div>
        {inv.discount > 0 && <div className="flex justify-between"><span>{t('invDiscount')}</span><span className="tabular">−{formatBDT(inv.discount, false)}</span></div>}
        {inv.tax > 0 && <div className="flex justify-between"><span>{t('invTax')}</span><span className="tabular">+{formatBDT(inv.tax, false)}</span></div>}
        {inv.shipping > 0 && <div className="flex justify-between"><span>{t('invShipping')}</span><span className="tabular">+{formatBDT(inv.shipping, false)}</span></div>}
        <div className="flex justify-between border-t border-gray-300 pt-1.5 text-sm font-bold"><span>{t('invTotal')}</span><span className="tabular">{formatBDT(inv.total, false)}</span></div>
      </div>
      {inv.publicNote && <p className="mt-3 text-xs text-gray-600">{t('ipubNote')}: {inv.publicNote}</p>}
    </div>
  )
}

// ── View ─────────────────────────────────────────────────────────────────────

export function InvoicesView() {
  const { t } = useLang()
  const { get, getNum, set } = useUrlState()

  const q = get('q')
  const status = get('status', 'ALL')
  const page = getNum('page', 1)

  const [data, setData] = useState<ListData | null>(null)
  const [summary, setSummary] = useState<SummaryData['summary'] | null>(null)
  const [customers, setCustomers] = useState<CustomerOpt[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // create / edit dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<InvoiceRow | null>(null)
  const [form, setForm] = useState<InvoiceForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  // detail dialog state
  const [viewing, setViewing] = useState<InvoiceRow | null>(null)

  // delete state
  const [deleting, setDeleting] = useState<InvoiceRow | null>(null)
  const [deletingBusy, setDeletingBusy] = useState(false)

  // print state
  const [printSheet, setPrintSheet] = useState<InvoiceRow | null>(null)

  const loadList = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(page) })
      if (q) params.set('q', q)
      if (status && status !== 'ALL') params.set('status', status)
      const d = await fetchApi<unknown>(`/api/admin/invoices?${params.toString()}`)
      if (!isListData(d)) throw new Error('Unexpected response from server')
      setError(null)
      setData(d)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [page, q, status])

  const loadSummary = useCallback(async () => {
    try {
      const d = await fetchApi<unknown>('/api/admin/invoices?summary=1')
      if (isSummaryData(d)) setSummary(d.summary)
    } catch { /* stat cards stay stale — non-fatal */ }
  }, [])

  const loadCustomers = useCallback(async () => {
    try {
      const d = await fetchApi<unknown>('/api/admin/invoices?customers=1')
      if (d && typeof d === 'object' && Array.isArray((d as { customers?: unknown }).customers)) {
        setCustomers((d as { customers: CustomerOpt[] }).customers)
      }
    } catch { /* datalist stays empty — non-fatal */ }
  }, [])

  useEffect(() => {
    loadList()
  }, [loadList])

  useEffect(() => {
    loadSummary()
  }, [loadSummary])

  useEffect(() => {
    loadCustomers()
  }, [loadCustomers])

  // ── Print plumbing: body class + print CSS trigger window.print() ──
  useEffect(() => {
    if (!printSheet) return
    document.body.classList.add('printing-invoice')
    const timer = window.setTimeout(() => window.print(), 80)
    const after = () => {
      document.body.classList.remove('printing-invoice')
      setPrintSheet(null)
    }
    window.addEventListener('afterprint', after)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('afterprint', after)
      document.body.classList.remove('printing-invoice')
    }
  }, [printSheet])

  // ── Form helpers ──

  const patchForm = (patch: Partial<InvoiceForm>) => setForm((f) => ({ ...f, ...patch }))

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setDialogOpen(true)
  }

  const openEdit = (inv: InvoiceRow) => {
    setEditing(inv)
    setForm({
      title: inv.title,
      customerName: inv.customerName ?? '',
      customerPhone: inv.customerPhone ?? '',
      customerId: inv.customerId ?? '',
      items: inv.items.length > 0
        ? inv.items.map((it) => ({ description: it.description, quantity: String(it.quantity), unitPrice: String(it.unitPrice) }))
        : [{ description: '', quantity: '1', unitPrice: '' }],
      discount: inv.discount ? String(inv.discount) : '',
      tax: inv.tax ? String(inv.tax) : '',
      shipping: inv.shipping ? String(inv.shipping) : '',
      dueDate: toDateInput(inv.dueDate),
      notes: inv.notes ?? '',
      publicNote: inv.publicNote ?? '',
      send: false,
    })
    setDialogOpen(true)
  }

  const onPhoneChange = (phone: string) => {
    const match = customers.find((c) => c.phone && c.phone === phone.trim())
    setForm((f) => ({
      ...f,
      customerPhone: phone,
      customerId: match?.id ?? '',
      customerName: match ? match.name : f.customerName,
    }))
  }

  const addItem = () => patchForm({ items: [...form.items, { description: '', quantity: '1', unitPrice: '' }] })

  const patchItem = (i: number, patch: Partial<FormItem>) => {
    const items = [...form.items]
    items[i] = { ...items[i], ...patch }
    patchForm({ items })
  }

  const removeItem = (i: number) => patchForm({ items: form.items.filter((_, j) => j !== i) })

  const liveTotals = useMemo(() => {
    const subtotal = round2(form.items.reduce(
      (s, it) => s + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0), 0,
    ))
    const discount = Number(form.discount) || 0
    const tax = Number(form.tax) || 0
    const shipping = Number(form.shipping) || 0
    return { subtotal, discount, tax, shipping, total: round2(subtotal - discount + tax + shipping) }
  }, [form.items, form.discount, form.tax, form.shipping])

  const validate = (): string | null => {
    if (!form.title.trim()) return t('invErrTitle')
    if (!form.items.some((it) => it.description.trim())) return t('invErrItems')
    for (const it of form.items) {
      if (!it.description.trim()) continue
      const qty = Number(it.quantity)
      if (!Number.isFinite(qty) || qty <= 0) return t('invErrQty')
      const price = Number(it.unitPrice)
      if (!Number.isFinite(price) || price < 0) return t('invErrPrice')
    }
    for (const v of [form.discount, form.tax, form.shipping]) {
      const n = Number(v)
      if (v.trim() && (!Number.isFinite(n) || n < 0)) return t('invErrAdj')
    }
    return null
  }

  const submit = async () => {
    const err = validate()
    if (err) {
      toast.error(err)
      return
    }
    setSaving(true)
    const items = form.items
      .filter((it) => it.description.trim())
      .map((it) => ({
        description: it.description.trim(),
        quantity: Number(it.quantity),
        unitPrice: Number(it.unitPrice),
      }))
    try {
      if (editing) {
        await fetchApi(`/api/admin/invoices/${editing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: form.title.trim(),
            customerName: form.customerName.trim() || null,
            customerPhone: form.customerPhone.trim() || null,
            customerId: form.customerId || null,
            items,
            discount: Number(form.discount) || 0,
            tax: Number(form.tax) || 0,
            shipping: Number(form.shipping) || 0,
            dueDate: form.dueDate || null,
            notes: form.notes.trim() || null,
            publicNote: form.publicNote.trim() || null,
          }),
        })
        toast.success(t('invUpdatedToast'))
      } else {
        await fetchApi('/api/admin/invoices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: form.title.trim(),
            customerName: form.customerName.trim() || null,
            customerPhone: form.customerPhone.trim() || null,
            customerId: form.customerId || null,
            items,
            discount: Number(form.discount) || 0,
            tax: Number(form.tax) || 0,
            shipping: Number(form.shipping) || 0,
            dueDate: form.dueDate || null,
            notes: form.notes.trim() || null,
            publicNote: form.publicNote.trim() || null,
            send: form.send,
          }),
        })
        toast.success(form.send ? t('invCreatedSentToast') : t('invCreatedToast'))
      }
      setDialogOpen(false)
      await Promise.all([loadList(), loadSummary()])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setSaving(false)
    }
  }

  // ── Row actions ──

  const setStatus = async (inv: InvoiceRow, next: string) => {
    try {
      await fetchApi(`/api/admin/invoices/${inv.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      })
      toast.success(
        next === 'PAID' ? t('invMarkedPaidToast')
          : next === 'SENT' ? t('invMarkedSentToast')
            : next === 'CANCELLED' ? t('invCancelledToast')
              : t('invUpdatedToast'),
      )
      setViewing(null)
      await Promise.all([loadList(), loadSummary()])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Request failed')
    }
  }

  const remove = async () => {
    if (!deleting) return
    setDeletingBusy(true)
    try {
      await fetchApi(`/api/admin/invoices/${deleting.id}`, { method: 'DELETE' })
      toast.success(t('invDeletedToast'))
      setDeleting(null)
      setViewing(null)
      const lastPage = data && data.pages > 1 && data.invoices.length === 1 ? data.pages - 1 : page
      if (lastPage !== page) set({ page: lastPage })
      else await Promise.all([loadList(), loadSummary()])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setDeletingBusy(false)
    }
  }

  const exportCsv = () => {
    if (!data || data.invoices.length === 0) {
      toast.error(t('noResults'))
      return
    }
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`
    const lines = ['number,customer,status,total,dueDate,createdAt']
    for (const inv of data.invoices) {
      lines.push([
        esc(inv.number),
        esc(inv.customerName ?? ''),
        esc(inv.status),
        inv.total.toFixed(2),
        esc(inv.dueDate ? new Date(inv.dueDate).toISOString().slice(0, 10) : ''),
        esc(new Date(inv.createdAt).toISOString()),
      ].join(','))
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `invoices-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success(t('invCsvDone'))
  }

  const publicUrl = (token: string) => `${typeof window !== 'undefined' ? window.location.origin : ''}/invoice/${token}`

  const statusBadge = (s: string) => {
    const stKey = `st${s.charAt(0)}${s.slice(1).toLowerCase()}`
    return (
      <span className={cn('inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-semibold', INV_TONE[s] ?? INV_TONE.DRAFT)}>
        <span className={cn(
          'h-1.5 w-1.5 rounded-full',
          s === 'PAID' ? 'bg-success'
            : s === 'OVERDUE' ? 'bg-destructive'
              : s === 'SENT' || s === 'AWAITING' ? 'bg-primary' : 'bg-muted-foreground/50',
        )} />
        {t(stKey)}
      </span>
    )
  }

  const dueCell = (inv: InvoiceRow) => {
    if (!inv.dueDate) return <span className="text-muted-foreground/60">—</span>
    const past = new Date(inv.dueDate) < new Date() && !CLOSED_STATUSES.includes(inv.status)
    return (
      <span className={cn('inline-flex items-center gap-1', past && 'font-semibold text-destructive')}>
        <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
        {fmtDate(inv.dueDate)}
      </span>
    )
  }

  const actionButtons = (inv: InvoiceRow) => (
    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <CopyButton value={publicUrl(inv.token)} compact className="px-1.5" />
      <Button
        variant="ghost" size="icon" className="press h-7 w-7"
        title={t('invOpenPage')} aria-label={t('invOpenPage')}
        onClick={() => window.open(`/invoice/${inv.token}`, '_blank', 'noopener')}
      >
        <ExternalLink className="h-3.5 w-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="press h-7 w-7" title={t('edit')} aria-label={t('edit')} onClick={() => openEdit(inv)}>
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost" size="icon" className="press h-7 w-7 text-destructive hover:text-destructive"
        title={t('delete')} aria-label={t('delete')} onClick={() => setDeleting(inv)}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  )

  // ── Render ──

  return (
    <div>
      {/* Print-only sheet + rules */}
      <style>{`
        #inv-print-sheet { display: none; }
        @media print {
          body.printing-invoice * { visibility: hidden !important; }
          body.printing-invoice #inv-print-sheet { display: block !important; position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important; background: #fff !important; }
          body.printing-invoice #inv-print-sheet, body.printing-invoice #inv-print-sheet * { visibility: visible !important; }
        }
      `}</style>
      {printSheet && <div id="inv-print-sheet"><PrintDoc inv={printSheet} t={t} /></div>}

      <PageHeader
        title={t('invoices')}
        description={t('invDesc')}
        icon={<FileText className="h-5 w-5" />}
        actions={
          <>
            <Button variant="outline" onClick={exportCsv} className="press gap-1.5">
              <Download className="h-4 w-4" /> {t('export')}
            </Button>
            <Button onClick={openCreate} className="press gap-1.5">
              <Plus className="h-4 w-4" /> {t('invNew')}
            </Button>
          </>
        }
      />

      {/* Stat cards */}
      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label={t('invStatOutstanding')}
          value={summary ? formatBDT(summary.outstanding) : '—'}
          icon={<Wallet className="h-5 w-5" />}
          tone="text-warning bg-warning/10"
          loading={!summary}
        />
        <StatCard
          label={t('invStatPaidMonth')}
          value={summary ? formatBDT(summary.paidThisMonth) : '—'}
          icon={<CheckCircle2 className="h-5 w-5" />}
          tone="text-success bg-success/10"
          loading={!summary}
        />
        <StatCard
          label={t('invStatOverdue')}
          value={summary ? String(summary.overdue) : '—'}
          icon={<AlertTriangle className="h-5 w-5" />}
          tone="text-destructive bg-destructive/10"
          loading={!summary}
        />
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchInput paramKey="q" placeholder={t('invSearch')} className="sm:max-w-xs" />
        <Select
          value={status}
          onValueChange={(v) => set({ status: v === 'ALL' ? null : v, page: 1 })}
        >
          <SelectTrigger className="h-9 w-full sm:w-44" aria-label={t('status')}>
            <SelectValue placeholder={t('status')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('all')}</SelectItem>
            <SelectItem value="DRAFT">{t('stDraft')}</SelectItem>
            <SelectItem value="SENT">{t('stSent')}</SelectItem>
            <SelectItem value="AWAITING">{t('stAwaiting')}</SelectItem>
            <SelectItem value="PAID">{t('stPaid')}</SelectItem>
            <SelectItem value="OVERDUE">{t('stOverdue')}</SelectItem>
            <SelectItem value="CANCELLED">{t('stCancelled')}</SelectItem>
            <SelectItem value="REFUNDED">{t('stRefunded')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Content */}
      {error && !data ? (
        <ErrorCard message={error} onRetry={() => { setLoading(true); loadList() }} />
      ) : loading && !data ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      ) : !data || data.invoices.length === 0 ? (
        <Card className="border-dashed p-2 shadow-brand">
          {q || status !== 'ALL' ? (
            <EmptyState
              icon={<FileText className="h-7 w-7" />}
              title={t('noResults')}
              action={
                <Button variant="outline" size="sm" className="press" onClick={() => set({ q: null, status: null, page: 1 })}>
                  {t('clearFilters')}
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={<FileText className="h-7 w-7" />}
              title={t('invEmptyTitle')}
              hint={t('invEmptyHint')}
              action={
                <Button onClick={openCreate} className="press gap-1.5">
                  <Plus className="h-4 w-4" /> {t('invEmptyCta')}
                </Button>
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
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('invColNumber')}</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('invColCustomer')}</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('invColTotal')}</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('status')}</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('invDueDate')}</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('created')}</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('actions')}</th>
                  </tr>
                </thead>
                <tbody className="stagger">
                  {data.invoices.map((inv) => (
                    <tr
                      key={inv.id}
                      className="press cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/40"
                      onClick={() => setViewing(inv)}
                    >
                      <td className="max-w-xs px-4 py-3">
                        <p className="truncate font-mono font-semibold text-foreground">{inv.number}</p>
                        <p className="truncate text-xs text-muted-foreground">{inv.title}</p>
                      </td>
                      <td className="max-w-40 px-4 py-3">
                        <p className="truncate font-medium text-foreground">{inv.customerName ?? '—'}</p>
                        {inv.customerPhone && <p className="truncate text-xs text-muted-foreground">{inv.customerPhone}</p>}
                      </td>
                      <td className="px-4 py-3 tabular font-semibold text-foreground">{formatBDT(inv.total)}</td>
                      <td className="px-4 py-3">{statusBadge(inv.status)}</td>
                      <td className="px-4 py-3 text-xs text-foreground/80">{dueCell(inv)}</td>
                      <td className="px-4 py-3 text-xs text-foreground/80">{fmtDate(inv.createdAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end">{actionButtons(inv)}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Mobile cards */}
          <div className="stagger space-y-3 md:hidden">
            {data.invoices.map((inv) => (
              <Card
                key={inv.id}
                className="press cursor-pointer p-4 shadow-brand transition-colors hover:bg-muted/40"
                onClick={() => setViewing(inv)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-mono font-semibold text-foreground">{inv.number}</p>
                    <p className="truncate text-xs text-muted-foreground">{inv.title}</p>
                  </div>
                  {statusBadge(inv.status)}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-muted-foreground">{t('invColCustomer')}</p>
                    <p className="truncate font-semibold text-foreground">{inv.customerName ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">{t('invColTotal')}</p>
                    <p className="tabular font-semibold text-foreground">{formatBDT(inv.total)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">{t('invDueDate')}</p>
                    <p className="text-foreground/80">{dueCell(inv)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">{t('created')}</p>
                    <p className="text-foreground/80">{fmtDate(inv.createdAt)}</p>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between border-t pt-3" onClick={(e) => e.stopPropagation()}>
                  <CopyButton value={publicUrl(inv.token)} compact label={t('invCopyLink')} />
                  {actionButtons(inv)}
                </div>
              </Card>
            ))}
          </div>

          <Pagination page={data.page} pages={data.pages} total={data.total} />
        </>
      )}

      {/* Create / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="nice-scroll max-h-[92vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? t('invEditTitle') : t('invCreateTitle')}</DialogTitle>
            <DialogDescription className="sr-only">{t('invDesc')}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="inv-title">{t('invTitleLabel')} *</Label>
              <Input
                id="inv-title"
                value={form.title}
                onChange={(e) => patchForm({ title: e.target.value })}
                placeholder={t('invTitlePh')}
                autoFocus
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="inv-cust-name">{t('invCustName')}</Label>
                <Input
                  id="inv-cust-name"
                  value={form.customerName}
                  onChange={(e) => patchForm({ customerName: e.target.value })}
                  placeholder={t('invCustNamePh')}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="inv-cust-phone">{t('invCustPhone')}</Label>
                <Input
                  id="inv-cust-phone"
                  list="inv-customer-phones"
                  value={form.customerPhone}
                  onChange={(e) => onPhoneChange(e.target.value)}
                  placeholder={t('invCustPhonePh')}
                  className="tabular"
                />
                <datalist id="inv-customer-phones">
                  {customers.filter((c) => c.phone).map((c) => (
                    <option key={c.id} value={c.phone ?? ''}>{c.name}</option>
                  ))}
                </datalist>
                <p className="text-[11px] text-muted-foreground">{t('invCustDatalistHint')}</p>
              </div>
            </div>

            {/* Line items editor */}
            <div className="grid gap-1.5">
              <div className="flex items-center justify-between">
                <Label>{t('invItemsSection')} *</Label>
                <Button
                  type="button" variant="outline" size="sm"
                  className="press h-7 gap-1 text-xs"
                  onClick={addItem}
                >
                  <Plus className="h-3 w-3" /> {t('invAddItem')}
                </Button>
              </div>
              <div className="space-y-2">
                {form.items.map((it, i) => {
                  const line = round2((Number(it.quantity) || 0) * (Number(it.unitPrice) || 0))
                  return (
                    <div key={i} className="rounded-lg border p-2.5">
                      <div className="flex items-center gap-2">
                        <Input
                          value={it.description}
                          onChange={(e) => patchItem(i, { description: e.target.value })}
                          placeholder={t('invItemDescPh')}
                          className="h-8 text-xs"
                          aria-label={t('invItemDescPh')}
                        />
                        <Button
                          type="button" variant="ghost" size="icon"
                          className="press h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                          aria-label={t('invRemoveItem')}
                          onClick={() => removeItem(i)}
                          disabled={form.items.length === 1}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <div className="mt-2 grid grid-cols-3 items-end gap-2">
                        <div className="grid gap-1">
                          <Label className="text-[10px] font-medium text-muted-foreground">{t('invQty')}</Label>
                          <Input
                            type="number" min="0" step="any" inputMode="decimal"
                            value={it.quantity}
                            onChange={(e) => patchItem(i, { quantity: e.target.value })}
                            className="h-8 text-xs tabular"
                            aria-label={t('invQty')}
                          />
                        </div>
                        <div className="grid gap-1">
                          <Label className="text-[10px] font-medium text-muted-foreground">{t('invUnitPrice')}</Label>
                          <Input
                            type="number" min="0" step="0.01" inputMode="decimal"
                            value={it.unitPrice}
                            onChange={(e) => patchItem(i, { unitPrice: e.target.value })}
                            className="h-8 text-xs tabular"
                            aria-label={t('invUnitPrice')}
                          />
                        </div>
                        <div className="pb-1.5 text-right">
                          <p className="text-[10px] font-medium text-muted-foreground">{t('invLineTotal')}</p>
                          <p className="tabular text-sm font-semibold text-foreground">{formatBDT(line, false)}</p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Adjustments */}
            <div className="grid grid-cols-3 gap-2">
              <div className="grid gap-1.5">
                <Label htmlFor="inv-discount">{t('invDiscount')}</Label>
                <Input
                  id="inv-discount"
                  type="number" min="0" step="0.01" inputMode="decimal"
                  value={form.discount}
                  onChange={(e) => patchForm({ discount: e.target.value })}
                  className="tabular"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="inv-tax">{t('invTax')}</Label>
                <Input
                  id="inv-tax"
                  type="number" min="0" step="0.01" inputMode="decimal"
                  value={form.tax}
                  onChange={(e) => patchForm({ tax: e.target.value })}
                  className="tabular"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="inv-shipping">{t('invShipping')}</Label>
                <Input
                  id="inv-shipping"
                  type="number" min="0" step="0.01" inputMode="decimal"
                  value={form.shipping}
                  onChange={(e) => patchForm({ shipping: e.target.value })}
                  className="tabular"
                />
              </div>
            </div>

            {/* Live totals */}
            <div className="ml-auto w-full max-w-56 space-y-1 rounded-lg bg-muted/50 p-3 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('invSubtotal')}</span>
                <span className="tabular font-semibold text-foreground">{formatBDT(liveTotals.subtotal, false)}</span>
              </div>
              {liveTotals.discount > 0 && (
                <div className="flex justify-between text-success">
                  <span>{t('invDiscount')}</span>
                  <span className="tabular font-semibold">−{formatBDT(liveTotals.discount, false)}</span>
                </div>
              )}
              {liveTotals.tax > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('invTax')}</span>
                  <span className="tabular font-semibold text-foreground">+{formatBDT(liveTotals.tax, false)}</span>
                </div>
              )}
              {liveTotals.shipping > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('invShipping')}</span>
                  <span className="tabular font-semibold text-foreground">+{formatBDT(liveTotals.shipping, false)}</span>
                </div>
              )}
              <div className="flex justify-between border-t pt-1.5 text-sm">
                <span className="font-bold text-foreground">{t('invTotal')}</span>
                <span className="tabular font-extrabold text-foreground">{formatBDT(liveTotals.total, false)}</span>
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="inv-due">{t('invDueDate')}</Label>
              <Input
                id="inv-due"
                type="date"
                value={form.dueDate}
                onChange={(e) => patchForm({ dueDate: e.target.value })}
                className="tabular sm:w-48"
              />
              <p className="text-[11px] text-muted-foreground">{t('invDueDateHint')}</p>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="inv-notes">{t('invNotes')}</Label>
              <Textarea
                id="inv-notes"
                value={form.notes}
                onChange={(e) => patchForm({ notes: e.target.value })}
                placeholder={t('invNotes')}
                rows={2}
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="inv-public-note">{t('invPublicNote')}</Label>
              <Textarea
                id="inv-public-note"
                value={form.publicNote}
                onChange={(e) => patchForm({ publicNote: e.target.value })}
                placeholder={t('invPublicNote')}
                rows={2}
              />
            </div>

            {!editing && (
              <div className="flex items-center justify-between rounded-xl border p-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">{t('invSendLabel')}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {form.send ? t('stSent') : t('stDraft')}
                  </p>
                </div>
                <Switch checked={form.send} onCheckedChange={(v) => patchForm({ send: v })} aria-label={t('invSendLabel')} />
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" className="press" onClick={() => setDialogOpen(false)} disabled={saving}>
              {t('cancel')}
            </Button>
            <Button className="press" onClick={submit} disabled={saving}>
              {saving ? t('invSaving') : editing ? t('saveChanges') : t('invCreateTitle')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail dialog */}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="nice-scroll max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{viewing ? `${viewing.number} — ${viewing.title}` : ''}</DialogTitle>
            <DialogDescription className="sr-only">{t('invDetailTitle')}</DialogDescription>
          </DialogHeader>

          {viewing && (
            <div className="grid gap-4">
              <div className="flex flex-wrap items-center gap-2">
                {statusBadge(viewing.status)}
                <CopyButton value={publicUrl(viewing.token)} compact label={t('invCopyLink')} />
                <Button
                  variant="outline" size="sm" className="press h-7 gap-1.5 text-xs"
                  onClick={() => window.open(`/invoice/${viewing.token}`, '_blank', 'noopener')}
                >
                  <ExternalLink className="h-3.5 w-3.5" /> {t('invOpenPage')}
                </Button>
                <span className="ml-auto font-mono text-[11px] text-muted-foreground">/invoice/{viewing.token}</span>
              </div>

              <div className="grid gap-x-6 sm:grid-cols-2">
                <DetailRow label={t('invBillTo')} value={viewing.customerName ?? '—'} />
                <DetailRow label={t('invCustPhone')} value={viewing.customerPhone ?? '—'} mono />
                <DetailRow label={t('invIssued')} value={fmtDate(viewing.createdAt)} />
                <DetailRow
                  label={t('invDueDate')}
                  value={viewing.dueDate
                    ? (new Date(viewing.dueDate) < new Date() && !CLOSED_STATUSES.includes(viewing.status)
                      ? <span className="text-destructive">{fmtDate(viewing.dueDate)}</span>
                      : fmtDate(viewing.dueDate))
                    : '—'}
                />
                {viewing.paidAt && <DetailRow label={t('invPaidOn')} value={<span className="text-success">{formatDateTime(viewing.paidAt)}</span>} />}
              </div>

              {/* Items */}
              <div className="grid gap-1.5">
                <Label>{t('invItemsSection')}</Label>
                <div className="overflow-hidden rounded-lg border">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/50 text-left">
                        <th className="px-3 py-2 font-semibold text-muted-foreground">{t('ipubDesc')}</th>
                        <th className="px-3 py-2 text-right font-semibold text-muted-foreground">{t('ipubQty')}</th>
                        <th className="px-3 py-2 text-right font-semibold text-muted-foreground">{t('ipubUnitPrice')}</th>
                        <th className="px-3 py-2 text-right font-semibold text-muted-foreground">{t('invLineTotal')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewing.items.map((it) => (
                        <tr key={it.id} className="border-b last:border-0">
                          <td className="px-3 py-2 font-medium text-foreground">{it.description}</td>
                          <td className="px-3 py-2 text-right tabular text-foreground/80">{it.quantity}</td>
                          <td className="px-3 py-2 text-right tabular text-foreground/80">{formatBDT(it.unitPrice, false)}</td>
                          <td className="px-3 py-2 text-right tabular font-semibold text-foreground">{formatBDT(it.total, false)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Totals breakdown */}
              <div className="ml-auto w-full max-w-56 space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('invSubtotal')}</span>
                  <span className="tabular font-semibold text-foreground">{formatBDT(viewing.subtotal, false)}</span>
                </div>
                {viewing.discount > 0 && (
                  <div className="flex justify-between text-success">
                    <span>{t('invDiscount')}</span>
                    <span className="tabular font-semibold">−{formatBDT(viewing.discount, false)}</span>
                  </div>
                )}
                {viewing.tax > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('invTax')}</span>
                    <span className="tabular font-semibold text-foreground">+{formatBDT(viewing.tax, false)}</span>
                  </div>
                )}
                {viewing.shipping > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('invShipping')}</span>
                    <span className="tabular font-semibold text-foreground">+{formatBDT(viewing.shipping, false)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t pt-1.5 text-sm">
                  <span className="font-bold text-foreground">{t('invTotal')}</span>
                  <span className="tabular font-extrabold text-foreground">{formatBDT(viewing.total)}</span>
                </div>
              </div>

              {viewing.notes && (
                <div className="rounded-lg bg-muted/50 p-3 text-xs">
                  <p className="font-semibold text-foreground">{t('invNotes')}</p>
                  <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{viewing.notes}</p>
                </div>
              )}
              {viewing.publicNote && (
                <div className="rounded-lg border p-3 text-xs">
                  <p className="font-semibold text-foreground">{t('invPublicNote')}</p>
                  <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{viewing.publicNote}</p>
                </div>
              )}

              {/* Status actions */}
              <div className="flex flex-wrap gap-2 border-t pt-3">
                {viewing.status === 'DRAFT' && (
                  <Button variant="outline" size="sm" className="press gap-1.5" onClick={() => setStatus(viewing, 'SENT')}>
                    <Send className="h-3.5 w-3.5" /> {t('invMarkSent')}
                  </Button>
                )}
                {['DRAFT', 'SENT', 'AWAITING', 'OVERDUE'].includes(viewing.status) && (
                  <Button size="sm" className="press gap-1.5 bg-success text-white hover:bg-success/90" onClick={() => setStatus(viewing, 'PAID')}>
                    <CheckCircle2 className="h-3.5 w-3.5" /> {t('invMarkPaid')}
                  </Button>
                )}
                {['DRAFT', 'SENT', 'AWAITING', 'OVERDUE'].includes(viewing.status) && (
                  <Button variant="outline" size="sm" className="press gap-1.5" onClick={() => setStatus(viewing, 'CANCELLED')}>
                    <Ban className="h-3.5 w-3.5" /> {t('invCancelInv')}
                  </Button>
                )}
                <Button variant="outline" size="sm" className="press gap-1.5" onClick={() => setPrintSheet(viewing)}>
                  <Printer className="h-3.5 w-3.5" /> {t('invPrint')}
                </Button>
                <Button
                  variant="outline" size="sm" className="press gap-1.5"
                  onClick={() => { setViewing(null); openEdit(viewing) }}
                >
                  <Pencil className="h-3.5 w-3.5" /> {t('edit')}
                </Button>
                <Button
                  variant="outline" size="sm" className="press gap-1.5 text-destructive hover:text-destructive"
                  onClick={() => setDeleting(viewing)}
                >
                  <Trash2 className="h-3.5 w-3.5" /> {t('delete')}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('invDeleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting ? `“${deleting.number}” — ${deleting.title}` : ''}. {t('invDeleteHint')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="press">{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="press bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); remove() }}
              disabled={deletingBusy}
            >
              {deletingBusy ? t('loading') : t('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
