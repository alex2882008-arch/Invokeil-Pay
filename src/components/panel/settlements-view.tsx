'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Layers, Plus, Download, Scale, CheckCircle2, CalendarDays } from 'lucide-react'
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
import { fetchApi } from '@/lib/api-client'
import { formatBDT, formatDateTime } from '@/lib/format'
import { useUrlState } from '@/hooks/use-url-state'
import { useLang } from '@/lib/i18n'
import { STL_EN, STL_BN } from '@/lib/i18n/settlements'
import { MfsBadge, PageHeader, StatCard, EmptyState, ErrorCard, Pagination } from './ui-bits'

// ── Types ────────────────────────────────────────────────────────────────────

interface SettlementRow {
  id: string
  period: string
  provider: string
  expected: number
  actual: number
  fees: number
  adjustments: number
  status: string
  itemCount: number
  missingCount: number
  trxCount: number
  settledCount: number
  notes: string | null
  reconciledAt: string | null
  createdAt: string
}

interface SettlementStats {
  count: number
  expected: number
  actual: number
  fees: number
  adjustments: number
  missing: number
}

const STATUS_TONE: Record<string, string> = {
  PENDING: 'bg-muted text-muted-foreground border-border',
  RECONCILED: 'bg-success/10 text-success border-success/20',
  MISMATCH: 'bg-destructive/10 text-destructive border-destructive/25',
}

const STATUS_LABEL_KEY: Record<string, string> = {
  PENDING: 'stlPendingChip',
  RECONCILED: 'stlReconciledChip',
  MISMATCH: 'stlMismatchChip',
}

function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function shiftMonth(m: string, delta: number): string {
  const [y, mo] = m.split('-').map(Number)
  const d = new Date(y, mo - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// ── View ─────────────────────────────────────────────────────────────────────

export function SettlementsView() {
  const { t, lang } = useLang()
  const tt = useCallback((k: string) => (lang === 'bn' ? STL_BN[k] : STL_EN[k]) ?? t(k), [lang, t])
  const { get, getNum, set } = useUrlState()

  const status = get('status')
  const periodFilter = get('period')
  const page = getNum('page', 1)

  const [rows, setRows] = useState<SettlementRow[]>([])
  const [stats, setStats] = useState<SettlementStats | null>(null)
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Generate controls
  const [genMonth, setGenMonth] = useState(currentMonth())
  const [genProvider, setGenProvider] = useState('ALL')
  const [generating, setGenerating] = useState(false)

  // Reconcile dialog
  const [reconcileRow, setReconcileRow] = useState<SettlementRow | null>(null)
  const [rActual, setRActual] = useState('')
  const [rAdjust, setRAdjust] = useState('0')
  const [rMissing, setRMissing] = useState('0')
  const [rNotes, setRNotes] = useState('')
  const [saving, setSaving] = useState(false)

  // Settle confirm
  const [settleRow, setSettleRow] = useState<SettlementRow | null>(null)
  const [settling, setSettling] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const p = new URLSearchParams({ page: String(page) })
      if (status) p.set('status', status)
      if (periodFilter) p.set('period', periodFilter)
      const d = await fetchApi<{ settlements: SettlementRow[]; total: number; pages: number; stats: SettlementStats }>(`/api/admin/settlements?${p.toString()}`)
      setRows(d.settlements)
      setStats(d.stats)
      setTotal(d.total)
      setPages(d.pages)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [page, periodFilter, status])

  useEffect(() => { void load() }, [load])

  const generate = async () => {
    setGenerating(true)
    try {
      await fetchApi('/api/admin/settlements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period: genMonth, provider: genProvider }),
      })
      toast.success(tt('stlGenerated'))
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tt('stlGenerateFail'))
    } finally {
      setGenerating(false)
    }
  }

  const openReconcile = (s: SettlementRow) => {
    setReconcileRow(s)
    setRActual(String(s.actual))
    setRAdjust(String(s.adjustments))
    setRMissing(String(s.missingCount))
    setRNotes(s.notes ?? '')
  }

  const variance = reconcileRow
    ? Number(reconcileRow.expected) - (Number(rActual) || 0)
    : 0
  const willReconcile = Math.abs(variance) < 0.01

  const saveReconcile = async () => {
    if (!reconcileRow) return
    setSaving(true)
    try {
      await fetchApi(`/api/admin/settlements/${reconcileRow.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reconcile',
          actual: Number(rActual),
          adjustments: Number(rAdjust) || 0,
          missingCount: Number(rMissing) || 0,
          notes: rNotes,
        }),
      })
      toast.success(tt('stlReconciledT'))
      setReconcileRow(null)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tt('stlFail'))
    } finally {
      setSaving(false)
    }
  }

  const settle = async () => {
    if (!settleRow) return
    setSettling(true)
    try {
      const d = await fetchApi<{ updated: number }>(`/api/admin/settlements/${settleRow.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'settle' }),
      })
      toast.success(`${tt('stlSettledT')} · ${d.updated} ${tt('stlSettledCountSuffix')}`)
      setSettleRow(null)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tt('stlFail'))
    } finally {
      setSettling(false)
    }
  }

  const statusLabel = (s: string) => tt(STATUS_LABEL_KEY[s] ?? 'stlPendingChip')

  return (
    <div>
      <PageHeader
        title={tt('stlTitle')}
        description={tt('stlSubtitle')}
        icon={<Layers className="h-5 w-5" />}
      />

      {/* Generate bar */}
      <Card className="ilp-fade-up mb-4 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="space-y-1.5 lg:w-44">
            <Label className="text-xs font-medium">{tt('stlMonth')}</Label>
            <Input type="month" value={genMonth} max={currentMonth()} onChange={(e) => setGenMonth(e.target.value)} className="h-10" />
          </div>
          <div className="space-y-1.5 lg:w-44">
            <Label className="text-xs font-medium">{tt('stlProvider')}</Label>
            <Select value={genProvider} onValueChange={setGenProvider}>
              <SelectTrigger className="h-10 w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{tt('stlProviderAll')}</SelectItem>
                {['BKASH', 'NAGAD', 'ROCKET', 'UPAY'].map((p) => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button className="press h-10 gap-1.5" disabled={generating} onClick={() => void generate()}>
            <Plus className="h-4 w-4" /> {generating ? tt('stlGenerating') : tt('stlGenerate')}
          </Button>
          <p className="text-[11px] leading-relaxed text-muted-foreground lg:ml-2 lg:max-w-xs">{tt('stlGenerateHint')}</p>
        </div>
      </Card>

      {/* Cards */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label={tt('stlStatExpected')} value={formatBDT(stats?.expected ?? 0)} icon={<CalendarDays className="h-4 w-4" />} loading={loading} />
        <StatCard label={tt('stlStatActual')} value={formatBDT(stats?.actual ?? 0)} tone="text-success bg-success/10" icon={<CheckCircle2 className="h-4 w-4" />} loading={loading} />
        <StatCard label={tt('stlStatFees')} value={formatBDT(stats?.fees ?? 0)} tone="text-warning bg-warning/10" loading={loading} />
        <StatCard label={tt('stlStatAdjustments')} value={formatBDT(stats?.adjustments ?? 0)} tone="text-warning bg-warning/10" loading={loading} />
        <StatCard label={tt('stlStatMissing')} value={String(stats?.missing ?? 0)} tone="text-destructive bg-destructive/10" icon={<Scale className="h-4 w-4" />} loading={loading} />
      </div>

      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {['ALL', 'PENDING', 'RECONCILED', 'MISMATCH'].map((s) => (
            <button
              key={s}
              className={`press rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                (status || 'ALL') === s
                  ? 'border-primary/30 bg-primary/10 text-primary'
                  : 'border-border bg-card text-muted-foreground hover:bg-muted'
              }`}
              onClick={() => set({ status: s === 'ALL' ? null : s, page: null })}
            >
              {s === 'ALL' ? tt('stlFilterAll') : statusLabel(s)}
            </button>
          ))}
        </div>

        {error ? (
          <ErrorCard message={error} onRetry={() => void load()} />
        ) : loading ? (
          <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
        ) : rows.length === 0 ? (
          <EmptyState icon={<Layers className="h-7 w-7" />} title={tt('stlEmpty')} hint={tt('stlEmptyHint')} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-2 py-2 font-semibold">{tt('stlColPeriod')}</th>
                    <th className="px-2 py-2 font-semibold">{tt('stlColProvider')}</th>
                    <th className="px-2 py-2 font-semibold">{tt('stlColItems')}</th>
                    <th className="px-2 py-2 font-semibold">{tt('stlColExpected')}</th>
                    <th className="px-2 py-2 font-semibold">{tt('stlColFees')}</th>
                    <th className="px-2 py-2 font-semibold">{tt('stlColAdjustments')}</th>
                    <th className="px-2 py-2 font-semibold">{tt('stlColActual')}</th>
                    <th className="hidden px-2 py-2 font-semibold md:table-cell">{tt('stlColMissing')}</th>
                    <th className="px-2 py-2 font-semibold">{tt('stlColStatus')}</th>
                    <th className="px-2 py-2 text-right font-semibold">{tt('stlColActions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => {
                    const settled = s.settledCount > 0
                    return (
                      <tr key={s.id} className="border-b transition-colors last:border-0 hover:bg-muted/40">
                        <td className="px-2 py-2.5 font-bold tabular">{s.period}</td>
                        <td className="px-2 py-2.5">{s.provider === 'ALL' ? <span className="text-xs font-semibold">{tt('stlProviderAll')}</span> : <MfsBadge mfs={s.provider} />}</td>
                        <td className="px-2 py-2.5 text-xs tabular">
                          {s.itemCount}
                          {settled && <Badge variant="outline" className="ml-1.5 border-success/25 bg-success/10 px-1.5 text-[10px] text-success">{tt('stlSettledChip')}</Badge>}
                        </td>
                        <td className="px-2 py-2.5 tabular">{formatBDT(s.expected)}</td>
                        <td className="px-2 py-2.5 tabular text-muted-foreground">{formatBDT(s.fees)}</td>
                        <td className="px-2 py-2.5 tabular text-muted-foreground">{formatBDT(s.adjustments)}</td>
                        <td className="px-2 py-2.5 tabular font-semibold">{formatBDT(s.actual)}</td>
                        <td className={`hidden px-2 py-2.5 text-xs tabular md:table-cell ${s.missingCount > 0 ? 'font-bold text-destructive' : 'text-muted-foreground'}`}>{s.missingCount}</td>
                        <td className="px-2 py-2.5">
                          <Badge variant="outline" className={`whitespace-nowrap font-medium ${STATUS_TONE[s.status] ?? ''}`}>{statusLabel(s.status)}</Badge>
                        </td>
                        <td className="px-2 py-2.5">
                          <div className="flex items-center justify-end gap-1.5">
                            {!settled && s.status !== 'PENDING' && (
                              <Button size="sm" className="press h-8 gap-1 px-2 text-xs" onClick={() => setSettleRow(s)}>
                                <CheckCircle2 className="h-3.5 w-3.5" /> {tt('stlSettle')}
                              </Button>
                            )}
                            {!settled && (
                              <Button size="sm" variant="outline" className="press h-8 gap-1 px-2 text-xs" onClick={() => openReconcile(s)}>
                                <Scale className="h-3.5 w-3.5" /> {tt('stlReconcile')}
                              </Button>
                            )}
                            <a
                              href={`/api/admin/settlements/${s.id}/export`}
                              download
                              className="inline-flex h-8 items-center gap-1 rounded-md border px-2 text-xs font-medium transition-colors hover:bg-muted press"
                              aria-label={tt('stlExport')}
                            >
                              <Download className="h-3.5 w-3.5" /> {tt('stlExport')}
                            </a>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pages={pages} total={total} />
          </>
        )}
      </Card>

      {/* Reconcile dialog */}
      <Dialog open={!!reconcileRow} onOpenChange={(o) => { if (!o) setReconcileRow(null) }}>
        <DialogContent className="max-h-[85vh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{tt('stlReconcileTitle')}</DialogTitle>
            <DialogDescription>
              {reconcileRow ? `${reconcileRow.period} · ${reconcileRow.provider === 'ALL' ? tt('stlProviderAll') : reconcileRow.provider}` : ''}
            </DialogDescription>
          </DialogHeader>
          {reconcileRow && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 rounded-lg border p-3 text-xs">
                <div>
                  <p className="text-muted-foreground">{tt('stlColExpected')}</p>
                  <p className="mt-0.5 font-bold tabular">{formatBDT(reconcileRow.expected)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{tt('stlColItems')}</p>
                  <p className="mt-0.5 font-bold tabular">{reconcileRow.itemCount}</p>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">{tt('stlActual')}</Label>
                <Input type="number" min="0" step="0.01" value={rActual} onChange={(e) => setRActual(e.target.value)} className="h-10" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">{tt('stlAdjustments')}</Label>
                  <Input type="number" step="0.01" value={rAdjust} onChange={(e) => setRAdjust(e.target.value)} className="h-10" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">{tt('stlMissingCount')}</Label>
                  <Input type="number" min="0" step="1" value={rMissing} onChange={(e) => setRMissing(e.target.value)} className="h-10" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">{tt('stlNotes')}</Label>
                <Textarea value={rNotes} onChange={(e) => setRNotes(e.target.value)} placeholder={tt('stlNotesPh')} rows={2} />
              </div>
              <div className={`rounded-lg border p-2.5 text-xs ${willReconcile ? 'border-success/25 bg-success/5 text-success' : 'border-destructive/25 bg-destructive/5 text-destructive'}`}>
                <p className="font-semibold">{tt('stlVariance')}: {formatBDT(variance)}</p>
                <p className="mt-0.5 text-muted-foreground">
                  {willReconcile ? tt('stlWillReconcile') : tt('stlWillMismatch')} — {willReconcile ? tt('stlReconciledHint') : tt('stlMismatchHint')}
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" className="press" onClick={() => setReconcileRow(null)}>{tt('stlCancel')}</Button>
                <Button className="press" disabled={saving || rActual === ''} onClick={() => void saveReconcile()}>
                  {saving ? tt('stlSaving') : tt('stlSave')}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Settle confirm */}
      <AlertDialog open={!!settleRow} onOpenChange={(o) => { if (!o) setSettleRow(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tt('stlConfirmSettleTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {settleRow ? `${settleRow.period} · ${settleRow.provider === 'ALL' ? tt('stlProviderAll') : settleRow.provider} — ${settleRow.itemCount} ` : ''}
              {tt('stlConfirmSettleBody')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="press">{tt('stlCancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="press"
              disabled={settling}
              onClick={(e) => { e.preventDefault(); void settle() }}
            >
              {tt('stlConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
