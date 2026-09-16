'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  TerminalSquare, KeyRound, Webhook, ScrollText, FlaskConical, Code2, Send, Play,
  RefreshCw, History, Eye, ShieldCheck, Timer, CircleDot, ExternalLink,
} from 'lucide-react'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PageHeader, StatCard, EmptyState, ErrorCard, CopyButton, DetailRow } from './ui-bits'
import { useLang } from '@/lib/i18n'
import { DEVC_EN, DEVC_BN } from '@/lib/i18n/developer-console'
import { useUrlState } from '@/hooks/use-url-state'
import { timeAgo, formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'

// ── i18n helper (module dict fallback until wired into i18n.tsx) ─────────────

function useDevcT() {
  const { t, lang } = useLang()
  return useCallback(
    (k: string) => {
      const v = t(k)
      if (v && v !== k) return v
      return (lang === 'bn' ? DEVC_BN[k] : DEVC_EN[k]) ?? DEVC_EN[k] ?? k
    },
    [t, lang],
  )
}

// ── fetch helpers ────────────────────────────────────────────────────────────

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' })
  const j = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
  return j as T
}

async function sendJSON<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
  const j = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
  return j as T
}

// ── types ────────────────────────────────────────────────────────────────────

interface StoreKeyRow {
  id: string
  name: string
  prefix: string
  scopes: string[]
  sandbox: boolean
  active: boolean
}
interface ConsoleStore {
  id: string
  name: string
  active: boolean
  sandbox: boolean
  master: { prefix: string; scopes: string[] }
  keys: StoreKeyRow[]
  keyCount: number
}
interface ConsoleEndpoint {
  id: string
  url: string
  events: string
  active: boolean
  storeId: string
  storeName: string
}
interface ConsoleLedgerRow {
  id: string
  type: string
  status: string
  subjectRef: string | null
  createdAt: string
}
interface ConsoleData {
  appMode: 'SANDBOX' | 'PRODUCTION'
  stores: ConsoleStore[]
  endpoints: ConsoleEndpoint[]
  stats: {
    d24: { success: number; failed: number; pending: number }
    successRate: number | null
    counts: { keys: number; endpoints: number; eventsProcessed: number; eventsDeduped: number }
  }
  ledger: ConsoleLedgerRow[]
}

interface ScenarioCat {
  key: string
  label: string
  description: string
}
interface SandboxStep {
  step: string
  detail: string
  at: string
}
interface SandboxResult {
  scenario: string
  ok: boolean
  steps: SandboxStep[]
  checkoutToken?: string
  trxId?: string
}

interface InspectorRow {
  kind: 'ledger' | 'delivery'
  id: string
  type?: string
  event?: string
  status: string
  subjectRef?: string | null
  httpCode?: number | null
  attempts?: number
  storeName?: string
  createdAt: string
}

interface DetailRecord {
  payload: unknown
  [k: string]: unknown
}

const WEBHOOK_EVENT_LIST = [
  'checkout.paid', 'checkout.created', 'checkout.cancelled', 'invoice.paid',
  'payment_link.paid', 'transaction.matched', 'transaction.reversed', 'device.online', 'test',
]

const KNOWN_PATHS = [
  '/api/admin/stats',
  '/api/admin/transactions',
  '/api/admin/customers',
  '/api/admin/checkouts',
  '/api/admin/invoices',
  '/api/admin/links',
  '/api/admin/gateways',
  '/api/admin/devices',
  '/api/admin/stores',
  '/api/admin/webhooks',
  '/api/admin/automations',
  '/api/admin/risk/rules',
  '/api/admin/operations',
  '/api/admin/accounting',
  '/api/admin/reports?range=7d',
  '/api/admin/brands',
  '/api/admin/settings',
  '/api/admin/flags',
  '/api/admin/incidents',
  '/api/admin/kyc',
]

// ── small shared pieces ──────────────────────────────────────────────────────

function pretty(x: unknown): string {
  if (x === null || x === undefined) return '—'
  if (typeof x === 'string') {
    try {
      return JSON.stringify(JSON.parse(x), null, 2)
    } catch {
      return x
    }
  }
  try {
    return JSON.stringify(x, null, 2)
  } catch {
    return String(x)
  }
}

const STATUS_TONE: Record<string, string> = {
  SUCCESS: 'bg-success/10 text-success border-success/25',
  PROCESSED: 'bg-success/10 text-success border-success/25',
  FAILED: 'bg-destructive/10 text-destructive border-destructive/25',
  PENDING: 'bg-muted text-muted-foreground border-border',
  RECEIVED: 'bg-muted text-muted-foreground border-border',
  DEDUPED: 'bg-warning/15 text-amber-700 dark:text-amber-400 border-warning/30',
}

function StatusChip({ status, className }: { status: string; className?: string }) {
  return (
    <Badge variant="outline" className={cn('font-medium', STATUS_TONE[status] ?? 'bg-muted text-muted-foreground border-border', className)}>
      {status}
    </Badge>
  )
}

function httpTone(code: number | null | undefined): string {
  if (code == null) return 'bg-muted text-muted-foreground border-border'
  if (code < 300) return 'bg-success/10 text-success border-success/25'
  if (code < 500) return 'bg-warning/15 text-amber-700 dark:text-amber-400 border-warning/30'
  return 'bg-destructive/10 text-destructive border-destructive/25'
}

function CodeBlock({ code }: { code: string }) {
  return (
    <div className="relative">
      <pre className="nice-scroll max-h-[440px] overflow-auto rounded-lg bg-muted p-4 pr-16 font-mono text-xs leading-relaxed text-foreground/90">
        {code}
      </pre>
      <div className="absolute right-2 top-2">
        <CopyButton value={code} compact />
      </div>
    </div>
  )
}

function SectionCard({ title, hint, children, className }: { title: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={cn('p-4 sm:p-6', className)}>
      <div className="mb-4">
        <h2 className="text-sm font-bold text-foreground sm:text-base">{title}</h2>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </Card>
  )
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={cn('whitespace-nowrap px-3 py-2.5 font-semibold', className)}>{children}</th>
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn('px-3 py-2.5 align-middle', className)}>{children}</td>
}

// ── Overview tab ─────────────────────────────────────────────────────────────

function OverviewTab({ tt }: { tt: (k: string) => string }) {
  const [data, setData] = useState<ConsoleData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const d = await getJSON<ConsoleData>('/api/admin/dev/console')
      setError(null)
      setData(d)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-56 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    )
  }
  if (error || !data) return <ErrorCard message={error ?? undefined} onRetry={load} />

  const events24h = data.stats.d24.success + data.stats.d24.failed + data.stats.d24.pending

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={tt('devcStatKeys')} value={String(data.stats.counts.keys)} icon={<KeyRound className="h-4 w-4" />} />
        <StatCard label={tt('devcStatEndpoints')} value={String(data.stats.counts.endpoints)} icon={<Webhook className="h-4 w-4" />} tone="text-primary bg-primary/10" />
        <StatCard label={tt('devcStatEvents24h')} value={String(events24h)} icon={<ScrollText className="h-4 w-4" />} tone="text-emerald-600 bg-emerald-500/10" />
        <StatCard
          label={tt('devcStatSuccessRate')}
          value={data.stats.successRate != null ? `${data.stats.successRate}%` : '—'}
          icon={<ShieldCheck className="h-4 w-4" />}
          tone="text-amber-600 bg-amber-500/10"
        />
      </div>

      <SectionCard title={tt('devcStoresTitle')} hint={tt('devcStoresHint')} className="ilp-fade-up">
        {data.stores.length === 0 ? (
          <EmptyState icon={<KeyRound className="h-6 w-6" />} title={tt('devcNoStores')} hint={tt('devcNoStoresHint')} />
        ) : (
          <div className="nice-scroll overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <Th>{tt('devcStoreCol')}</Th>
                  <Th>{tt('devcKeyCol')}</Th>
                  <Th>{tt('devcScopesCol')}</Th>
                  <Th>{tt('devcModeCol')}</Th>
                  <Th>{tt('devcStatusCol')}</Th>
                </tr>
              </thead>
              <tbody>
                {data.stores.flatMap((s) => [
                  <tr key={`${s.id}-master`} className="border-b last:border-0 hover:bg-muted/30">
                    <Td className="font-semibold text-foreground">{s.name}</Td>
                    <Td className="font-mono text-xs text-muted-foreground">{s.master.prefix}</Td>
                    <Td>
                      <span className="text-xs text-muted-foreground">{s.master.scopes.join(', ')}</span>
                    </Td>
                    <Td>
                      {s.sandbox
                        ? <Badge variant="outline" className="bg-warning/15 text-amber-700 dark:text-amber-400 border-warning/30">{tt('devcSandbox')}</Badge>
                        : <Badge variant="outline" className="bg-success/10 text-success border-success/25">{tt('devcLive')}</Badge>}
                    </Td>
                    <Td><StatusChip status={s.active ? 'SUCCESS' : 'FAILED'} className={s.active ? '' : 'opacity-90'} /></Td>
                  </tr>,
                  ...s.keys.map((k) => (
                    <tr key={k.id} className="border-b bg-muted/20 last:border-0 hover:bg-muted/30">
                      <Td className="pl-8 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5">
                          <KeyRound className="h-3 w-3" />
                          {k.name} · <span className="font-medium text-foreground/70">{tt('devcKeyScoped')}</span>
                        </span>
                      </Td>
                      <Td className="font-mono text-xs text-muted-foreground">{k.prefix}</Td>
                      <Td><span className="text-xs text-muted-foreground">{k.scopes.join(', ')}</span></Td>
                      <Td>
                        {k.sandbox
                          ? <Badge variant="outline" className="bg-warning/15 text-amber-700 dark:text-amber-400 border-warning/30">{tt('devcSandbox')}</Badge>
                          : <Badge variant="outline" className="bg-success/10 text-success border-success/25">{tt('devcLive')}</Badge>}
                      </Td>
                      <Td><StatusChip status={k.active ? 'SUCCESS' : 'FAILED'} /></Td>
                    </tr>
                  )),
                ])}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard title={tt('devcEndpointsTitle')} className="ilp-fade-up" >
        {data.endpoints.length === 0 ? (
          <EmptyState icon={<Webhook className="h-6 w-6" />} title={tt('devcNoEndpoints')} hint={tt('devcNoEndpointsHint')} />
        ) : (
          <div className="nice-scroll max-h-96 overflow-y-auto overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b bg-muted/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground backdrop-blur">
                  <Th>{tt('devcStoreCol')}</Th>
                  <Th>{tt('devcUrlCol')}</Th>
                  <Th>{tt('devcEventsCol')}</Th>
                  <Th>{tt('devcStatusCol')}</Th>
                </tr>
              </thead>
              <tbody>
                {data.endpoints.map((e) => (
                  <tr key={e.id} className="border-b last:border-0 hover:bg-muted/30">
                    <Td className="font-semibold text-foreground">{e.storeName}</Td>
                    <Td className="max-w-[280px] truncate font-mono text-xs text-muted-foreground" >{e.url}</Td>
                    <Td>
                      <Badge variant="outline" className="bg-primary/10 text-primary border-primary/25 font-mono text-[10px]">
                        {e.events === '*' ? 'ALL' : e.events.split(',').length}
                      </Badge>
                    </Td>
                    <Td><StatusChip status={e.active ? 'SUCCESS' : 'FAILED'} /></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard title={tt('devcLedgerRecent')} className="ilp-fade-up">
        <div className="mb-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
          <Badge variant="outline" className="bg-success/10 text-success border-success/25">
            {tt('devcCountProcessed')}: {data.stats.counts.eventsProcessed}
          </Badge>
          <Badge variant="outline" className="bg-warning/15 text-amber-700 dark:text-amber-400 border-warning/30">
            {tt('devcCountDeduped')}: {data.stats.counts.eventsDeduped}
          </Badge>
        </div>
        {data.ledger.length === 0 ? (
          <EmptyState icon={<ScrollText className="h-6 w-6" />} title={tt('devcNoEvents')} hint={tt('devcNoEventsHint')} />
        ) : (
          <div className="nice-scroll max-h-96 overflow-y-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b bg-muted/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground backdrop-blur">
                  <Th>{tt('devcTypeCol')}</Th>
                  <Th>{tt('devcStatusCol')}</Th>
                  <Th>{tt('devcSubjectCol')}</Th>
                  <Th>{tt('devcTimeCol')}</Th>
                </tr>
              </thead>
              <tbody>
                {data.ledger.map((e) => (
                  <tr key={e.id} className="border-b last:border-0 hover:bg-muted/30">
                    <Td className="font-mono text-xs font-semibold text-foreground">{e.type}</Td>
                    <Td><StatusChip status={e.status} /></Td>
                    <Td className="max-w-[220px] truncate font-mono text-xs text-muted-foreground">{e.subjectRef ?? '—'}</Td>
                    <Td className="whitespace-nowrap text-xs text-muted-foreground">{timeAgo(e.createdAt)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  )
}

// ── API Explorer tab ─────────────────────────────────────────────────────────

interface ExplorerResp {
  status: number
  ok: boolean
  durationMs: number
  contentType: string
  body: unknown
  truncated: boolean
}

function ExplorerTab({ tt }: { tt: (k: string) => string }) {
  const [method, setMethod] = useState<'GET' | 'POST'>('GET')
  const [path, setPath] = useState('/api/admin/stats')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [resp, setResp] = useState<ExplorerResp | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const send = async () => {
    if (!path.trim().startsWith('/api/admin/')) {
      toast.error(tt('devcPathRequired'))
      return
    }
    if (method === 'POST' && body.trim()) {
      try {
        JSON.parse(body)
      } catch {
        toast.error(tt('devcInvalidJson'))
        return
      }
    }
    setSending(true)
    setErr(null)
    try {
      const r = await sendJSON<ExplorerResp>('/api/admin/dev/explorer', {
        method,
        path: path.trim(),
        body: method === 'POST' && body.trim() ? body : undefined,
      })
      setResp(r)
    } catch (e) {
      setResp(null)
      setErr(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Request builder */}
        <SectionCard title={tt('devcTabExplorer')} hint={tt('devcExplorerHint')} className="ilp-fade-up">
          <div className="space-y-4">
            <div className="grid grid-cols-[110px_1fr] gap-2 sm:grid-cols-[130px_1fr]">
              <div>
                <Label className="sr-only">{tt('devcMethod')}</Label>
                <Select value={method} onValueChange={(v) => setMethod(v as 'GET' | 'POST')}>
                  <SelectTrigger aria-label={tt('devcMethod')} className="h-9 w-full font-mono text-xs font-bold">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GET">GET</SelectItem>
                    <SelectItem value="POST">POST</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="sr-only">{tt('devcPath')}</Label>
                <Input
                  value={path}
                  onChange={(e) => setPath(e.target.value)}
                  list="devc-known-paths"
                  placeholder="/api/admin/…"
                  className="h-9 font-mono text-xs"
                  aria-label={tt('devcPath')}
                  onKeyDown={(e) => { if (e.key === 'Enter') send() }}
                />
                <datalist id="devc-known-paths">
                  {KNOWN_PATHS.map((p) => <option key={p} value={p} />)}
                </datalist>
              </div>
            </div>

            <div>
              <Label htmlFor="devc-body" className="text-xs text-muted-foreground">{tt('devcBody')}</Label>
              <Textarea
                id="devc-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder='{ "name": "…", "amount": 500 }'
                className="nice-scroll mt-1.5 min-h-[140px] font-mono text-xs"
                spellCheck={false}
              />
            </div>

            <Button onClick={send} disabled={sending} className="press h-10 w-full gap-2 sm:w-auto">
              {sending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {sending ? tt('devcSending') : tt('devcSend')}
            </Button>
          </div>
        </SectionCard>

        {/* Response viewer */}
        <SectionCard title={tt('devcResponse')} className="ilp-fade-up" >
          {!resp && !err && (
            <EmptyState icon={<TerminalSquare className="h-6 w-6" />} title={tt('devcNoResponse')} />
          )}
          {err && <ErrorCard message={err} onRetry={send} />}
          {resp && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={cn('font-mono text-xs font-bold', httpTone(resp.status))}>
                  {resp.status}
                </Badge>
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Timer className="h-3.5 w-3.5" /> {resp.durationMs} ms
                </span>
                {resp.truncated && (
                  <Badge variant="outline" className="bg-warning/15 text-amber-700 dark:text-amber-400 border-warning/30">
                    {tt('devcTruncated')}
                  </Badge>
                )}
                <span className="ml-auto">
                  <CopyButton value={pretty(resp.body)} compact />
                </span>
              </div>
              <pre className="nice-scroll max-h-[380px] overflow-auto rounded-lg bg-muted p-4 font-mono text-xs leading-relaxed text-foreground/90">
                {pretty(resp.body)}
              </pre>
            </div>
          )}
        </SectionCard>
      </div>

      <RequestInspector tt={tt} />
    </div>
  )
}

// ── Request inspector (under Explorer) ───────────────────────────────────────

function RequestInspector({ tt }: { tt: (k: string) => string }) {
  const [rows, setRows] = useState<InspectorRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<{ kind: string; record: DetailRecord } | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const d = await getJSON<{ ledger: InspectorRow[]; deliveries: InspectorRow[] }>('/api/admin/dev/requests?limit=12')
      const merged = [...d.ledger, ...d.deliveries].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      setRows(merged)
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const open = async (row: InspectorRow) => {
    setDetailLoading(true)
    try {
      const d = await sendJSON<{ kind: string; record: DetailRecord }>('/api/admin/dev/requests', { id: row.id })
      setDetail(d)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setDetailLoading(false)
    }
  }

  return (
    <SectionCard
      title={tt('devcInspectorTitle')}
      hint={tt('devcInspectorHint')}
      className="ilp-fade-up"
    >
      <div className="mb-3 flex justify-end">
        <Button variant="outline" size="sm" className="press h-8 gap-1.5" onClick={load}>
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} /> {tt('devcRefresh')}
        </Button>
      </div>
      {loading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-11 rounded-lg" />)}</div>
      ) : !rows || rows.length === 0 ? (
        <EmptyState icon={<History className="h-6 w-6" />} title={tt('devcInspectorEmpty')} />
      ) : (
        <div className="nice-scroll max-h-96 overflow-y-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="border-b bg-muted/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground backdrop-blur">
                <Th>{tt('devcSource')}</Th>
                <Th>{tt('devcTypeCol')}</Th>
                <Th>{tt('devcStatusCol')}</Th>
                <Th>{tt('devcTimeCol')}</Th>
                <Th className="text-right">{tt('devcActionsCol')}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.kind}-${r.id}`} className="border-b last:border-0 hover:bg-muted/30">
                  <Td>
                    <Badge variant="outline" className={cn('text-[10px]', r.kind === 'ledger' ? 'bg-primary/10 text-primary border-primary/25' : 'bg-emerald-500/10 text-emerald-600 border-emerald-500/25')}>
                      {r.kind === 'ledger' ? tt('devcKindLedger') : tt('devcKindDelivery')}
                    </Badge>
                  </Td>
                  <Td className="font-mono text-xs font-semibold text-foreground">{r.type ?? r.event}</Td>
                  <Td>
                    <div className="flex items-center gap-1.5">
                      <StatusChip status={r.status} />
                      {r.httpCode != null && (
                        <Badge variant="outline" className={cn('font-mono text-[10px]', httpTone(r.httpCode))}>{r.httpCode}</Badge>
                      )}
                    </div>
                  </Td>
                  <Td className="whitespace-nowrap text-xs text-muted-foreground">{timeAgo(r.createdAt)}</Td>
                  <Td className="text-right">
                    <Button variant="outline" size="sm" className="press h-7 gap-1 px-2 text-xs" disabled={detailLoading} onClick={() => open(r)}>
                      <Eye className="h-3 w-3" /> {tt('devcView')}
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!detail} onOpenChange={(o) => { if (!o) setDetail(null) }}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{detail?.kind === 'ledger' ? tt('devcEventDetail') : tt('devcDeliveryDetail')}</DialogTitle>
            <DialogDescription className="font-mono text-xs">
              {detail ? String((detail.kind === 'ledger' ? detail.record.type : detail.record.event) ?? '') : ''}
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="space-y-3">
              <div className="rounded-xl border px-3 py-1">
                {detail.kind === 'ledger' ? (
                  <>
                    <DetailRow label={tt('devcTypeCol')} value={<span className="font-mono">{String(detail.record.type ?? '—')}</span>} />
                    <DetailRow label={tt('devcStatusCol')} value={<StatusChip status={String(detail.record.status ?? '')} />} />
                    <DetailRow label={tt('devcSubjectCol')} value={<span className="font-mono">{String(detail.record.subjectRef ?? '—')}</span>} mono />
                    <DetailRow label={tt('devcIdempotency')} value={<span className="font-mono">{String(detail.record.idempotencyKey ?? '—')}</span>} mono />
                    <DetailRow label={tt('devcProcessedAt')} value={formatDateTime(detail.record.processedAt as string | null)} />
                    <DetailRow label={tt('devcTimeCol')} value={formatDateTime(detail.record.createdAt as string | null)} />
                  </>
                ) : (
                  <>
                    <DetailRow label={tt('devcEvent')} value={<span className="font-mono">{String(detail.record.event ?? '—')}</span>} />
                    <DetailRow label={tt('devcStatusCol')} value={<StatusChip status={String(detail.record.status ?? '')} />} />
                    <DetailRow label={tt('devcHttpCol')} value={detail.record.httpCode != null ? String(detail.record.httpCode) : '—'} mono />
                    <DetailRow label={tt('devcAttemptsCol')} value={String(detail.record.attempts ?? '—')} />
                    <DetailRow label={tt('devcStoreCol')} value={String(detail.record.storeName ?? '—')} />
                    <DetailRow label={tt('devcEndpoint')} value={<span className="break-all font-mono">{String(detail.record.endpointUrl ?? '—')}</span>} mono />
                    <DetailRow label={tt('devcSignature')} value={<span className="break-all font-mono">{String(detail.record.signature ?? '—')}</span>} mono />
                    <DetailRow label={tt('devcError')} value={String(detail.record.error ?? '—')} />
                    <DetailRow label={tt('devcRespondedAt')} value={formatDateTime(detail.record.responseAt as string | null)} />
                  </>
                )}
              </div>
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="text-xs font-semibold text-muted-foreground">{tt('devcPayload')}</p>
                  <CopyButton value={pretty(detail.record.payload)} compact />
                </div>
                <pre className="nice-scroll max-h-[300px] overflow-auto rounded-lg bg-muted p-4 font-mono text-xs leading-relaxed">
                  {pretty(detail.record.payload)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </SectionCard>
  )
}

// ── Webhooks tab ─────────────────────────────────────────────────────────────

interface SimResult {
  deliveryId: string
  status: string
  httpCode: number | null
  error?: string | null
}

function WebhooksTab({ tt }: { tt: (k: string) => string }) {
  const [stores, setStores] = useState<ConsoleStore[]>([])
  const [endpoints, setEndpoints] = useState<ConsoleEndpoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [storeId, setStoreId] = useState('')
  const [endpointId, setEndpointId] = useState('all')
  const [event, setEvent] = useState('checkout.paid')
  const [payload, setPayload] = useState('')
  const [sending, setSending] = useState(false)
  const [results, setResults] = useState<SimResult[] | null>(null)

  const [replayId, setReplayId] = useState('')
  const [replaying, setReplaying] = useState(false)

  const [deliveries, setDeliveries] = useState<InspectorRow[]>([])
  const [deliveriesLoading, setDeliveriesLoading] = useState(true)

  const loadBase = useCallback(async () => {
    setLoading(true)
    try {
      const d = await getJSON<ConsoleData>('/api/admin/dev/console')
      setStores(d.stores)
      setEndpoints(d.endpoints)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadDeliveries = useCallback(async () => {
    setDeliveriesLoading(true)
    try {
      const d = await getJSON<{ deliveries: InspectorRow[] }>('/api/admin/dev/requests?limit=15')
      setDeliveries(d.deliveries)
    } catch {
      setDeliveries([])
    } finally {
      setDeliveriesLoading(false)
    }
  }, [])

  useEffect(() => { loadBase(); loadDeliveries() }, [loadBase, loadDeliveries])

  const storeEndpoints = useMemo(
    () => endpoints.filter((e) => e.storeId === storeId),
    [endpoints, storeId],
  )

  const simulate = async () => {
    if (!storeId) {
      toast.error(tt('devcStoreRequired'))
      return
    }
    if (payload.trim()) {
      try {
        JSON.parse(payload)
      } catch {
        toast.error(tt('devcInvalidPayload'))
        return
      }
    }
    setSending(true)
    setResults(null)
    try {
      const r = await sendJSON<{ targets: number; results: SimResult[] }>('/api/admin/dev/webhook-simulate', {
        storeId,
        endpointId: endpointId === 'all' ? undefined : endpointId,
        event,
        payload: payload.trim() || undefined,
      })
      setResults(r.results)
      if (r.targets === 0) toast.warning(tt('devcNoResult'))
      else toast.success(`${tt('devcSimSent')} — ${r.targets}`)
      loadDeliveries()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setSending(false)
    }
  }

  const replay = async (id?: string) => {
    const target = (id ?? replayId).trim()
    if (!target) return
    setReplaying(true)
    try {
      const r = await sendJSON<{ replay: SimResult }>('/api/admin/dev/webhook-replay', { deliveryId: target })
      toast.success(`${tt('devcReplayed')} — ${r.replay.status}${r.replay.httpCode != null ? ` · ${r.replay.httpCode}` : ''}`)
      loadDeliveries()
    } catch (e) {
      toast.error(`${tt('devcReplayFailed')}: ${e instanceof Error ? e.message : ''}`)
    } finally {
      setReplaying(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    )
  }
  if (error) return <ErrorCard message={error} onRetry={loadBase} />

  return (
    <div className="space-y-5">
      <SectionCard title={tt('devcSimTitle')} hint={tt('devcSimHint')} className="ilp-fade-up">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <Label className="text-xs text-muted-foreground">{tt('devcStore')}</Label>
            <Select value={storeId} onValueChange={(v) => { setStoreId(v); setEndpointId('all') }}>
              <SelectTrigger className="mt-1.5 h-9" aria-label={tt('devcStore')}>
                <SelectValue placeholder={tt('devcStore')} />
              </SelectTrigger>
              <SelectContent>
                {stores.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}{s.active ? '' : ' (—)'}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">{tt('devcEndpoint')}</Label>
            <Select value={endpointId} onValueChange={setEndpointId} disabled={!storeId}>
              <SelectTrigger className="mt-1.5 h-9" aria-label={tt('devcEndpoint')}>
                <SelectValue placeholder={tt('devcEndpoint')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{tt('devcAllMatching')}</SelectItem>
                {storeEndpoints.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.url.replace(/^https?:\/\//, '').slice(0, 40)}{e.active ? '' : ' · ▴'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">{tt('devcEvent')}</Label>
            <Select value={event} onValueChange={setEvent}>
              <SelectTrigger className="mt-1.5 h-9 font-mono text-xs" aria-label={tt('devcEvent')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WEBHOOK_EVENT_LIST.map((ev) => (
                  <SelectItem key={ev} value={ev} className="font-mono text-xs">{ev}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-3">
          <Label htmlFor="devc-sim-payload" className="text-xs text-muted-foreground">{tt('devcCustomPayload')}</Label>
          <Textarea
            id="devc-sim-payload"
            value={payload}
            onChange={(e) => setPayload(e.target.value)}
            placeholder='{ "amount": 1500, "status": "PAID" }'
            className="nice-scroll mt-1.5 min-h-[90px] font-mono text-xs"
            spellCheck={false}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button onClick={simulate} disabled={sending || !storeId} className="press h-10 gap-2">
            {sending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sending ? tt('devcSending') : tt('devcSimSend')}
          </Button>
          {results && results.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {results.map((r) => (
                <Badge
                  key={r.deliveryId}
                  variant="outline"
                  className={cn('gap-1 font-mono text-[10px]', r.status === 'SUCCESS' ? 'bg-success/10 text-success border-success/25' : 'bg-destructive/10 text-destructive border-destructive/25')}
                >
                  <CircleDot className="h-3 w-3" /> {r.status}{r.httpCode != null ? ` · ${r.httpCode}` : ''}
                </Badge>
              ))}
            </div>
          )}
          {results && results.length === 0 && (
            <p className="text-xs text-muted-foreground">{tt('devcNoResult')}</p>
          )}
        </div>
      </SectionCard>

      <SectionCard title={tt('devcReplayTitle')} hint={tt('devcReplayHint')} className="ilp-fade-up">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={replayId}
            onChange={(e) => setReplayId(e.target.value)}
            placeholder="cma1b2c3d4e5f6…"
            className="h-9 flex-1 font-mono text-xs"
            aria-label={tt('devcDeliveryId')}
            onKeyDown={(e) => { if (e.key === 'Enter') replay() }}
          />
          <Button variant="outline" onClick={() => replay()} disabled={replaying || !replayId.trim()} className="press h-9 gap-1.5">
            <History className="h-4 w-4" /> {replaying ? tt('devcSending') : tt('devcReplay')}
          </Button>
        </div>
      </SectionCard>

      <SectionCard title={tt('devcDeliveriesTitle')} className="ilp-fade-up">
        {deliveriesLoading ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-11 rounded-lg" />)}</div>
        ) : deliveries.length === 0 ? (
          <EmptyState icon={<Webhook className="h-6 w-6" />} title={tt('devcNoDeliveries')} hint={tt('devcNoDeliveriesHint')} />
        ) : (
          <div className="nice-scroll max-h-96 overflow-y-auto overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b bg-muted/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground backdrop-blur">
                  <Th>{tt('devcEvent')}</Th>
                  <Th>{tt('devcStatusCol')}</Th>
                  <Th>{tt('devcHttpCol')}</Th>
                  <Th>{tt('devcAttemptsCol')}</Th>
                  <Th>{tt('devcTimeCol')}</Th>
                  <Th className="text-right">{tt('devcActionsCol')}</Th>
                </tr>
              </thead>
              <tbody>
                {deliveries.map((d) => (
                  <tr key={d.id} className="border-b last:border-0 hover:bg-muted/30">
                    <Td className="font-mono text-xs font-semibold text-foreground">{d.event}</Td>
                    <Td><StatusChip status={d.status} /></Td>
                    <Td>
                      <Badge variant="outline" className={cn('font-mono text-[10px]', httpTone(d.httpCode))}>
                        {d.httpCode ?? '—'}
                      </Badge>
                    </Td>
                    <Td className="tabular text-xs text-muted-foreground">{d.attempts ?? 1}</Td>
                    <Td className="whitespace-nowrap text-xs text-muted-foreground">{timeAgo(d.createdAt)}</Td>
                    <Td className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        className="press h-7 gap-1 px-2 text-xs"
                        disabled={replaying}
                        onClick={() => replay(d.id)}
                      >
                        <History className="h-3 w-3" /> {tt('devcReplay')}
                      </Button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  )
}

// ── Event Ledger tab ─────────────────────────────────────────────────────────

function LedgerTab({ tt }: { tt: (k: string) => string }) {
  const [data, setData] = useState<ConsoleData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [detail, setDetail] = useState<{ kind: string; record: DetailRecord } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const d = await getJSON<ConsoleData>('/api/admin/dev/console')
      setError(null)
      setData(d)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const types = useMemo(
    () => Array.from(new Set((data?.ledger ?? []).map((e) => e.type))).sort(),
    [data],
  )

  const filtered = useMemo(
    () =>
      (data?.ledger ?? []).filter(
        (e) =>
          (typeFilter === 'all' || e.type === typeFilter) &&
          (statusFilter === 'all' || e.status === statusFilter),
      ),
    [data, typeFilter, statusFilter],
  )

  const open = async (id: string) => {
    try {
      const d = await sendJSON<{ kind: string; record: DetailRecord }>('/api/admin/dev/requests', { id })
      setDetail(d)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load')
    }
  }

  return (
    <div className="space-y-4">
      <SectionCard
        title={tt('devcLedgerTitle')}
        hint={tt('devcLedgerHint')}
        className="ilp-fade-up"
      >
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="w-full sm:w-56">
            <Label className="text-xs text-muted-foreground">{tt('devcTypeCol')}</Label>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="mt-1.5 h-9" aria-label={tt('devcTypeCol')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{tt('devcAllTypes')}</SelectItem>
                {types.map((t) => (
                  <SelectItem key={t} value={t} className="font-mono text-xs">{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-full sm:w-48">
            <Label className="text-xs text-muted-foreground">{tt('devcStatusCol')}</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="mt-1.5 h-9" aria-label={tt('devcStatusCol')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{tt('devcAllStatuses')}</SelectItem>
                {['RECEIVED', 'PROCESSED', 'DEDUPED', 'FAILED'].map((s) => (
                  <SelectItem key={s} value={s} className="font-mono text-xs">{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" className="press h-9 gap-1.5 sm:ml-auto" onClick={load}>
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} /> {tt('devcRefresh')}
          </Button>
        </div>

        {loading ? (
          <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-11 rounded-lg" />)}</div>
        ) : error ? (
          <ErrorCard message={error} onRetry={load} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<ScrollText className="h-6 w-6" />}
            title={(data?.ledger ?? []).length === 0 ? tt('devcNoEvents') : tt('devcNoResults')}
            hint={(data?.ledger ?? []).length === 0 ? tt('devcNoEventsHint') : undefined}
          />
        ) : (
          <div className="nice-scroll max-h-[520px] overflow-y-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b bg-muted/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground backdrop-blur">
                  <Th>{tt('devcTypeCol')}</Th>
                  <Th>{tt('devcStatusCol')}</Th>
                  <Th>{tt('devcSubjectCol')}</Th>
                  <Th>{tt('devcTimeCol')}</Th>
                  <Th className="text-right">{tt('devcActionsCol')}</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <tr key={e.id} className="cursor-pointer border-b last:border-0 hover:bg-muted/30" onClick={() => open(e.id)}>
                    <Td className="font-mono text-xs font-semibold text-foreground">{e.type}</Td>
                    <Td><StatusChip status={e.status} /></Td>
                    <Td className="max-w-[220px] truncate font-mono text-xs text-muted-foreground">{e.subjectRef ?? '—'}</Td>
                    <Td className="whitespace-nowrap text-xs text-muted-foreground">{timeAgo(e.createdAt)}</Td>
                    <Td className="text-right">
                      <Button variant="ghost" size="sm" className="press h-7 gap-1 px-2 text-xs" onClick={(ev) => { ev.stopPropagation(); open(e.id) }}>
                        <Eye className="h-3 w-3" /> {tt('devcView')}
                      </Button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <Dialog open={!!detail} onOpenChange={(o) => { if (!o) setDetail(null) }}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{tt('devcEventDetail')}</DialogTitle>
            <DialogDescription className="font-mono text-xs">
              {detail ? String(detail.record.type ?? '') : ''}
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="space-y-3">
              <div className="rounded-xl border px-3 py-1">
                <DetailRow label={tt('devcTypeCol')} value={<span className="font-mono">{String(detail.record.type ?? '—')}</span>} />
                <DetailRow label={tt('devcStatusCol')} value={<StatusChip status={String(detail.record.status ?? '')} />} />
                <DetailRow label={tt('devcSubjectCol')} value={<span className="font-mono">{String(detail.record.subjectRef ?? '—')}</span>} mono />
                <DetailRow label={tt('devcIdempotency')} value={<span className="break-all font-mono">{String(detail.record.idempotencyKey ?? '—')}</span>} mono />
                <DetailRow label={tt('devcProcessedAt')} value={formatDateTime(detail.record.processedAt as string | null)} />
                <DetailRow label={tt('devcTimeCol')} value={formatDateTime(detail.record.createdAt as string | null)} />
              </div>
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="text-xs font-semibold text-muted-foreground">{tt('devcPayload')}</p>
                  <CopyButton value={pretty(detail.record.payload)} compact />
                </div>
                <pre className="nice-scroll max-h-[300px] overflow-auto rounded-lg bg-muted p-4 font-mono text-xs leading-relaxed">
                  {pretty(detail.record.payload)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── Sandbox tab ──────────────────────────────────────────────────────────────

function SandboxTab({ tt }: { tt: (k: string) => string }) {
  const [scenarios, setScenarios] = useState<ScenarioCat[]>([])
  const [gateways, setGateways] = useState<string[]>([])
  const [appMode, setAppMode] = useState<'SANDBOX' | 'PRODUCTION'>('SANDBOX')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [gateway, setGateway] = useState('any')
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [running, setRunning] = useState<string | null>(null)
  const [result, setResult] = useState<SandboxResult | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const d = await getJSON<{ scenarios: ScenarioCat[]; gateways: string[]; appMode: 'SANDBOX' | 'PRODUCTION' }>('/api/admin/dev/scenarios')
      setScenarios(d.scenarios)
      setGateways(d.gateways)
      setAppMode(d.appMode)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const run = async (scenario: string) => {
    const amountRaw = amounts[scenario]?.trim()
    if (amountRaw) {
      const n = Number(amountRaw)
      if (!Number.isFinite(n) || n <= 0) {
        toast.error(tt('devcAmount'))
        return
      }
    }
    setRunning(scenario)
    try {
      const r = await sendJSON<{ result: SandboxResult }>('/api/admin/dev/scenarios', {
        scenario,
        amount: amountRaw ? Number(amountRaw) : undefined,
        gatewayCode: gateway === 'any' ? undefined : gateway,
      })
      setResult(r.result)
      toast.success(r.result.ok ? tt('devcScenarioDone') : tt('devcScenarioFailed'))
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setRunning(null)
    }
  }

  return (
    <div className="space-y-5">
      {appMode === 'SANDBOX' && (
        <div className="ilp-fade-up flex items-center gap-4 overflow-hidden rounded-xl border border-warning/40 bg-gradient-to-r from-warning/15 via-warning/5 to-transparent p-4 sm:p-5">
          <div className="rounded-xl bg-warning/20 p-3 text-amber-600 dark:text-amber-400">
            <FlaskConical className="h-7 w-7" />
          </div>
          <div>
            <p className="text-base font-extrabold uppercase tracking-widest text-amber-700 dark:text-amber-400 sm:text-lg">
              {tt('devcRibbon')}
            </p>
            <p className="text-xs text-muted-foreground">{tt('devcSandboxHint')}</p>
          </div>
        </div>
      )}

      <SectionCard title={tt('devcSandboxTitle')} hint={tt('devcSandboxHint')} className="ilp-fade-up">
        <div className="mb-4 w-full sm:w-64">
          <Label className="text-xs text-muted-foreground">{tt('devcGateway')}</Label>
          <Select value={gateway} onValueChange={setGateway}>
            <SelectTrigger className="mt-1.5 h-9 font-mono text-xs" aria-label={tt('devcGateway')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">{tt('devcAnyGateway')}</SelectItem>
              {gateways.map((g) => (
                <SelectItem key={g} value={g} className="font-mono text-xs">{g}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-xl" />)}
          </div>
        ) : error ? (
          <ErrorCard message={error} onRetry={load} />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {scenarios.map((s, i) => (
              <Card
                key={s.key}
                className="ilp-fade-up flex flex-col gap-3 p-4"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <div>
                  <p className="text-sm font-bold text-foreground">{s.label}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{s.description}</p>
                </div>
                <div className="mt-auto space-y-2">
                  <Label htmlFor={`devc-amt-${s.key}`} className="text-xs text-muted-foreground">{tt('devcAmount')}</Label>
                  <div className="flex gap-2">
                    <Input
                      id={`devc-amt-${s.key}`}
                      value={amounts[s.key] ?? ''}
                      onChange={(e) => setAmounts((m) => ({ ...m, [s.key]: e.target.value }))}
                      type="number"
                      min={1}
                      placeholder="500 – 2500"
                      className="h-9 flex-1"
                      inputMode="numeric"
                    />
                    <Button
                      size="sm"
                      className="press h-9 gap-1.5"
                      disabled={running === s.key}
                      onClick={() => run(s.key)}
                    >
                      {running === s.key ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                      {running === s.key ? tt('devcRunning') : tt('devcRun')}
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </SectionCard>

      {result && (
        <SectionCard
          title={tt('devcResult')}
          className={cn('ilp-fade-up', result.ok ? 'border-success/30' : 'border-destructive/30')}
        >
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip status={result.ok ? 'SUCCESS' : 'FAILED'} />
              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/25 font-mono text-[10px]">
                {result.scenario}
              </Badge>
              {result.checkoutToken && (
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  {tt('devcCheckoutToken')}: <span className="font-mono font-semibold text-foreground">{result.checkoutToken}</span>
                  <CopyButton value={result.checkoutToken} compact />
                  <a
                    href={`/pay/${result.checkoutToken}`}
                    target="_blank"
                    rel="noreferrer"
                    className="press inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs font-medium text-primary hover:bg-primary/5"
                  >
                    <ExternalLink className="h-3 w-3" /> /pay
                  </a>
                </span>
              )}
              {result.trxId && (
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  {tt('devcTrxId')}: <span className="font-mono font-semibold text-foreground">{result.trxId}</span>
                  <CopyButton value={result.trxId} compact />
                </span>
              )}
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold text-muted-foreground">{tt('devcSteps')}</p>
              <ol className="relative space-y-3 border-l-2 border-muted pl-5">
                {result.steps.map((s, i) => (
                  <li key={`${s.step}-${i}`} className="relative">
                    <span
                      className={cn(
                        'absolute -left-[27px] top-1 h-3.5 w-3.5 rounded-full border-2 border-background',
                        result.ok ? 'bg-success' : 'bg-destructive',
                      )}
                    />
                    <p className="font-mono text-xs font-bold text-foreground">{s.step}</p>
                    <p className="text-xs text-muted-foreground">{s.detail}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground/70">{formatDateTime(s.at)}</p>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </SectionCard>
      )}
    </div>
  )
}

// ── Snippets tab ─────────────────────────────────────────────────────────────

interface Snippets {
  baseUrl: string
  curl: string
  js: string
  php: string
  python: string
  node: string
  webhookVerify: string
}

function SnippetsTab({ tt }: { tt: (k: string) => string }) {
  const [snip, setSnip] = useState<Snippets | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lang, setLang] = useState('curl')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const d = await getJSON<Snippets>('/api/admin/dev/snippets')
      setSnip(d)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const TABS: Array<{ key: string; label: string; code?: string }> = snip
    ? [
      { key: 'curl', label: tt('devcSnipCurl'), code: snip.curl },
      { key: 'js', label: tt('devcSnipJs'), code: snip.js },
      { key: 'php', label: tt('devcSnipPhp'), code: snip.php },
      { key: 'python', label: tt('devcSnipPython'), code: snip.python },
      { key: 'node', label: tt('devcSnipNode'), code: snip.node },
      { key: 'verify', label: tt('devcSnipVerify'), code: snip.webhookVerify },
    ]
    : []

  return (
    <SectionCard title={tt('devcSnipTitle')} hint={tt('devcSnipHint')} className="ilp-fade-up">
      {snip && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border bg-muted/30 p-3">
          <span className="text-xs font-semibold text-muted-foreground">{tt('devcBaseUrl')}:</span>
          <span className="font-mono text-xs font-semibold text-foreground">{snip.baseUrl}</span>
          <CopyButton value={snip.baseUrl} compact />
          <span className="ml-auto text-[11px] text-muted-foreground">{tt('devcSnipNote')}</span>
        </div>
      )}

      {loading ? (
        <Skeleton className="h-72 rounded-xl" />
      ) : error ? (
        <ErrorCard message={error} onRetry={load} />
      ) : (
        <Tabs value={lang} onValueChange={setLang}>
          <TabsList className="flex h-auto w-full flex-wrap gap-1 bg-muted/60 p-1">
            {TABS.map((t) => (
              <TabsTrigger key={t.key} value={t.key} className="text-xs data-[state=active]:bg-background">
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {TABS.map((t) => (
            <TabsContent key={t.key} value={t.key} className="mt-3">
              {t.code && <CodeBlock code={t.code} />}
            </TabsContent>
          ))}
        </Tabs>
      )}
    </SectionCard>
  )
}

// ── Root view ────────────────────────────────────────────────────────────────

export function DevelopersConsoleView() {
  const tt = useDevcT()
  const { get, set } = useUrlState()
  const tab = get('tab', 'overview')
  const validTabs = ['overview', 'explorer', 'webhooks', 'ledger', 'sandbox', 'snippets']
  const active = validTabs.includes(tab) ? tab : 'overview'

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title={tt('devcTitle')}
        description={tt('devcSub')}
        icon={<TerminalSquare className="h-5 w-5" />}
      />

      <Tabs value={active} onValueChange={(v) => set({ tab: v })}>
        <TabsList className="mb-5 grid h-auto w-full grid-cols-3 gap-1 bg-muted/60 p-1 sm:grid-cols-6">
          <TabsTrigger value="overview" className="text-xs data-[state=active]:bg-background">{tt('devcTabOverview')}</TabsTrigger>
          <TabsTrigger value="explorer" className="text-xs data-[state=active]:bg-background">{tt('devcTabExplorer')}</TabsTrigger>
          <TabsTrigger value="webhooks" className="text-xs data-[state=active]:bg-background">{tt('devcTabWebhooks')}</TabsTrigger>
          <TabsTrigger value="ledger" className="text-xs data-[state=active]:bg-background">{tt('devcTabLedger')}</TabsTrigger>
          <TabsTrigger value="sandbox" className="text-xs data-[state=active]:bg-background">{tt('devcTabSandbox')}</TabsTrigger>
          <TabsTrigger value="snippets" className="text-xs data-[state=active]:bg-background">{tt('devcTabSnippets')}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview"><OverviewTab tt={tt} /></TabsContent>
        <TabsContent value="explorer"><ExplorerTab tt={tt} /></TabsContent>
        <TabsContent value="webhooks"><WebhooksTab tt={tt} /></TabsContent>
        <TabsContent value="ledger"><LedgerTab tt={tt} /></TabsContent>
        <TabsContent value="sandbox"><SandboxTab tt={tt} /></TabsContent>
        <TabsContent value="snippets"><SnippetsTab tt={tt} /></TabsContent>
      </Tabs>
    </div>
  )
}
