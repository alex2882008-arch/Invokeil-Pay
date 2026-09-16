'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader, EmptyState, ErrorCard } from './ui-bits'
import { useLang } from '@/lib/i18n'
import { IMP_EN, IMP_BN } from '@/lib/i18n/imports'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { formatDateTime } from '@/lib/format'
import { Upload, FileDown, Users, FileText, Play, Trash2, Eye, RotateCcw, CheckCircle2, XCircle, Inbox } from 'lucide-react'

// ── i18n helper ──────────────────────────────────────────────────────────────

function useImpT() {
  const { t, lang } = useLang()
  return useCallback((k: string) => {
    const v = t(k)
    if (v && v !== k) return v
    return (lang === 'bn' ? IMP_BN[k] : IMP_EN[k]) ?? IMP_EN[k] ?? k
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

type ImportError = { row: number; reason: string }

type ImportResult = {
  id: string
  type: string
  total: number
  processed: number
  failed: number
  errors: ImportError[]
}

type ImportJob = {
  id: string
  type: string
  fileName: string | null
  status: string
  total: number
  processed: number
  failed: number
  createdAt: string
}

type ImportJobDetail = ImportJob & { errorLog: ImportError[] }

const TEMPLATES: Record<string, string> = {
  CUSTOMERS: 'name,email,phone\nRahim Uddin,rahim@example.com,01712345678\nKarim Ahmed,karim@example.com,01898765432',
  INVOICES: 'title,customer_name,customer_email,total,due_date\nWebsite design,Acme Corp,billing@acme.test,15000,2025-12-31\nHosting renewal,Acme Corp,billing@acme.test,3500,2026-01-15',
}

// ── main view ────────────────────────────────────────────────────────────────

export function ImportsView() {
  const t = useImpT()
  const [type, setType] = useState<'CUSTOMERS' | 'INVOICES'>('CUSTOMERS')
  const [csv, setCsv] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)

  const [history, setHistory] = useState<ImportJob[] | null>(null)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [detail, setDetail] = useState<ImportJobDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const fileRef = useRef<HTMLInputElement>(null)

  const loadHistory = useCallback(async () => {
    try {
      setHistoryError(null)
      const d = await getJSON<{ items: ImportJob[] }>('/api/admin/imports')
      setHistory(d.items)
    } catch (e) {
      setHistoryError(e instanceof Error ? e.message : 'Failed to load')
    }
  }, [])

  useEffect(() => { loadHistory() }, [loadHistory])

  const rowCount = useMemo(() => {
    if (!csv.trim()) return 0
    const lines = csv.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim() !== '')
    return Math.max(0, lines.length - 1)
  }, [csv])

  function onPickFile(f: File | null) {
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => {
      setCsv(String(reader.result ?? ''))
      setFileName(f.name)
      setResult(null)
      toast.success(`${f.name}`)
    }
    reader.onerror = () => toast.error(t('impNeedCsv'))
    reader.readAsText(f)
  }

  function downloadTemplate() {
    const content = TEMPLATES[type] ?? ''
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `invokeil-${type.toLowerCase()}-template.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  function reset() {
    setCsv('')
    setFileName(null)
    setResult(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function runImport() {
    if (!csv.trim()) {
      toast.error(t('impNeedCsv'))
      return
    }
    setRunning(true)
    try {
      const r = await sendJSON<ImportResult>('/api/admin/imports', { type, csv, fileName })
      setResult(r)
      toast.success(`${t('impDone')} — ${r.processed} ${t('impProcessed')}${r.failed > 0 ? ` · ${r.failed} ${t('impFailed')}` : ''}`)
      loadHistory()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('impImpFailedToast'))
    } finally {
      setRunning(false)
    }
  }

  async function openDetail(job: ImportJob) {
    setDetailLoading(true)
    setDetail({ ...job, errorLog: [] })
    try {
      const d = await getJSON<ImportJobDetail>(`/api/admin/imports/${job.id}`)
      setDetail(d)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('impLoadDetailFail'))
      setDetail(null)
    } finally {
      setDetailLoading(false)
    }
  }

  async function deleteJob(id: string) {
    try {
      await sendJSON(`/api/admin/imports/${id}`, undefined, 'DELETE')
      toast.success(t('impDeleted'))
      if (detail?.id === id) setDetail(null)
      loadHistory()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('impImpFailedToast'))
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title={t('impTitle')}
        description={t('impSub')}
        icon={<Upload className="h-5 w-5" />}
        actions={
          <Button variant="outline" size="sm" className="press h-9 gap-1.5" onClick={downloadTemplate}>
            <FileDown className="h-3.5 w-3.5" /> {t('impTemplate')}
          </Button>
        }
      />

      {/* New import */}
      <Card className="ilp-fade-up">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">{t('impNew')}</CardTitle>
          <p className="text-xs text-muted-foreground">{t('impType')}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Type cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(['CUSTOMERS', 'INVOICES'] as const).map((tp, i) => (
              <button
                key={tp}
                type="button"
                className={cn(
                  'ilp-fade-up press rounded-xl border p-4 text-left transition-colors',
                  type === tp ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-border hover:bg-muted/40'
                )}
                style={{ animationDelay: `${i * 50}ms` }}
                onClick={() => { setType(tp); setResult(null) }}
                aria-pressed={type === tp}
              >
                <div className="flex items-center gap-2.5">
                  <div className={cn('rounded-lg p-2', type === tp ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
                    {tp === 'CUSTOMERS' ? <Users className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-foreground">{tp === 'CUSTOMERS' ? t('impTypeCustomers') : t('impTypeInvoices')}</p>
                    <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{tp === 'CUSTOMERS' ? t('impTypeCustomersDesc') : t('impTypeInvoicesDesc')}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* CSV paste + file */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor="imp-csv">{t('impPaste')}</Label>
              <div className="flex items-center gap-2">
                <span className={cn('text-xs tabular', rowCount > 0 ? 'font-semibold text-primary' : 'text-muted-foreground')}>
                  {t('impRows')}: {rowCount}
                </span>
                <Button variant="outline" size="sm" className="press h-8 gap-1.5" onClick={downloadTemplate}>
                  <FileDown className="h-3.5 w-3.5" /> {type === 'CUSTOMERS' ? t('impTemplateCustomers') : t('impTemplateInvoices')}
                </Button>
              </div>
            </div>
            <Textarea
              id="imp-csv"
              value={csv}
              onChange={(e) => { setCsv(e.target.value); setFileName(null); setResult(null) }}
              placeholder={`name,email,phone\nRahim Uddin,rahim@example.com,01712345678`}
              rows={8}
              className="font-mono text-xs"
            />
            <p className="text-[11px] text-muted-foreground">{t('impPasteHint')}</p>
          </div>

          <div className="flex flex-col gap-2 rounded-lg border border-dashed p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-foreground">{t('impFile')}</p>
              <p className="text-[11px] text-muted-foreground">{t('impFileHint')}</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv,text/plain"
                className="sr-only"
                id="imp-file"
                onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
              />
              <Button variant="outline" size="sm" className="press h-9 gap-1.5" onClick={() => fileRef.current?.click()}>
                <FileText className="h-3.5 w-3.5" /> {fileName ?? 'CSV'}
              </Button>
              {csv && (
                <Button variant="ghost" size="sm" className="press h-9 gap-1.5 text-muted-foreground" onClick={reset}>
                  <RotateCcw className="h-3.5 w-3.5" /> {t('impClear')}
                </Button>
              )}
              <Button className="press h-9 gap-1.5" onClick={runImport} disabled={running || !csv.trim()}>
                <Play className="h-3.5 w-3.5" /> {running ? t('impRunning') : t('impRun')}
              </Button>
            </div>
          </div>

          {/* Result */}
          {result && (
            <div className="ilp-fade-up space-y-3 rounded-xl border bg-background/50 p-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-success" />
                <p className="text-sm font-bold text-foreground">{t('impDone')}</p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg border px-3 py-2.5 text-center">
                  <p className="text-lg font-bold tabular text-foreground">{result.total}</p>
                  <p className="text-[10px] text-muted-foreground">{t('impTotal')}</p>
                </div>
                <div className="rounded-lg border border-success/25 bg-success/5 px-3 py-2.5 text-center">
                  <p className="text-lg font-bold tabular text-success">{result.processed}</p>
                  <p className="text-[10px] text-muted-foreground">{t('impProcessed')}</p>
                </div>
                <div className={cn('rounded-lg border px-3 py-2.5 text-center', result.failed > 0 ? 'border-destructive/25 bg-destructive/5' : '')}>
                  <p className={cn('text-lg font-bold tabular', result.failed > 0 ? 'text-destructive' : 'text-foreground')}>{result.failed}</p>
                  <p className="text-[10px] text-muted-foreground">{t('impFailed')}</p>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">{t('impResultHint')}</p>
              {result.errors.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[420px] text-xs">
                    <thead>
                      <tr className="border-b text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                        <th className="py-2 pr-3 font-semibold">{t('impRowNum')}</th>
                        <th className="py-2 font-semibold">{t('impReason')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.errors.map((e, i) => (
                        <tr key={`${e.row}-${i}`} className="border-b last:border-0">
                          <td className="py-2 pr-3 font-semibold tabular text-foreground">{e.row}</td>
                          <td className="py-2 text-muted-foreground">{e.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="flex items-center gap-1.5 text-xs font-semibold text-success"><CheckCircle2 className="h-3.5 w-3.5" /> {t('impNoErrors')}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* History */}
      <Card className="ilp-fade-up" style={{ animationDelay: '80ms' }}>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">{t('impHistory')}</CardTitle>
          <p className="text-xs text-muted-foreground">{t('impHistoryHint')}</p>
        </CardHeader>
        <CardContent>
          {history === null ? (
            <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>
          ) : historyError ? (
            <ErrorCard message={historyError} onRetry={loadHistory} />
          ) : history.length === 0 ? (
            <EmptyState icon={<Inbox className="h-6 w-6" />} title={t('impNoHistory')} hint={t('impNoHistoryHint')} />
          ) : (
            <div className="space-y-2">
              {history.map((job, i) => (
                <div key={job.id} className="ilp-fade-up flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-background/50 px-3 py-2.5" style={{ animationDelay: `${i * 40}ms` }}>
                  <div className={cn('rounded-lg p-2', job.type === 'CUSTOMERS' ? 'bg-primary/10 text-primary' : 'bg-success/10 text-success')}>
                    {job.type === 'CUSTOMERS' ? <Users className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {job.type === 'CUSTOMERS' ? t('impTypeCustomers') : t('impTypeInvoices')}
                      {job.fileName && <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">· {job.fileName}</span>}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {formatDateTime(job.createdAt)} · {t('impProcessed')} <span className="font-semibold text-success tabular">{job.processed}</span>
                      {job.failed > 0 && <> · {t('impFailed')} <span className="font-semibold text-destructive tabular">{job.failed}</span></>}
                      {' '}/{ job.total} {t('impTotal')}
                    </p>
                  </div>
                  <Badge variant="outline" className={cn(
                    'text-[10px] font-bold',
                    job.status === 'DONE' ? 'border-success/30 bg-success/10 text-success' : job.status === 'FAILED' ? 'border-destructive/30 bg-destructive/10 text-destructive' : 'border-border bg-muted text-muted-foreground'
                  )}>
                    {job.status}
                  </Badge>
                  <Button size="sm" variant="outline" className="press h-8 gap-1.5" onClick={() => openDetail(job)}>
                    <Eye className="h-3.5 w-3.5" /> {t('impView')}
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="icon" variant="ghost" className="press h-8 w-8 text-muted-foreground hover:text-destructive" aria-label={t('impDelete')}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t('impDeleteMsg')}</AlertDialogTitle>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="press">{t('impClose')}</AlertDialogCancel>
                        <AlertDialogAction className="press bg-destructive text-white hover:bg-destructive/90" onClick={() => deleteJob(job.id)}>{t('impDelete')}</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail dialog */}
      <Dialog open={!!detail} onOpenChange={(v) => { if (!v) setDetail(null) }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('impDetailTitle')}</DialogTitle>
            <DialogDescription>
              {detail && (
                <>
                  {detail.type === 'CUSTOMERS' ? t('impTypeCustomers') : t('impTypeInvoices')} · {formatDateTime(detail.createdAt)} · {detail.fileName || t('impFileNameManual')}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg border px-3 py-2.5 text-center">
                  <p className="text-lg font-bold tabular text-foreground">{detail.total}</p>
                  <p className="text-[10px] text-muted-foreground">{t('impTotal')}</p>
                </div>
                <div className="rounded-lg border border-success/25 bg-success/5 px-3 py-2.5 text-center">
                  <p className="text-lg font-bold tabular text-success">{detail.processed}</p>
                  <p className="text-[10px] text-muted-foreground">{t('impProcessed')}</p>
                </div>
                <div className="rounded-lg border px-3 py-2.5 text-center">
                  <p className={cn('text-lg font-bold tabular', detail.failed > 0 ? 'text-destructive' : 'text-foreground')}>{detail.failed}</p>
                  <p className="text-[10px] text-muted-foreground">{t('impFailed')}</p>
                </div>
              </div>
              {detailLoading ? (
                <Skeleton className="h-24 w-full rounded-lg" />
              ) : (detail.errorLog?.length ?? 0) > 0 ? (
                <div className="overflow-x-auto">
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t('impErrorLog')}</p>
                  <table className="w-full min-w-[420px] text-xs">
                    <thead>
                      <tr className="border-b text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                        <th className="py-2 pr-3 font-semibold">{t('impRowNum')}</th>
                        <th className="py-2 font-semibold">{t('impReason')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.errorLog.map((e, i) => (
                        <tr key={`${e.row}-${i}`} className="border-b last:border-0">
                          <td className="py-2 pr-3 font-semibold tabular text-foreground">{e.row}</td>
                          <td className="py-2 text-muted-foreground">{e.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="flex items-center gap-1.5 rounded-lg border border-success/25 bg-success/5 px-3 py-2.5 text-xs font-semibold text-success">
                  <XCircle className="h-3.5 w-3.5" /> {t('impNoErrors')}
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" className="press" onClick={() => setDetail(null)}>{t('impClose')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
