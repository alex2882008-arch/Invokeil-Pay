'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  Undo2, Plus, Search, ShieldCheck, FileWarning, X, Send, Paperclip, Link2, Trash2, Clock,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from '@/components/ui/sheet'
import { fetchApi, ApiError } from '@/lib/api-client'
import { formatBDT, formatDateTime } from '@/lib/format'
import { useUrlState } from '@/hooks/use-url-state'
import { useLang } from '@/lib/i18n'
import { REF_EN, REF_BN } from '@/lib/i18n/refunds'
import { MfsBadge, PageHeader, StatCard, EmptyState, ErrorCard, Pagination, SearchInput, DetailRow, CopyButton } from './ui-bits'

// ── Types ────────────────────────────────────────────────────────────────────

interface NoteEntry { by: string; at: string; body: string }
interface EvidenceItem { name: string; url: string; ref?: string }

interface TrxLite {
  id: string
  trxId: string | null
  mfs: string
  amount: number
  status: string
  senderNumber: string | null
  refundAmount?: number
  occurredAt: string
}

interface RefundRow {
  id: string
  transactionId: string | null
  trxRef: string | null
  customerRef: string | null
  type: string
  amount: number
  reason: string | null
  status: string
  evidence: string[]
  notes: NoteEntry[]
  requestedByName: string | null
  approvedByName: string | null
  processedByName: string | null
  approvalId: string | null
  decidedAt: string | null
  processedAt: string | null
  createdAt: string
  trx: TrxLite | null
}

interface RefundStats {
  PENDING: number
  APPROVED: number
  PROCESSED: number
  REJECTED: number
  refundedTotal: number
}

interface ApprovalInfo {
  id: string
  type: string
  summary: string
  status: string
  requestedByName: string | null
  approvedByName: string | null
  thresholdAmount: number | null
  decidedAt: string | null
  createdAt: string
}

interface RefundDetail {
  refund: RefundRow
  approval: ApprovalInfo | null
  timeline: Array<{ id: string; type: string; status: string; at: string; summary: string }>
}

interface DisputeRow {
  id: string
  transactionId: string | null
  trxRef: string | null
  customerRef: string | null
  amount: number
  reason: string
  status: string
  evidence: EvidenceItem[]
  messages: NoteEntry[]
  notes: NoteEntry[]
  deadlineAt: string | null
  resolvedAt: string | null
  createdAt: string
  trx: TrxLite | null
}

interface DisputeStats {
  OPEN: number
  UNDER_REVIEW: number
  WON: number
  LOST: number
  CANCELLED: number
  atRisk: number
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const REFUND_TONE: Record<string, string> = {
  PENDING: 'bg-muted text-muted-foreground border-border',
  APPROVED: 'bg-primary/10 text-primary border-primary/25',
  PROCESSED: 'bg-success/10 text-success border-success/20',
  REJECTED: 'bg-destructive/10 text-destructive border-destructive/25',
}

const DISPUTE_TONE: Record<string, string> = {
  OPEN: 'bg-warning/15 text-amber-700 dark:text-amber-400 border-warning/30',
  UNDER_REVIEW: 'bg-primary/10 text-primary border-primary/25',
  WON: 'bg-success/10 text-success border-success/20',
  LOST: 'bg-destructive/10 text-destructive border-destructive/25',
  CANCELLED: 'bg-muted text-muted-foreground border-border',
}

function StatusChip({ status, map }: { status: string; map: Record<string, string> }) {
  return (
    <Badge variant="outline" className={`whitespace-nowrap font-medium ${map[status] ?? 'bg-muted text-muted-foreground border-border'}`}>
      {status.replaceAll('_', ' ')}
    </Badge>
  )
}

function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function deadlineInfo(deadlineAt: string | null): { text: string; cls: string } | null {
  if (!deadlineAt) return null
  const days = Math.ceil((new Date(deadlineAt).getTime() - Date.now()) / 86_400_000)
  if (days < 0) return { text: 'Overdue', cls: 'bg-destructive/10 text-destructive border-destructive/25' }
  if (days < 3) return { text: `${days}d`, cls: 'bg-destructive/10 text-destructive border-destructive/25' }
  if (days < 7) return { text: `${days}d`, cls: 'bg-warning/15 text-amber-700 dark:text-amber-400 border-warning/30' }
  return { text: `${days}d`, cls: 'bg-muted text-muted-foreground border-border' }
}

/** Role helper straight from the session endpoint. */
function useMyRole(): string | null {
  const [role, setRole] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    fetchApi<{ user: { role?: string } | null }>('/api/auth/me')
      .then((d) => { if (alive) setRole(d.user?.role ?? null) })
      .catch(() => undefined)
    return () => { alive = false }
  }, [])
  return role
}

// ── Shared transaction picker (refunds + disputes create dialogs) ───────────

function TrxPicker({
  picked, onPick, onClear, findLabel, findPh, noneLabel, noneHint, pickLabel, changeLabel, selectedLabel,
}: {
  picked: TrxLite | null
  onPick: (t: TrxLite) => void
  onClear: () => void
  findLabel: string
  findPh: string
  noneLabel: string
  noneHint: string
  pickLabel: string
  changeLabel: string
  selectedLabel: string
}) {
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<TrxLite[]>([])
  const [searched, setSearched] = useState(false)

  const search = async () => {
    if (!q.trim()) return
    setBusy(true)
    try {
      const d = await fetchApi<{ items: TrxLite[] }>(`/api/admin/transactions?q=${encodeURIComponent(q.trim())}&page=1`)
      setResults(d.items ?? [])
      setSearched(true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Search failed')
    } finally {
      setBusy(false)
    }
  }

  if (picked) {
    return (
      <div className="rounded-lg border bg-muted/30 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{selectedLabel}</p>
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs press" onClick={onClear}>{changeLabel}</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MfsBadge mfs={picked.mfs} />
          <span className="font-mono text-xs font-semibold">{picked.trxId ?? picked.id}</span>
          <span className="text-sm font-bold">{formatBDT(picked.amount)}</span>
          <Badge variant="outline" className="text-[10px]">{picked.status}</Badge>
          {picked.senderNumber && <span className="text-xs text-muted-foreground">{picked.senderNumber}</span>}
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">{formatDateTime(picked.occurredAt)}</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <Label className="text-xs font-medium">{findLabel}</Label>
      <form
        className="flex gap-2"
        onSubmit={(e) => { e.preventDefault(); void search() }}
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={findPh} className="h-10 pl-9" />
        </div>
        <Button type="submit" variant="outline" disabled={busy || !q.trim()} className="press h-10">{busy ? '…' : findLabel}</Button>
      </form>
      {searched && results.length === 0 && (
        <p className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">
          {noneLabel} · {noneHint}
        </p>
      )}
      {results.length > 0 && (
        <div className="max-h-52 overflow-y-auto rounded-lg border">
          {results.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2 border-b px-3 py-2 last:border-0">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <MfsBadge mfs={r.mfs} />
                <span className="truncate font-mono text-xs font-semibold">{r.trxId ?? r.id}</span>
                <span className="text-xs font-bold">{formatBDT(r.amount)}</span>
                <Badge variant="outline" className="text-[10px]">{r.status}</Badge>
                <span className="hidden text-[11px] text-muted-foreground sm:inline">{formatDateTime(r.occurredAt)}</span>
              </div>
              <Button type="button" size="sm" variant="outline" className="press h-7 shrink-0 px-2 text-xs" onClick={() => onPick(r)}>{pickLabel}</Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main view ────────────────────────────────────────────────────────────────

export function RefundsView() {
  const { t, lang } = useLang()
  const tt = useCallback((k: string) => (lang === 'bn' ? REF_BN[k] : REF_EN[k]) ?? t(k), [lang, t])
  const { get, getNum, set } = useUrlState()
  const myRole = useMyRole()
  const isAdmin = myRole === 'OWNER' || myRole === 'ADMIN'

  const tab = get('tab', 'refunds')
  const status = get('status')
  const q = get('q')
  const page = getNum('page', 1)
  const dStatus = get('dst')
  const dPage = getNum('dpage', 1)

  // Refunds state
  const [refunds, setRefunds] = useState<RefundRow[]>([])
  const [rStats, setRStats] = useState<RefundStats | null>(null)
  const [rTotal, setRTotal] = useState(0)
  const [rPages, setRPages] = useState(1)
  const [rLoading, setRLoading] = useState(true)
  const [rError, setRError] = useState<string | null>(null)
  const [threshold, setThreshold] = useState<number | null>(null)

  // Disputes state
  const [disputes, setDisputes] = useState<DisputeRow[]>([])
  const [dStats, setDStats] = useState<DisputeStats | null>(null)
  const [dTotal, setDTotal] = useState(0)
  const [dPages, setDPages] = useState(1)
  const [dLoading, setDLoading] = useState(false)
  const [dError, setDError] = useState<string | null>(null)

  // Create refund dialog
  const [createOpen, setCreateOpen] = useState(false)
  const [picked, setPicked] = useState<TrxLite | null>(null)
  const [type, setType] = useState<'FULL' | 'PARTIAL'>('FULL')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [evRows, setEvRows] = useState<Array<{ name: string; url: string }>>([])
  const [submitting, setSubmitting] = useState(false)

  // Create dispute dialog
  const [dCreateOpen, setDCreateOpen] = useState(false)
  const [dPicked, setDPicked] = useState<TrxLite | null>(null)
  const [dReason, setDReason] = useState('')
  const [dAmount, setDAmount] = useState('')
  const [dDeadline, setDDeadline] = useState('')
  const [dSubmitting, setDSubmitting] = useState(false)

  // Refund detail
  const [detailId, setDetailId] = useState<string | null>(null)
  const [detail, setDetail] = useState<RefundDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [noteText, setNoteText] = useState('')

  // Confirm dialog
  const [confirmAction, setConfirmAction] = useState<{ id: string; action: 'approve' | 'reject' | 'process' | 'delete' } | null>(null)
  const [rejectNote, setRejectNote] = useState('')
  const [acting, setActing] = useState(false)

  // Dispute drawer
  const [drawerId, setDrawerId] = useState<string | null>(null)
  const [dDetail, setDDetail] = useState<DisputeRow | null>(null)
  const [dDetailLoading, setDDetailLoading] = useState(false)
  const [msgText, setMsgText] = useState('')
  const [evName, setEvName] = useState('')
  const [evUrl, setEvUrl] = useState('')
  const [evRef, setEvRef] = useState('')
  const [dActing, setDActing] = useState(false)

  // ── Loaders ────────────────────────────────────────────────────────────────

  const loadRefunds = useCallback(async () => {
    setRLoading(true)
    setRError(null)
    try {
      const p = new URLSearchParams({ page: String(page) })
      if (status) p.set('status', status)
      if (q) p.set('q', q)
      const d = await fetchApi<{ refunds: RefundRow[]; total: number; pages: number; stats: RefundStats }>(`/api/admin/refunds?${p.toString()}`)
      setRefunds(d.refunds)
      setRStats(d.stats)
      setRTotal(d.total)
      setRPages(d.pages)
    } catch (e) {
      setRError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setRLoading(false)
    }
  }, [page, q, status])

  const loadDisputes = useCallback(async () => {
    setDLoading(true)
    setDError(null)
    try {
      const p = new URLSearchParams({ page: String(dPage) })
      if (dStatus) p.set('status', dStatus)
      const dq = get('dq')
      if (dq) p.set('q', dq)
      const d = await fetchApi<{ disputes: DisputeRow[]; total: number; pages: number; stats: DisputeStats }>(`/api/admin/disputes?${p.toString()}`)
      setDisputes(d.disputes)
      setDStats(d.stats)
      setDTotal(d.total)
      setDPages(d.pages)
    } catch (e) {
      setDError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setDLoading(false)
    }
  }, [dPage, dStatus, get])

  useEffect(() => { void loadRefunds() }, [loadRefunds])
  useEffect(() => { if (tab === 'disputes') void loadDisputes() }, [tab, loadDisputes])

  useEffect(() => {
    let alive = true
    fetchApi<Record<string, string>>('/api/admin/settings')
      .then((s) => { if (alive) setThreshold(Number(s.approvalThresholdAmount ?? '0') || 0) })
      .catch(() => undefined)
    return () => { alive = false }
  }, [])

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true)
    try {
      const d = await fetchApi<RefundDetail>(`/api/admin/refunds/${id}`)
      setDetail(d)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load detail')
    } finally {
      setDetailLoading(false)
    }
  }, [])

  const loadDisputeDetail = useCallback(async (id: string) => {
    setDDetailLoading(true)
    try {
      const d = await fetchApi<{ dispute: DisputeRow }>(`/api/admin/disputes/${id}`)
      setDDetail(d.dispute)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load detail')
    } finally {
      setDDetailLoading(false)
    }
  }, [])

  // ── Refund actions ─────────────────────────────────────────────────────────

  const runRefundAction = useCallback(async (id: string, action: 'approve' | 'reject' | 'process' | 'delete', note?: string) => {
    setActing(true)
    try {
      if (action === 'delete') {
        await fetchApi(`/api/admin/refunds/${id}`, { method: 'DELETE' })
        toast.success(tt('refDeletedT'))
      } else {
        await fetchApi(`/api/admin/refunds/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, note }),
        })
        if (action === 'approve') toast.success(tt('refApprovedT'))
        if (action === 'reject') toast.success(tt('refRejectedT'))
        if (action === 'process') toast.success(tt('refProcessedT'))
      }
      setConfirmAction(null)
      setRejectNote('')
      await loadRefunds()
      if (detailId) await loadDetail(detailId)
    } catch (e) {
      if (e instanceof ApiError && e.status === 403 && e.message.includes('Second approval')) {
        toast.error(tt('refSecondApproval'))
      } else {
        toast.error(e instanceof Error ? e.message : tt('refActionFail'))
      }
    } finally {
      setActing(false)
    }
  }, [detailId, loadDetail, loadRefunds, tt])

  const submitRefund = async () => {
    if (!picked) return
    setSubmitting(true)
    try {
      const d = await fetchApi<{ needsApproval: boolean }>('/api/admin/refunds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionId: picked.id,
          type,
          ...(type === 'PARTIAL' ? { amount: Number(amount) } : {}),
          reason,
          evidence: evRows.map((r) => r.url).filter((u) => u.trim() !== ''),
        }),
      })
      toast.success(d.needsApproval ? tt('refCreatedApproval') : tt('refCreated'))
      setCreateOpen(false)
      setPicked(null)
      setType('FULL')
      setAmount('')
      setReason('')
      setEvRows([])
      await loadRefunds()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tt('refActionFail'))
    } finally {
      setSubmitting(false)
    }
  }

  const addNote = async () => {
    if (!detailId || !noteText.trim()) return
    try {
      await fetchApi(`/api/admin/refunds/${detailId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'note', note: noteText.trim() }),
      })
      setNoteText('')
      toast.success(tt('refNoteAddedT'))
      await loadDetail(detailId)
      await loadRefunds()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tt('refActionFail'))
    }
  }

  // ── Dispute actions ────────────────────────────────────────────────────────

  const submitDispute = async () => {
    if (!dPicked) return
    setDSubmitting(true)
    try {
      await fetchApi('/api/admin/disputes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionId: dPicked.id,
          reason: dReason,
          ...(dAmount.trim() !== '' ? { amount: Number(dAmount) } : {}),
          ...(dDeadline ? { deadlineAt: new Date(`${dDeadline}T23:59:59`).toISOString() } : {}),
        }),
      })
      toast.success(tt('dspCreated'))
      setDCreateOpen(false)
      setDPicked(null)
      setDReason('')
      setDAmount('')
      setDDeadline('')
      await loadDisputes()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tt('dspFail'))
    } finally {
      setDSubmitting(false)
    }
  }

  const setDisputeStatus = async (id: string, next: string) => {
    setDActing(true)
    try {
      await fetchApi(`/api/admin/disputes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'status', status: next }),
      })
      toast.success(tt('dspStatusUpdated'))
      await loadDisputeDetail(id)
      await loadDisputes()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tt('dspFail'))
    } finally {
      setDActing(false)
    }
  }

  const sendMessage = async () => {
    if (!drawerId || !msgText.trim()) return
    setDActing(true)
    try {
      await fetchApi(`/api/admin/disputes/${drawerId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msgText.trim() }),
      })
      setMsgText('')
      toast.success(tt('dspMessageSent'))
      await loadDisputeDetail(drawerId)
      await loadDisputes()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tt('dspFail'))
    } finally {
      setDActing(false)
    }
  }

  const addEvidence = async () => {
    if (!drawerId || !evName.trim() || !evUrl.trim()) return
    setDActing(true)
    try {
      await fetchApi(`/api/admin/disputes/${drawerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'evidence',
          evidence: [{ name: evName.trim(), url: evUrl.trim(), ...(evRef.trim() ? { ref: evRef.trim() } : {}) }],
        }),
      })
      setEvName('')
      setEvUrl('')
      setEvRef('')
      toast.success(tt('dspEvidenceAdded'))
      await loadDisputeDetail(drawerId)
      await loadDisputes()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tt('dspFail'))
    } finally {
      setDActing(false)
    }
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const nextDisputeStatuses: Record<string, Array<{ key: string; label: string }>> = {
    OPEN: [
      { key: 'UNDER_REVIEW', label: tt('dspMarkReview') },
      { key: 'CANCELLED', label: tt('dspMarkCancelled') },
    ],
    UNDER_REVIEW: [
      { key: 'WON', label: tt('dspMarkWon') },
      { key: 'LOST', label: tt('dspMarkLost') },
      { key: 'CANCELLED', label: tt('dspMarkCancelled') },
    ],
  }

  const confirmTitles: Record<string, { title: string; body: string }> = {
    approve: { title: tt('refConfirmApproveTitle'), body: tt('refConfirmApproveBody') },
    process: { title: tt('refConfirmProcessTitle'), body: tt('refConfirmProcessBody') },
    delete: { title: tt('refConfirmDeleteTitle'), body: tt('refConfirmDeleteBody') },
    reject: { title: tt('refConfirmRejectTitle'), body: tt('refConfirmRejectBody') },
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div>
      <PageHeader
        title={tt('refTitle')}
        description={tt('refSubtitle')}
        icon={<Undo2 className="h-5 w-5" />}
        actions={
          tab === 'refunds' ? (
            <Button className="press gap-1.5" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> {tt('refNewRefund')}
            </Button>
          ) : (
            <Button className="press gap-1.5" onClick={() => setDCreateOpen(true)}>
              <Plus className="h-4 w-4" /> {tt('dspNewDispute')}
            </Button>
          )
        }
      />

      <Tabs value={tab} onValueChange={(v) => set({ tab: v })} className="gap-4">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 sm:w-fit sm:grid-cols-2">
          <TabsTrigger value="refunds" className="gap-1.5 px-3"><Undo2 className="h-3.5 w-3.5" />{tt('refTabRefunds')}</TabsTrigger>
          <TabsTrigger value="disputes" className="gap-1.5 px-3"><FileWarning className="h-3.5 w-3.5" />{tt('refTabDisputes')}</TabsTrigger>
        </TabsList>

        {/* ── Refunds tab ── */}
        <TabsContent value="refunds" className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label={tt('refStatPending')} value={String(rStats?.PENDING ?? 0)} icon={<Clock className="h-4 w-4" />} tone="bg-muted text-muted-foreground" loading={rLoading} />
            <StatCard label={tt('refStatApproved')} value={String(rStats?.APPROVED ?? 0)} icon={<ShieldCheck className="h-4 w-4" />} loading={rLoading} />
            <StatCard label={tt('refStatProcessed')} value={String(rStats?.PROCESSED ?? 0)} icon={<Undo2 className="h-4 w-4" />} tone="text-success bg-success/10" loading={rLoading} />
            <StatCard label={tt('refStatRefunded')} value={formatBDT(rStats?.refundedTotal ?? 0)} tone="text-warning bg-warning/10" icon={<Undo2 className="h-4 w-4" />} loading={rLoading} />
          </div>

          <Card className="p-4">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <SearchInput placeholder={tt('refSearchPh')} className="flex-1" />
              <Select value={status || 'ALL'} onValueChange={(v) => set({ status: v === 'ALL' ? null : v, page: null })}>
                <SelectTrigger className="h-9 w-full sm:w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">{tt('refFilterAll')}</SelectItem>
                  {['PENDING', 'APPROVED', 'PROCESSED', 'REJECTED'].map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {rError ? (
              <ErrorCard message={rError} onRetry={() => void loadRefunds()} />
            ) : rLoading ? (
              <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : refunds.length === 0 ? (
              <EmptyState icon={<Undo2 className="h-7 w-7" />} title={tt('refEmpty')} hint={tt('refEmptyHint')} />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-2 py-2 font-semibold">{tt('refColTrx')}</th>
                        <th className="px-2 py-2 font-semibold">{tt('refColAmount')}</th>
                        <th className="px-2 py-2 font-semibold">{tt('refColType')}</th>
                        <th className="px-2 py-2 font-semibold">{tt('refColStatus')}</th>
                        <th className="hidden px-2 py-2 font-semibold md:table-cell">{tt('refColRequester')}</th>
                        <th className="hidden px-2 py-2 font-semibold lg:table-cell">{tt('refColDate')}</th>
                        <th className="px-2 py-2 text-right font-semibold">{tt('refColActions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {refunds.map((r) => (
                        <tr
                          key={r.id}
                          className="cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/40"
                          onClick={() => { setDetailId(r.id); setDetail(null); setNoteText(''); void loadDetail(r.id) }}
                        >
                          <td className="px-2 py-2.5">
                            <div className="flex items-center gap-2">
                              {r.trx && <MfsBadge mfs={r.trx.mfs} />}
                              <span className="font-mono text-xs font-semibold">{r.trxRef ?? r.trx?.trxId ?? r.id}</span>
                            </div>
                          </td>
                          <td className="px-2 py-2.5 font-bold tabular">{formatBDT(r.amount)}</td>
                          <td className="px-2 py-2.5 text-xs">{r.type === 'FULL' ? tt('refTypeFull') : tt('refTypePartial')}</td>
                          <td className="px-2 py-2.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <StatusChip status={r.status} map={REFUND_TONE} />
                              {r.approvalId && (
                                <Badge variant="outline" className="gap-1 border-primary/25 bg-primary/10 px-1.5 text-[10px] text-primary" title={tt('refApprovalChipHint')}>
                                  <ShieldCheck className="h-3 w-3" /> {tt('refNeedsApproval')}
                                </Badge>
                              )}
                            </div>
                          </td>
                          <td className="hidden px-2 py-2.5 text-xs md:table-cell">{r.requestedByName ?? '—'}</td>
                          <td className="hidden px-2 py-2.5 text-xs text-muted-foreground lg:table-cell">{formatDateTime(r.createdAt)}</td>
                          <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1.5">
                              {r.status === 'PENDING' && (
                                <>
                                  <Button size="sm" variant="outline" className="press h-8 gap-1 px-2 text-xs" onClick={() => setConfirmAction({ id: r.id, action: 'approve' })}>
                                    <ShieldCheck className="h-3.5 w-3.5" /> {tt('refApprove')}
                                  </Button>
                                  <Button size="sm" variant="outline" className="press h-8 gap-1 px-2 text-xs text-destructive hover:text-destructive" onClick={() => { setRejectNote(''); setConfirmAction({ id: r.id, action: 'reject' }) }}>
                                    <X className="h-3.5 w-3.5" /> {tt('refReject')}
                                  </Button>
                                </>
                              )}
                              {(r.status === 'APPROVED' || (r.status === 'PENDING' && !r.approvalId)) && (
                                <Button size="sm" className="press h-8 gap-1 px-2 text-xs" onClick={() => setConfirmAction({ id: r.id, action: 'process' })}>
                                  <Undo2 className="h-3.5 w-3.5" /> {tt('refProcess')}
                                </Button>
                              )}
                              {r.status === 'PENDING' && isAdmin && (
                                <Button size="sm" variant="ghost" className="press h-8 w-8 p-0 text-muted-foreground hover:text-destructive" aria-label={tt('refDelete')} onClick={() => setConfirmAction({ id: r.id, action: 'delete' })}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination page={page} pages={rPages} total={rTotal} />
              </>
            )}
          </Card>
        </TabsContent>

        {/* ── Disputes tab ── */}
        <TabsContent value="disputes" className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label={tt('dspStatOpen')} value={String(dStats?.OPEN ?? 0)} icon={<FileWarning className="h-4 w-4" />} tone="text-warning bg-warning/10" loading={dLoading} />
            <StatCard label={tt('dspStatReview')} value={String(dStats?.UNDER_REVIEW ?? 0)} loading={dLoading} />
            <StatCard label={tt('dspStatResolved')} value={String((dStats?.WON ?? 0) + (dStats?.LOST ?? 0))} tone="text-success bg-success/10" icon={<ShieldCheck className="h-4 w-4" />} loading={dLoading} />
            <StatCard label={tt('dspStatAtRisk')} value={formatBDT(dStats?.atRisk ?? 0)} tone="text-destructive bg-destructive/10" icon={<FileWarning className="h-4 w-4" />} loading={dLoading} />
          </div>

          <Card className="p-4">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <SearchInput paramKey="dq" placeholder={tt('refSearchPh')} className="flex-1" />
              <Select value={dStatus || 'ALL'} onValueChange={(v) => set({ dst: v === 'ALL' ? null : v, dpage: null })}>
                <SelectTrigger className="h-9 w-full sm:w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">{tt('refFilterAll')}</SelectItem>
                  {['OPEN', 'UNDER_REVIEW', 'WON', 'LOST', 'CANCELLED'].map((s) => (
                    <SelectItem key={s} value={s}>{s.replaceAll('_', ' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {dError ? (
              <ErrorCard message={dError} onRetry={() => void loadDisputes()} />
            ) : dLoading ? (
              <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : disputes.length === 0 ? (
              <EmptyState icon={<FileWarning className="h-7 w-7" />} title={tt('dspEmpty')} hint={tt('dspEmptyHint')} />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-2 py-2 font-semibold">{tt('dspColTrx')}</th>
                        <th className="px-2 py-2 font-semibold">{tt('dspColAmount')}</th>
                        <th className="px-2 py-2 font-semibold">{tt('dspColReason')}</th>
                        <th className="px-2 py-2 font-semibold">{tt('dspColStatus')}</th>
                        <th className="px-2 py-2 font-semibold">{tt('dspColDeadline')}</th>
                        <th className="hidden px-2 py-2 font-semibold lg:table-cell">{tt('dspColCreated')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {disputes.map((d) => {
                        const dl = deadlineInfo(d.deadlineAt)
                        return (
                          <tr
                            key={d.id}
                            className="cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/40"
                            onClick={() => { setDrawerId(d.id); setDDetail(null); setMsgText(''); void loadDisputeDetail(d.id) }}
                          >
                            <td className="px-2 py-2.5">
                              <div className="flex items-center gap-2">
                                {d.trx && <MfsBadge mfs={d.trx.mfs} />}
                                <span className="font-mono text-xs font-semibold">{d.trxRef ?? d.trx?.trxId ?? d.id}</span>
                              </div>
                            </td>
                            <td className="px-2 py-2.5 font-bold tabular">{formatBDT(d.amount)}</td>
                            <td className="max-w-[220px] truncate px-2 py-2.5 text-xs">{d.reason}</td>
                            <td className="px-2 py-2.5"><StatusChip status={d.status} map={DISPUTE_TONE} /></td>
                            <td className="px-2 py-2.5">
                              {dl ? (
                                <Badge variant="outline" className={`text-[10px] font-bold ${dl.cls}`}>
                                  <Clock className="mr-1 h-3 w-3" />{dl.text}
                                </Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground">{tt('dspNoDeadline')}</span>
                              )}
                            </td>
                            <td className="hidden px-2 py-2.5 text-xs text-muted-foreground lg:table-cell">{formatDateTime(d.createdAt)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <Pagination page={dPage} pages={dPages} total={dTotal} />
              </>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Create refund dialog ── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{tt('refCreateTitle')}</DialogTitle>
            <DialogDescription>{tt('refCreateDesc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <TrxPicker
              picked={picked}
              onPick={setPicked}
              onClear={() => setPicked(null)}
              findLabel={tt('refFindTrx')}
              findPh={tt('refFindTrxPh')}
              noneLabel={tt('refNoTrxFound')}
              noneHint={tt('refNoTrxHint')}
              pickLabel={tt('refPickTrx')}
              changeLabel={tt('refChangeTrx')}
              selectedLabel={tt('refSelectedTrx')}
            />
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">{tt('refColType')}</Label>
                <Select value={type} onValueChange={(v) => setType(v === 'PARTIAL' ? 'PARTIAL' : 'FULL')}>
                  <SelectTrigger className="h-10 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FULL">{tt('refTypeFull')}</SelectItem>
                    <SelectItem value="PARTIAL">{tt('refTypePartial')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {type === 'PARTIAL' && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">{tt('refAmount')}</Label>
                  <Input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-10" placeholder="0.00" />
                  {picked && <p className="text-[11px] text-muted-foreground">{tt('refRefundable')}: {formatBDT(picked.amount)}</p>}
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">{tt('refReason')}</Label>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={tt('refReasonPh')} rows={3} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">{tt('refEvidence')}</Label>
              {evRows.map((row, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input value={row.name} onChange={(e) => setEvRows((rs) => rs.map((r, j) => (j === i ? { ...r, name: e.target.value } : r)))} placeholder={tt('refEvidenceNamePh')} className="h-9 w-28 shrink-0" />
                  <Input value={row.url} onChange={(e) => setEvRows((rs) => rs.map((r, j) => (j === i ? { ...r, url: e.target.value } : r)))} placeholder={tt('refEvidenceUrlPh')} className="h-9 flex-1" />
                  <Button type="button" variant="ghost" size="sm" className="h-8 w-8 shrink-0 p-0 text-muted-foreground hover:text-destructive" aria-label="Remove" onClick={() => setEvRows((rs) => rs.filter((_, j) => j !== i))}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" className="press gap-1.5" onClick={() => setEvRows((rs) => [...rs, { name: '', url: '' }])}>
                <Link2 className="h-3.5 w-3.5" /> {tt('refAddEvidence')}
              </Button>
            </div>
            {threshold != null && threshold > 0 && (
              <p className="rounded-lg border border-primary/20 bg-primary/5 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
                <ShieldCheck className="mr-1 inline h-3.5 w-3.5 text-primary" />
                {tt('refThresholdNote')} ({tt('refThresholdNote').slice(0, 0)}≥ {formatBDT(threshold)})
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" className="press" onClick={() => setCreateOpen(false)}>{tt('refCancel')}</Button>
              <Button className="press" disabled={!picked || !reason.trim() || submitting || (type === 'PARTIAL' && !(Number(amount) > 0))} onClick={() => void submitRefund()}>
                {submitting ? tt('refSubmitting') : tt('refSubmit')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Refund detail dialog ── */}
      <Dialog open={!!detailId} onOpenChange={(o) => { if (!o) setDetailId(null) }}>
        <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{tt('refDetailTitle')}</DialogTitle>
          </DialogHeader>
          {detailLoading || !detail ? (
            <div className="space-y-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-2xl font-bold tabular">{formatBDT(detail.refund.amount)}</span>
                <StatusChip status={detail.refund.status} map={REFUND_TONE} />
                <Badge variant="outline" className="text-xs">{detail.refund.type === 'FULL' ? tt('refTypeFull') : tt('refTypePartial')}</Badge>
                {detail.refund.approvalId && (
                  <Badge variant="outline" className="gap-1 border-primary/25 bg-primary/10 text-[10px] text-primary">
                    <ShieldCheck className="h-3 w-3" /> {tt('refNeedsApproval')}
                  </Badge>
                )}
              </div>

              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{tt('refTrxSummary')}</p>
                <div className="rounded-lg border p-3">
                  {detail.refund.trx ? (
                    <>
                      <DetailRow label="TrxID" value={<span className="flex items-center gap-2"><span className="font-mono">{detail.refund.trx.trxId ?? detail.refund.trx.id}</span><CopyButton value={detail.refund.trx.trxId ?? detail.refund.trx.id} compact /></span>} />
                      <DetailRow label={tt('refColAmount')} value={`${formatBDT(detail.refund.trx.amount)} · ${detail.refund.trx.status}`} />
                      <DetailRow label={tt('refTrxWindow')} value={formatDateTime(detail.refund.trx.occurredAt)} />
                      <DetailRow label="Sender" value={detail.refund.trx.senderNumber ?? '—'} mono />
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">{detail.refund.trxRef ?? '—'}</p>
                  )}
                </div>
              </div>

              <div className="rounded-lg border p-3">
                <DetailRow label={tt('refRequestedBy')} value={detail.refund.requestedByName ?? '—'} />
                {detail.refund.reason && <DetailRow label={tt('refReason')} value={detail.refund.reason} />}
                {detail.refund.approvedByName && <DetailRow label={tt('refApprovedBy')} value={detail.refund.approvedByName} />}
                {detail.refund.decidedAt && <DetailRow label={tt('refDecidedAt')} value={formatDateTime(detail.refund.decidedAt)} />}
                {detail.refund.processedByName && <DetailRow label={tt('refProcessedBy')} value={detail.refund.processedByName} />}
                {detail.refund.processedAt && <DetailRow label={tt('refProcessedAt')} value={formatDateTime(detail.refund.processedAt)} />}
              </div>

              {detail.approval && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-primary">{tt('refApprovalReq')}</p>
                  <DetailRow label={tt('refApprovalStatus')} value={<StatusChip status={detail.approval.status} map={REFUND_TONE} />} />
                  <DetailRow label={tt('refRequestedBy')} value={detail.approval.requestedByName ?? '—'} />
                  {detail.approval.approvedByName && <DetailRow label={tt('refApprovedBy')} value={detail.approval.approvedByName} />}
                  {detail.approval.thresholdAmount != null && <DetailRow label="Threshold" value={formatBDT(detail.approval.thresholdAmount)} />}
                </div>
              )}

              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{tt('refEvidenceList')}</p>
                {detail.refund.evidence.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{tt('refNoEvidence')}</p>
                ) : (
                  <ul className="space-y-1">
                    {detail.refund.evidence.map((u, i) => (
                      <li key={i}>
                        <a href={u} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 break-all text-xs text-primary underline-offset-2 hover:underline">
                          <Paperclip className="h-3 w-3 shrink-0" /> {u}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{tt('refNotesTimeline')}</p>
                {detail.refund.notes.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{tt('refNoNotes')}</p>
                ) : (
                  <div className="max-h-56 space-y-2 overflow-y-auto rounded-lg border p-3 nice-scroll">
                    {detail.refund.notes.slice().reverse().map((n, i) => (
                      <div key={i} className="border-b pb-2 last:border-0 last:pb-0">
                        <p className="text-xs font-semibold">{n.by} <span className="font-normal text-muted-foreground">· {formatDateTime(n.at)}</span></p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-2 flex gap-2">
                  <Input value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder={tt('refNotePh')} className="h-9" />
                  <Button size="sm" variant="outline" className="press h-9 shrink-0" disabled={!noteText.trim()} onClick={() => void addNote()}>{tt('refAddNote')}</Button>
                </div>
              </div>

              <div className="flex flex-wrap justify-end gap-2 border-t pt-3">
                {detail.refund.status === 'PENDING' && (
                  <>
                    <Button size="sm" variant="outline" className="press gap-1" onClick={() => setConfirmAction({ id: detail.refund.id, action: 'approve' })}>
                      <ShieldCheck className="h-3.5 w-3.5" /> {tt('refApprove')}
                    </Button>
                    <Button size="sm" variant="outline" className="press gap-1 text-destructive hover:text-destructive" onClick={() => { setRejectNote(''); setConfirmAction({ id: detail.refund.id, action: 'reject' }) }}>
                      <X className="h-3.5 w-3.5" /> {tt('refReject')}
                    </Button>
                  </>
                )}
                {(detail.refund.status === 'APPROVED' || (detail.refund.status === 'PENDING' && !detail.refund.approvalId)) && (
                  <Button size="sm" className="press gap-1" onClick={() => setConfirmAction({ id: detail.refund.id, action: 'process' })}>
                    <Undo2 className="h-3.5 w-3.5" /> {tt('refProcess')}
                  </Button>
                )}
                {detail.refund.status === 'PENDING' && isAdmin && (
                  <Button size="sm" variant="ghost" className="press gap-1 text-muted-foreground hover:text-destructive" onClick={() => setConfirmAction({ id: detail.refund.id, action: 'delete' })}>
                    <Trash2 className="h-3.5 w-3.5" /> {tt('refDelete')}
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Create dispute dialog ── */}
      <Dialog open={dCreateOpen} onOpenChange={setDCreateOpen}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{tt('dspCreateTitle')}</DialogTitle>
            <DialogDescription>{tt('dspCreateDesc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <TrxPicker
              picked={dPicked}
              onPick={setDPicked}
              onClear={() => setDPicked(null)}
              findLabel={tt('dspFindTrx')}
              findPh={tt('refFindTrxPh')}
              noneLabel={tt('refNoTrxFound')}
              noneHint={tt('refNoTrxHint')}
              pickLabel={tt('refPickTrx')}
              changeLabel={tt('refChangeTrx')}
              selectedLabel={tt('refSelectedTrx')}
            />
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">{tt('dspReason')}</Label>
              <Textarea value={dReason} onChange={(e) => setDReason(e.target.value)} placeholder={tt('dspReasonPh')} rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">{tt('dspAmount')}</Label>
                <Input type="number" min="0" step="0.01" value={dAmount} onChange={(e) => setDAmount(e.target.value)} className="h-10" placeholder={dPicked ? String(dPicked.amount) : '0.00'} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">{tt('dspDeadline')}</Label>
                <Input type="date" min={currentMonth() + '-01'} value={dDeadline} onChange={(e) => setDDeadline(e.target.value)} className="h-10" />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" className="press" onClick={() => setDCreateOpen(false)}>{tt('refCancel')}</Button>
              <Button className="press" disabled={!dPicked || !dReason.trim() || dSubmitting} onClick={() => void submitDispute()}>
                {dSubmitting ? tt('dspSubmitting') : tt('dspSubmit')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Dispute drawer ── */}
      <Sheet open={!!drawerId} onOpenChange={(o) => { if (!o) setDrawerId(null) }}>
        <SheetContent side="right" className="w-full max-h-screen overflow-y-auto p-4 sm:max-w-md nice-scroll">
          <SheetHeader className="p-0">
            <SheetTitle>{tt('dspDetailTitle')}</SheetTitle>
            <SheetDescription>{dDetail?.trxRef ?? drawerId}</SheetDescription>
          </SheetHeader>
          {dDetailLoading || !dDetail ? (
            <div className="mt-4 space-y-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xl font-bold tabular">{formatBDT(dDetail.amount)}</span>
                <StatusChip status={dDetail.status} map={DISPUTE_TONE} />
                {dDetail.resolvedAt && <Badge variant="outline" className="text-[10px]">{tt('dspResolvedAt')}: {formatDateTime(dDetail.resolvedAt)}</Badge>}
              </div>

              <div className="rounded-lg border p-3">
                <DetailRow label={tt('dspReason')} value={dDetail.reason} />
                {dDetail.deadlineAt && <DetailRow label={tt('dspColDeadline')} value={formatDateTime(dDetail.deadlineAt)} />}
                {dDetail.trx && (
                  <>
                    <DetailRow label={tt('dspTrxSummary')} value={<span className="flex items-center gap-2"><MfsBadge mfs={dDetail.trx.mfs} /><span className="font-mono">{dDetail.trx.trxId ?? dDetail.trx.id}</span></span>} />
                    <DetailRow label={tt('refColAmount')} value={`${formatBDT(dDetail.trx.amount)} · ${dDetail.trx.status}`} />
                    <DetailRow label="Sender" value={dDetail.trx.senderNumber ?? '—'} mono />
                  </>
                )}
              </div>

              {nextDisputeStatuses[dDetail.status] && (
                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{tt('dspStatusFlow')}</p>
                  <div className="flex flex-wrap gap-2">
                    {nextDisputeStatuses[dDetail.status].map((s) => (
                      <Button
                        key={s.key}
                        size="sm"
                        variant={s.key === 'WON' ? 'default' : 'outline'}
                        className={`press h-9 ${s.key === 'LOST' || s.key === 'CANCELLED' ? 'text-destructive hover:text-destructive' : ''}`}
                        disabled={dActing}
                        onClick={() => void setDisputeStatus(dDetail.id, s.key)}
                      >
                        {s.label}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{tt('dspEvidence')}</p>
                {dDetail.evidence.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{tt('dspNoEvidence')}</p>
                ) : (
                  <ul className="space-y-1.5">
                    {dDetail.evidence.map((e, i) => (
                      <li key={i} className="rounded-lg border p-2">
                        <a href={e.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 break-all text-xs font-semibold text-primary underline-offset-2 hover:underline">
                          <Paperclip className="h-3 w-3 shrink-0" /> {e.name}
                        </a>
                        {e.ref && <p className="mt-0.5 text-[11px] text-muted-foreground">ref: {e.ref}</p>}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-2 space-y-2 rounded-lg border border-dashed p-2.5">
                  <div className="flex gap-2">
                    <Input value={evName} onChange={(e) => setEvName(e.target.value)} placeholder={tt('dspEvNamePh')} className="h-9" />
                    <Input value={evUrl} onChange={(e) => setEvUrl(e.target.value)} placeholder={tt('dspEvUrlPh')} className="h-9 flex-1" />
                  </div>
                  <div className="flex gap-2">
                    <Input value={evRef} onChange={(e) => setEvRef(e.target.value)} placeholder={tt('dspEvRefPh')} className="h-9 flex-1" />
                    <Button size="sm" variant="outline" className="press h-9 shrink-0 gap-1" disabled={!evName.trim() || !evUrl.trim() || dActing} onClick={() => void addEvidence()}>
                      <Plus className="h-3.5 w-3.5" /> {tt('dspAddEvidence')}
                    </Button>
                  </div>
                </div>
              </div>

              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{tt('dspMessages')}</p>
                {dDetail.messages.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{tt('dspNoMessages')}</p>
                ) : (
                  <div className="max-h-56 space-y-2 overflow-y-auto rounded-lg border p-3 nice-scroll">
                    {dDetail.messages.map((m, i) => (
                      <div key={i} className={`max-w-[85%] rounded-xl px-3 py-2 text-xs ${i % 2 === 0 ? 'bg-muted' : 'ml-auto bg-primary/10'}`}>
                        <p className="font-semibold">{m.by} <span className="font-normal text-muted-foreground">· {formatDateTime(m.at)}</span></p>
                        <p className="mt-0.5 leading-relaxed">{m.body}</p>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-2 flex gap-2">
                  <Textarea value={msgText} onChange={(e) => setMsgText(e.target.value)} placeholder={tt('dspMessagePh')} rows={2} className="min-h-9 flex-1" />
                  <Button size="sm" className="press h-9 shrink-0 gap-1 self-end" disabled={!msgText.trim() || dActing} onClick={() => void sendMessage()}>
                    <Send className="h-3.5 w-3.5" /> {tt('dspSend')}
                  </Button>
                </div>
              </div>

              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{tt('dspNotes')}</p>
                {dDetail.notes.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{tt('refNoNotes')}</p>
                ) : (
                  <div className="max-h-40 space-y-2 overflow-y-auto rounded-lg border p-3 nice-scroll">
                    {dDetail.notes.slice().reverse().map((n, i) => (
                      <div key={i} className="border-b pb-2 last:border-0 last:pb-0">
                        <p className="text-xs font-semibold">{n.by} <span className="font-normal text-muted-foreground">· {formatDateTime(n.at)}</span></p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* ── Confirm action dialog (approve / reject / process / delete) ── */}
      <AlertDialog open={!!confirmAction} onOpenChange={(o) => { if (!o) setConfirmAction(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmAction ? confirmTitles[confirmAction.action].title : ''}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction ? confirmTitles[confirmAction.action].body : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {confirmAction?.action === 'reject' && (
            <Textarea value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} placeholder={tt('refRejectNotePh')} rows={3} />
          )}
          <AlertDialogFooter>
            <AlertDialogCancel className="press">{tt('refCancel')}</AlertDialogCancel>
            {confirmAction?.action === 'reject' ? (
              <AlertDialogAction
                className="press bg-destructive text-white hover:bg-destructive/90"
                disabled={!rejectNote.trim() || acting}
                onClick={(e) => { e.preventDefault(); if (confirmAction) void runRefundAction(confirmAction.id, 'reject', rejectNote.trim()) }}
              >
                {tt('refReject')}
              </AlertDialogAction>
            ) : (
              <AlertDialogAction
                className={`press ${confirmAction?.action === 'delete' ? 'bg-destructive text-white hover:bg-destructive/90' : ''}`}
                disabled={acting}
                onClick={(e) => { e.preventDefault(); if (confirmAction) void runRefundAction(confirmAction.id, confirmAction.action) }}
              >
                {confirmAction?.action === 'approve' ? tt('refApprove') : confirmAction?.action === 'process' ? tt('refProcess') : tt('refConfirm')}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
