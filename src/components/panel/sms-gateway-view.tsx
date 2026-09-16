'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { toast } from 'sonner'
import {
  Cloud, Landmark, Link2, MessageSquare, Phone, Smartphone, Trash2, Send, Webhook,
  ChevronRight, Route, CircleSlash, CheckCircle2, XCircle, Clock3, Coins, Inbox, FileText,
} from 'lucide-react'
import { fetchApi, ApiError } from '@/lib/api-client'
import { PageHeader, StatCard, EmptyState, ErrorCard, Pagination, SearchInput, StatusBadge } from './ui-bits'
import { useLang } from '@/lib/i18n'
import { useUrlState } from '@/hooks/use-url-state'
import { SMSP_EN, SMSP_BN } from '@/lib/i18n/sms-providers'
import { formatBDT, formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'

// ── Module-local i18n resolver (main agent wires SMSP_* into the global dicts later) ──
function useSmspT() {
  const { t, lang } = useLang()
  return useCallback(
    (k: string) => {
      const g = t(k)
      if (g !== k) return g
      return (lang === 'bn' ? SMSP_BN[k] : SMSP_EN[k]) ?? k
    },
    [t, lang],
  )
}

// ── Types ────────────────────────────────────────────────────────────────────

type PType = 'TWILIO' | 'TELNYX' | 'PLIVO' | 'TEXTBEE' | 'AWS_SNS' | 'CUSTOM'

interface ProvRow {
  id: string
  type: PType
  label: string
  priority: number
  enabled: boolean
  healthy: boolean
  sentCount: number
  failCount: number
  lastError: string | null
  lastCheckedAt: string | null
  configMasked: Record<string, string>
  configComplete: boolean
  missing: string[]
}

interface ChainAttempt {
  provider: string
  ok: boolean
  detail: string
  ms: number
  simulated?: boolean
}

interface SmsResult {
  ok: boolean
  provider: string
  status: string
  error?: string
  chain: ChainAttempt[]
  simulated: boolean
}

interface MsgRow {
  id: string
  toNumber: string
  body: string
  providerType: string | null
  providerMessageId: string | null
  status: string
  error: string | null
  cost: number
  attempts: number
  providerChain: string | null
  relatedType: string | null
  relatedId: string | null
  customerRef: string | null
  createdAt: string
  sentAt: string | null
}

interface MsgData {
  items: MsgRow[]
  total: number
  page: number
  pages: number
  stats: { sent: number; failed: number; costTotal: number; byProvider: Array<{ provider: string; count: number }> }
}

interface TplRow {
  id: string
  brandId: string | null
  channel: string
  event: string
  locale: string
  subject: string | null
  body: string
  enabled: boolean
}

// ── Provider catalog (client copy of the server metadata) ────────────────────

const P_TYPES: PType[] = ['TWILIO', 'TELNYX', 'PLIVO', 'TEXTBEE', 'AWS_SNS', 'CUSTOM']

const P_META: Record<PType, { name: string; tag: string; steps: string[]; color: string; icon: React.ReactNode; note?: string }> = {
  TWILIO: {
    name: 'smspTwName', tag: 'smspTwTag', steps: ['smspTwStep1', 'smspTwStep2', 'smspTwStep3'],
    color: '#F22F46', icon: <Phone className="h-5 w-5" />,
  },
  TELNYX: {
    name: 'smspTeName', tag: 'smspTeTag', steps: ['smspTeStep1', 'smspTeStep2', 'smspTeStep3'],
    color: '#0D662D', icon: <Landmark className="h-5 w-5" />,
  },
  PLIVO: {
    name: 'smspPlName', tag: 'smspPlTag', steps: ['smspPlStep1', 'smspPlStep2', 'smspPlStep3'],
    color: '#17CB4E', icon: <MessageSquare className="h-5 w-5" />,
  },
  TEXTBEE: {
    name: 'smspTbName', tag: 'smspTbTag', steps: ['smspTbStep1', 'smspTbStep2', 'smspTbStep3'],
    color: '#F59E0B', icon: <Smartphone className="h-5 w-5" />, note: 'smspTbNote',
  },
  AWS_SNS: {
    name: 'smspSnsName', tag: 'smspSnsTag', steps: ['smspSnsStep1', 'smspSnsStep2', 'smspSnsStep3'],
    color: '#FF9900', icon: <Cloud className="h-5 w-5" />,
  },
  CUSTOM: {
    name: 'smspCuName', tag: 'smspCuTag', steps: ['smspCuStep1', 'smspCuStep2', 'smspCuStep3'],
    color: '#64748B', icon: <Webhook className="h-5 w-5" />, note: 'smspCuTokens',
  },
}

const P_FIELDS: Record<PType, Array<{ key: string; i18n: string }>> = {
  TWILIO: [
    { key: 'accountSid', i18n: 'smspFAccountSid' },
    { key: 'authToken', i18n: 'smspFAuthToken' },
    { key: 'from', i18n: 'smspFFrom' },
  ],
  TELNYX: [
    { key: 'apiKey', i18n: 'smspFApiKey' },
    { key: 'from', i18n: 'smspFFrom' },
  ],
  PLIVO: [
    { key: 'authId', i18n: 'smspFAuthId' },
    { key: 'authToken', i18n: 'smspFAuthToken' },
    { key: 'from', i18n: 'smspFFrom' },
  ],
  TEXTBEE: [
    { key: 'deviceId', i18n: 'smspFDeviceId' },
    { key: 'apiKey', i18n: 'smspFApiKey' },
  ],
  AWS_SNS: [
    { key: 'accessKey', i18n: 'smspFAccessKey' },
    { key: 'secretKey', i18n: 'smspFSecretKey' },
    { key: 'region', i18n: 'smspFRegion' },
    { key: 'senderId', i18n: 'smspFSenderId' },
  ],
  CUSTOM: [
    { key: 'url', i18n: 'smspFUrl' },
    { key: 'bodyTemplate', i18n: 'smspFBodyTemplate' },
    { key: 'apiKey', i18n: 'smspFApiKey' },
  ],
}

// ── Template catalog ─────────────────────────────────────────────────────────

const TPL_EVENTS = [
  'PAYMENT_SUCCESS', 'PAYMENT_FAILED', 'PAYMENT_CANCEL', 'PAYMENT_DUE',
  'INVOICE_CREATED', 'INVOICE_OVERDUE', 'SUBSCRIPTION_RENEWED',
  'REFUND_PROCESSED', 'DISPUTE_OPENED', 'OTP', 'CUSTOM',
]

const EV_VARS: Record<string, string[]> = {
  PAYMENT_SUCCESS: ['customer_name', 'amount', 'trx_id', 'brand'],
  PAYMENT_FAILED: ['customer_name', 'amount', 'trx_id', 'brand'],
  PAYMENT_CANCEL: ['customer_name', 'amount', 'trx_id', 'brand'],
  PAYMENT_DUE: ['customer_name', 'amount', 'invoice_number', 'brand'],
  INVOICE_CREATED: ['customer_name', 'amount', 'invoice_number', 'brand'],
  INVOICE_OVERDUE: ['customer_name', 'amount', 'invoice_number', 'brand'],
  SUBSCRIPTION_RENEWED: ['customer_name', 'amount', 'plan_name', 'brand'],
  REFUND_PROCESSED: ['customer_name', 'amount', 'trx_id', 'brand'],
  DISPUTE_OPENED: ['customer_name', 'amount', 'trx_id', 'brand'],
  OTP: ['customer_name', 'brand'],
  CUSTOM: ['customer_name', 'amount', 'trx_id', 'brand'],
}

const SAMPLE_VARS: Record<string, string> = {
  customer_name: 'Rahim Uddin',
  amount: '1250.00 BDT',
  trx_id: 'TRX8K2N9Q4',
  invoice_number: 'INV-2025-0142',
  plan_name: 'Pro Monthly',
  brand: 'Invokeil Pay',
}

const STATUS_OPTIONS = ['QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'RECEIVED']

function parseChain(raw: string | null | undefined): ChainAttempt[] {
  if (!raw) return []
  try {
    const arr: unknown = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr.map((a) => {
      const o = (a ?? {}) as Record<string, unknown>
      return {
        provider: String(o.provider ?? '?'),
        ok: Boolean(o.ok),
        detail: String(o.detail ?? ''),
        ms: Number(o.ms ?? 0),
        simulated: Boolean(o.simulated),
      }
    })
  } catch {
    return []
  }
}

// ═════════════════════════════════════════════════════════════════════════════

export function SmsGatewayView() {
  const tr = useSmspT()
  const { get, getNum, set } = useUrlState()
  const tab = get('tab', 'providers')
  const status = get('status')
  const q = get('q')
  const page = getNum('page', 1)

  const [providers, setProviders] = useState<ProvRow[] | null>(null)
  const [provErr, setProvErr] = useState('')
  const [msg, setMsg] = useState<MsgData | null>(null)
  const [msgErr, setMsgErr] = useState('')
  const [brands, setBrands] = useState<Array<{ id: string; name: string }>>([])
  const [brandsUnavailable, setBrandsUnavailable] = useState(false)

  const loadProviders = useCallback(async () => {
    try {
      const d = await fetchApi<{ items: ProvRow[] }>('/api/admin/sms-providers')
      setProviders(d.items)
      setProvErr('')
    } catch (e) {
      setProvErr(e instanceof Error ? e.message : 'Failed')
    }
  }, [])

  const loadMessages = useCallback(async () => {
    try {
      const p = new URLSearchParams()
      if (status) p.set('status', status)
      if (q) p.set('q', q)
      p.set('page', String(page))
      const d = await fetchApi<MsgData>(`/api/admin/sms-messages?${p.toString()}`)
      setMsg(d)
      setMsgErr('')
    } catch (e) {
      setMsgErr(e instanceof Error ? e.message : 'Failed')
    }
  }, [status, q, page])

  useEffect(() => { const id = setTimeout(loadProviders, 0); return () => clearTimeout(id) }, [loadProviders])
  useEffect(() => { const id = setTimeout(loadMessages, 0); return () => clearTimeout(id) }, [loadMessages])

  // Brands API is owned by another module — degrade to Default-only on 404/error.
  useEffect(() => {
    fetchApi<unknown>('/api/admin/brands')
      .then((d) => {
        const arr = Array.isArray(d)
          ? d
          : ((d as { items?: unknown[] }).items ?? (d as { brands?: unknown[] }).brands ?? [])
        setBrands(
          arr
            .map((b) => {
              const o = (b ?? {}) as Record<string, unknown>
              return { id: String(o.id ?? ''), name: String(o.name ?? '') }
            })
            .filter((b) => b.id && b.name),
        )
      })
      .catch((e: unknown) => {
        setBrandsUnavailable(true)
        if (!(e instanceof ApiError && e.status === 404)) console.warn('brands list unavailable', e)
      })
  }, [])

  const enabledCount = useMemo(() => providers?.filter((p) => p.enabled).length ?? 0, [providers])

  return (
    <div>
      <PageHeader title={tr('smspTitle')} description={tr('smspDesc')} icon={<MessageSquare className="h-5 w-5" />} />

      <div className="stagger mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={tr('smspStatProviders')} value={`${enabledCount}/${P_TYPES.length}`} icon={<Send className="h-4 w-4" />} loading={!providers && !provErr} />
        <StatCard label={tr('smspStatSent')} value={String(msg?.stats.sent ?? 0)} icon={<CheckCircle2 className="h-4 w-4" />} tone="text-success bg-success/10" loading={!msg && !msgErr} />
        <StatCard label={tr('smspStatFailed')} value={String(msg?.stats.failed ?? 0)} icon={<XCircle className="h-4 w-4" />} tone="text-destructive bg-destructive/10" loading={!msg && !msgErr} />
        <StatCard label={tr('smspStatCost')} value={formatBDT(msg?.stats.costTotal ?? 0)} icon={<Coins className="h-4 w-4" />} tone="text-amber-600 bg-amber-500/10" loading={!msg && !msgErr} />
      </div>

      <Tabs value={tab} onValueChange={(v) => set({ tab: v })} className="gap-4">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 sm:w-auto">
          <TabsTrigger value="providers" className="press gap-1.5 px-3"><Send className="h-3.5 w-3.5" />{tr('smspTabProviders')}</TabsTrigger>
          <TabsTrigger value="templates" className="press gap-1.5 px-3"><FileText className="h-3.5 w-3.5" />{tr('smspTabTemplates')}</TabsTrigger>
          <TabsTrigger value="logs" className="press gap-1.5 px-3"><Inbox className="h-3.5 w-3.5" />{tr('smspTabLogs')}</TabsTrigger>
          <TabsTrigger value="failover" className="press gap-1.5 px-3"><Route className="h-3.5 w-3.5" />{tr('smspTabFailover')}</TabsTrigger>
        </TabsList>

        <TabsContent value="providers" className="mt-0">
          <ProvidersTab tr={tr} items={providers} err={provErr} reload={loadProviders} />
        </TabsContent>

        <TabsContent value="templates" className="mt-0">
          <TemplatesTab tr={tr} brands={brands} brandsUnavailable={brandsUnavailable} />
        </TabsContent>

        <TabsContent value="logs" className="mt-0">
          <LogsTab tr={tr} data={msg} err={msgErr} reload={loadMessages} />
        </TabsContent>

        <TabsContent value="failover" className="mt-0">
          <FailoverTab tr={tr} providers={providers} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ── Providers tab ────────────────────────────────────────────────────────────

function ProvidersTab({ tr, items, err, reload }: { tr: (k: string) => string; items: ProvRow[] | null; err: string; reload: () => Promise<void> }) {
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({})
  const [priorities, setPriorities] = useState<Record<string, string>>({})
  const [busyType, setBusyType] = useState<string | null>(null)
  const [delRow, setDelRow] = useState<ProvRow | null>(null)
  const [testTarget, setTestTarget] = useState<{ type: PType; id: string } | null>(null)
  const [testTo, setTestTo] = useState('')
  const [testBusy, setTestBusy] = useState(false)
  const [testRes, setTestRes] = useState<SmsResult | null>(null)

  // Seed the priority inputs once rows arrive (keep user edits otherwise).
  useEffect(() => {
    if (!items) return
    setPriorities((prev) => {
      const next = { ...prev }
      for (const r of items) if (next[r.type] === undefined) next[r.type] = String(r.priority)
      return next
    })
  }, [items])

  const rowFor = (t: PType) => items?.find((p) => p.type === t) ?? null
  const draftFor = (t: PType) => drafts[t] ?? {}

  const setDraft = (t: PType, key: string, v: string) =>
    setDrafts((prev) => ({ ...prev, [t]: { ...(prev[t] ?? {}), [key]: v } }))

  const save = async (t: PType) => {
    setBusyType(t)
    try {
      const prio = parseInt(priorities[t] ?? '', 10)
      await fetchApi('/api/admin/sms-providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: t,
          config: draftFor(t),
          ...(Number.isFinite(prio) ? { priority: prio } : {}),
        }),
      })
      setDrafts((prev) => ({ ...prev, [t]: {} }))
      toast.success(tr('smspSaved'))
      await reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusyType(null)
    }
  }

  const toggle = async (t: PType, enabled: boolean) => {
    try {
      await fetchApi('/api/admin/sms-providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: t, enabled }),
      })
      await reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tr('smspEnableFail'))
    }
  }

  const remove = async () => {
    if (!delRow) return
    try {
      await fetchApi(`/api/admin/sms-providers/${delRow.id}`, { method: 'DELETE' })
      toast.success(tr('smspDeleted'))
      setDelRow(null)
      await reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    }
  }

  const sendTest = async () => {
    if (!testTarget) return
    if (testTo.replace(/\D/g, '').length < 6) {
      toast.error(tr('smspNumRequired'))
      return
    }
    setTestBusy(true)
    setTestRes(null)
    try {
      const d = await fetchApi<{ result: SmsResult }>('/api/admin/sms-providers/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: testTarget.id, to: testTo }),
      })
      setTestRes(d.result)
      if (d.result.ok) toast.success(tr('smspTestOk'))
      else toast.error(`${tr('smspTestFail')}: ${d.result.error ?? ''}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tr('smspTestFail'))
    } finally {
      setTestBusy(false)
    }
  }

  if (err) return <ErrorCard message={err} onRetry={reload} />
  if (!items) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {P_TYPES.map((t) => (
          <Card key={t}><CardContent className="p-5"><div className="h-48 animate-pulse rounded-lg bg-muted/60" /></CardContent></Card>
        ))}
      </div>
    )
  }

  return (
    <div className="stagger grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {P_TYPES.map((t) => {
        const row = rowFor(t)
        const meta = P_META[t]
        const draft = draftFor(t)
        const prio = priorities[t] ?? ''
        return (
          <Card key={t} className="hover-lift flex flex-col" style={{ animationDelay: `${P_TYPES.indexOf(t) * 40}ms` }}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="rounded-xl p-2.5" style={{ backgroundColor: `${meta.color}1A`, color: meta.color }}>
                    {meta.icon}
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-bold text-foreground">{tr(meta.name)}</h3>
                    <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{tr(meta.tag)}</p>
                  </div>
                </div>
                <Switch
                  checked={row?.enabled ?? false}
                  onCheckedChange={(v) => toggle(t, v)}
                  aria-label={tr('smspEnabled')}
                />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {row ? (
                  <>
                    <Badge variant="outline" className={cn('text-[10px]', row.configComplete ? 'bg-success/10 text-success border-success/25' : 'bg-warning/10 text-amber-700 dark:text-amber-400 border-warning/30')}>
                      {row.configComplete ? tr('smspCfgReady') : tr('smspCfgIncomplete')}
                    </Badge>
                    <Badge variant="outline" className={cn('text-[10px]', row.healthy ? 'bg-success/10 text-success border-success/25' : 'bg-destructive/10 text-destructive border-destructive/25')}>
                      {row.healthy ? tr('smspHealthy') : tr('smspUnhealthy')}
                    </Badge>
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      {tr('smspSentCount')} {row.sentCount} · {tr('smspFailCount')} {row.failCount}
                    </span>
                  </>
                ) : (
                  <span className="text-[10px] text-muted-foreground">{tr('smspNoCredentials')}</span>
                )}
              </div>
              {row && !row.configComplete && row.missing.length > 0 && (
                <p className="mt-1.5 text-[10px] text-amber-700 dark:text-amber-400">{tr('smspMissing')} {row.missing.join(', ')}</p>
              )}
            </CardHeader>

            <CardContent className="flex-1 space-y-3.5 pb-3">
              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{tr('smspSetupGuide')}</p>
                <ol className="space-y-1.5">
                  {meta.steps.map((s, i) => (
                    <li key={s} className="flex items-start gap-2 text-xs leading-relaxed text-foreground/85">
                      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[9px] font-bold text-primary">{i + 1}</span>
                      {tr(s)}
                    </li>
                  ))}
                </ol>
                {meta.note && (
                  <p className="mt-2 rounded-lg border border-warning/30 bg-warning/5 px-2.5 py-1.5 text-[11px] font-medium leading-relaxed text-amber-700 dark:text-amber-400">
                    {tr(meta.note)}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 gap-2.5">
                {P_FIELDS[t].map((f) => (
                  <div key={f.key} className="space-y-1">
                    <Label className="text-xs">{tr(f.i18n)}</Label>
                    <Input
                      value={draft[f.key] ?? ''}
                      onChange={(e) => setDraft(t, f.key, e.target.value)}
                      placeholder={row?.configMasked[f.key] || '••••••'}
                      className="h-9 font-mono text-xs"
                      autoComplete="off"
                    />
                  </div>
                ))}
              </div>

              <div className="space-y-1">
                <Label className="text-xs">{tr('smspPriority')}</Label>
                <Input
                  type="number" min={1} max={999}
                  value={prio}
                  onChange={(e) => setPriorities((prev) => ({ ...prev, [t]: e.target.value }))}
                  className="h-9 w-24"
                  aria-label={tr('smspPriority')}
                />
                <p className="text-[10px] text-muted-foreground">{tr('smspPriorityHint')}</p>
              </div>

              {row?.lastError && (
                <p className="truncate text-[10px] text-destructive" title={row.lastError}>
                  {tr('smspLastError')}: {row.lastError}
                </p>
              )}
              {row?.lastCheckedAt && (
                <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Clock3 className="h-3 w-3" /> {tr('smspLastChecked')}: {formatDateTime(row.lastCheckedAt)}
                </p>
              )}
            </CardContent>

            <CardFooter className="flex-wrap gap-2 border-t pt-3">
              <Button size="sm" className="press h-8 gap-1.5" disabled={busyType === t} onClick={() => save(t)}>
                {busyType === t ? '…' : tr('smspSave')}
              </Button>
              <Button
                size="sm" variant="outline" className="press h-8 gap-1.5"
                disabled={!row?.id || !row?.enabled}
                onClick={() => { if (!row?.id) return; setTestTarget({ type: t, id: row.id }); setTestRes(null); setTestTo('') }}
              >
                <Send className="h-3.5 w-3.5" /> {tr('smspTestSend')}
              </Button>
              {row && (
                <Button size="sm" variant="ghost" className="press ml-auto h-8 gap-1.5 text-destructive hover:text-destructive" onClick={() => setDelRow(row)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </CardFooter>
          </Card>
        )
      })}

      {/* Test send dialog */}
      <Dialog open={!!testTarget} onOpenChange={(o) => !o && setTestTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{tr('smspTestTitle')} — {testTarget ? tr(P_META[testTarget.type].name) : ''}</DialogTitle>
            <DialogDescription>{tr('smspTestTo')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder={tr('smspTestToPh')} className="h-10 font-mono" inputMode="tel" />
            {testRes && (
              <div className="rounded-lg border bg-muted/40 p-3 text-xs">
                <p className="mb-1.5 font-semibold">
                  {testRes.ok ? '✅ ' : '❌ '}{tr('smspTestVia')}: {testRes.provider}
                  {testRes.simulated ? ` · ${tr('smspSimulated')}` : ''}
                </p>
                {testRes.chain.map((a, i) => (
                  <p key={i} className={cn('flex items-start gap-1.5 py-0.5', a.ok ? 'text-success' : 'text-destructive')}>
                    {a.ok ? <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0" /> : <XCircle className="mt-0.5 h-3 w-3 shrink-0" />}
                    <span className="break-all">{a.provider} — {a.detail} ({a.ms}{tr('smspLogMs')})</span>
                  </p>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" className="press" onClick={() => setTestTarget(null)}>✕</Button>
            <Button className="press gap-1.5" disabled={testBusy} onClick={sendTest}>
              <Send className="h-3.5 w-3.5" /> {testBusy ? '…' : tr('smspTestSend')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!delRow} onOpenChange={(o) => !o && setDelRow(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tr('smspDeleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{tr('smspDeleteHint')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="press">{tr('smspCancel')}</AlertDialogCancel>
            <AlertDialogAction className="press bg-destructive text-white hover:bg-destructive/90" onClick={remove}>{tr('smspDelete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ── Templates tab ────────────────────────────────────────────────────────────

function TemplatesTab({ tr, brands, brandsUnavailable }: { tr: (k: string) => string; brands: Array<{ id: string; name: string }>; brandsUnavailable: boolean }) {
  const [brandId, setBrandId] = useState('default')
  const [locale, setLocale] = useState<'en' | 'bn'>('en')
  const [tpls, setTpls] = useState<TplRow[] | null>(null)
  const [err, setErr] = useState('')

  const [edit, setEdit] = useState<{ event: string; tpl: TplRow | null } | null>(null)
  const [body, setBody] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testTo, setTestTo] = useState('')
  const [testBusy, setTestBusy] = useState(false)
  const [delOpen, setDelOpen] = useState(false)
  const taRef = useRef<HTMLTextAreaElement>(null)

  const load = useCallback(async () => {
    try {
      const d = await fetchApi<{ items: TplRow[] }>(`/api/admin/message-templates?channel=SMS&brandId=${encodeURIComponent(brandId)}`)
      setTpls(d.items)
      setErr('')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed')
    }
  }, [brandId])

  useEffect(() => { load() }, [load])

  const tplFor = (ev: string) => tpls?.find((x) => x.event === ev && x.locale === locale) ?? null

  const openEdit = (ev: string) => {
    const tpl = tplFor(ev)
    setEdit({ event: ev, tpl })
    setBody(tpl?.body ?? '')
    setEnabled(tpl?.enabled ?? true)
    setTestTo('')
    setDelOpen(false)
  }

  const insertVar = (v: string) => {
    const el = taRef.current
    const cur = body
    if (!el) { setBody(cur + v); return }
    const start = el.selectionStart ?? cur.length
    const end = el.selectionEnd ?? cur.length
    setBody(cur.slice(0, start) + v + cur.slice(end))
    requestAnimationFrame(() => {
      el.focus()
      el.selectionStart = el.selectionEnd = start + v.length
    })
  }

  const preview = useMemo(
    () => body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => SAMPLE_VARS[k] ?? `{{${k}}}`),
    [body],
  )

  const save = async () => {
    if (!edit) return
    if (!body.trim()) { toast.error(tr('smspBodyRequired')); return }
    setSaving(true)
    try {
      const d = await fetchApi<{ item: TplRow }>('/api/admin/message-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandId: brandId === 'default' ? null : brandId,
          channel: 'SMS',
          event: edit.event,
          locale,
          body,
          enabled,
        }),
      })
      setEdit({ ...edit, tpl: d.item })
      toast.success(tr('smspTplSaved'))
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setSaving(false)
    }
  }

  const sendTest = async () => {
    if (!edit?.tpl) { toast.error(tr('smspTplSaveFirst')); return }
    if (testTo.replace(/\D/g, '').length < 6) { toast.error(tr('smspNumRequired')); return }
    setTestBusy(true)
    try {
      const d = await fetchApi<{ result: SmsResult }>('/api/admin/message-templates/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: edit.tpl.id, to: testTo }),
      })
      if (d.result.ok) toast.success(tr('smspTplTestSent'))
      else toast.error(`${tr('smspTestFail')}: ${d.result.error ?? ''}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tr('smspTestFail'))
    } finally {
      setTestBusy(false)
    }
  }

  const remove = async () => {
    if (!edit?.tpl) return
    try {
      await fetchApi(`/api/admin/message-templates/${edit.tpl.id}`, { method: 'DELETE' })
      toast.success(tr('smspTplDeleted'))
      setEdit(null)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    }
  }

  if (err) return <ErrorCard message={err} onRetry={load} />

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="space-y-1">
          <Label className="text-xs">{tr('smspTplBrand')}</Label>
          <Select value={brandId} onValueChange={setBrandId}>
            <SelectTrigger className="h-9 w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="default">{tr('smspBrandDefault')}</SelectItem>
              {brands.map((b) => (
                <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{tr('smspLang')}</Label>
          <div className="flex overflow-hidden rounded-md border">
            {(['en', 'bn'] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLocale(l)}
                className={cn(
                  'press h-9 px-3.5 text-xs font-semibold',
                  locale === l ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted',
                )}
              >
                {l === 'en' ? tr('smspLocaleEn') : tr('smspLocaleBn')}
              </button>
            ))}
          </div>
        </div>
        {brandsUnavailable && (
          <p className="ml-auto max-w-56 text-[10px] leading-relaxed text-muted-foreground">{tr('smspBrandsUnavailable')}</p>
        )}
      </div>

      {/* Event grid */}
      {!tpls ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TPL_EVENTS.slice(0, 9).map((ev) => (
            <Card key={ev}><CardContent className="p-4"><div className="h-20 animate-pulse rounded-lg bg-muted/60" /></CardContent></Card>
          ))}
        </div>
      ) : (
        <div className="stagger grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TPL_EVENTS.map((ev, i) => {
            const tpl = tplFor(ev)
            return (
              <Card key={ev} className="hover-lift flex flex-col" style={{ animationDelay: `${i * 40}ms` }}>
                <CardContent className="flex-1 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-bold text-foreground">{tr(`smspEv${ev}`)}</h3>
                    {tpl ? (
                      <Badge variant="outline" className={cn('text-[10px]', tpl.enabled ? 'bg-success/10 text-success border-success/25' : 'bg-muted text-muted-foreground border-border')}>
                        {tpl.enabled ? tr('smspCfgReady') : tr('smspEnabled')} · {tpl.locale.toUpperCase()}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">{tr('smspTplNotSet')}</Badge>
                    )}
                  </div>
                  <p className="mt-2 line-clamp-2 min-h-8 text-xs leading-relaxed text-muted-foreground">
                    {tpl?.body ?? '—'}
                  </p>
                </CardContent>
                <div className="border-t p-3 pt-2.5">
                  <Button size="sm" variant="outline" className="press h-8 w-full gap-1.5" onClick={() => openEdit(ev)}>
                    {tpl ? tr('smspTplEditTitle') : tr('smspTplConfigure')} <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Edit dialog */}
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{tr('smspTplEditTitle')} — {edit ? tr(`smspEv${edit.event}`) : ''}</DialogTitle>
            <DialogDescription>
              {brandId === 'default' ? tr('smspBrandDefault') : brands.find((b) => b.id === brandId)?.name ?? ''}
              {' · '}
              {locale === 'en' ? tr('smspLocaleEn') : tr('smspLocaleBn')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2.5">
              <div>
                <p className="text-xs font-semibold">{tr('smspTplEnabled')}</p>
                <p className="text-[10px] text-muted-foreground">{tr('smspTplDisabledHint')}</p>
              </div>
              <Switch checked={enabled} onCheckedChange={setEnabled} aria-label={tr('smspTplEnabled')} />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">{tr('smspTplBody')}</Label>
              <Textarea ref={taRef} value={body} onChange={(e) => setBody(e.target.value)} rows={5} placeholder={tr('smspTplBodyPh')} className="text-sm" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">{tr('smspTplVars')}</Label>
              <div className="flex flex-wrap gap-1.5">
                {(edit ? EV_VARS[edit.event] ?? [] : []).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => insertVar(`{{${v}}}`)}
                    className="press rounded-md border bg-primary/5 px-2 py-1 font-mono text-[10px] font-semibold text-primary hover:bg-primary/10"
                  >
                    {`{{${v}}}`}
                  </button>
                ))}
              </div>
            </div>

            {body.trim() && (
              <div className="space-y-1.5">
                <Label className="text-xs">{tr('smspTplPreview')}</Label>
                <p className="rounded-lg border bg-muted/40 px-3 py-2.5 text-xs leading-relaxed text-foreground/90">{preview}</p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">{tr('smspTplTestTo')}</Label>
              <div className="flex gap-2">
                <Input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder={tr('smspTestToPh')} className="h-9 flex-1 font-mono text-xs" inputMode="tel" />
                <Button size="sm" variant="outline" className="press h-9 gap-1.5" disabled={testBusy || !edit?.tpl} onClick={sendTest}>
                  <Send className="h-3.5 w-3.5" /> {testBusy ? '…' : tr('smspTplTest')}
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter className="flex-wrap items-center gap-2">
            {edit?.tpl && (
              <Button
                size="sm" variant="ghost"
                className="press mr-auto h-8 gap-1.5 text-destructive hover:text-destructive"
                onClick={() => setDelOpen(true)}
              >
                <Trash2 className="h-3.5 w-3.5" /> {tr('smspTplDelete')}
              </Button>
            )}
            <Button size="sm" className="press h-8" disabled={saving} onClick={save}>{saving ? '…' : tr('smspTplSave')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Template delete confirm */}
      <AlertDialog open={delOpen} onOpenChange={setDelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tr('smspTplDeleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{tr('smspTplDeleteHint')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="press">✕</AlertDialogCancel>
            <AlertDialogAction className="press bg-destructive text-white hover:bg-destructive/90" onClick={remove}>{tr('smspTplDelete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ── Logs tab ─────────────────────────────────────────────────────────────────

function LogsTab({ tr, data, err, reload }: { tr: (k: string) => string; data: MsgData | null; err: string; reload: () => Promise<void> }) {
  const { get, set } = useUrlState()
  const [detail, setDetail] = useState<MsgRow | null>(null)
  const [confirmDel, setConfirmDel] = useState(false)

  const chain = detail ? parseChain(detail.providerChain) : []

  const remove = async () => {
    if (!detail) return
    try {
      await fetchApi(`/api/admin/sms-messages/${detail.id}`, { method: 'DELETE' })
      toast.success(tr('smspLogDeleted'))
      setDetail(null)
      setConfirmDel(false)
      await reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    }
  }

  if (err) return <ErrorCard message={err} onRetry={reload} />
  if (!data) {
    return (
      <Card>
        <CardContent className="space-y-2 p-5">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-muted/60" />)}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      {/* Provider breakdown */}
      {data.stats.byProvider.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{tr('smspByProvider')}:</span>
          {data.stats.byProvider.map((p) => (
            <Badge key={p.provider} variant="outline" className="gap-1 bg-primary/5 text-[10px]">
              {p.provider} <span className="font-bold">{p.count}</span>
            </Badge>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2.5">
        <Select value={get('status', 'all')} onValueChange={(v) => set({ status: v === 'all' ? null : v, page: 1 })}>
          <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{tr('smspLogAll')}</SelectItem>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <SearchInput paramKey="q" placeholder={tr('smspLogSearch')} className="w-full sm:w-72" />
      </div>

      {/* Table */}
      <Card className="overflow-hidden p-0">
        {data.items.length === 0 ? (
          <EmptyState
            icon={<Inbox className="h-7 w-7" />}
            title={data.total === 0 ? tr('smspLogEmpty') : tr('smspLogNoMatch')}
            hint={data.total === 0 ? tr('smspLogEmptyHint') : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">{tr('smspLogTime')}</TableHead>
                  <TableHead className="whitespace-nowrap">{tr('smspLogTo')}</TableHead>
                  <TableHead className="min-w-48">{tr('smspLogBody')}</TableHead>
                  <TableHead className="whitespace-nowrap">{tr('smspLogProvider')}</TableHead>
                  <TableHead className="whitespace-nowrap">{tr('smspLogStatus')}</TableHead>
                  <TableHead className="whitespace-nowrap text-right">{tr('smspLogCost')}</TableHead>
                  <TableHead className="whitespace-nowrap">{tr('smspLogChain')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((m) => {
                  const attempts = parseChain(m.providerChain)
                  return (
                    <TableRow key={m.id} className="cursor-pointer" onClick={() => { setDetail(m); setConfirmDel(false) }}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(m.sentAt ?? m.createdAt)}</TableCell>
                      <TableCell className="whitespace-nowrap font-mono text-xs">{m.toNumber}</TableCell>
                      <TableCell className="max-w-72"><p className="truncate text-xs">{m.body}</p></TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{m.providerType ?? '—'}</TableCell>
                      <TableCell><StatusBadge status={m.status} /></TableCell>
                      <TableCell className="whitespace-nowrap text-right text-xs tabular">{formatBDT(m.cost)}</TableCell>
                      <TableCell>
                        {attempts.length > 0 ? (
                          <Badge variant="outline" className="gap-1 bg-primary/5 text-[10px]">{attempts.length}×</Badge>
                        ) : '—'}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
      <Pagination page={data.page} pages={data.pages} total={data.total} />

      {/* Detail dialog */}
      <Dialog open={!!detail} onOpenChange={(o) => { if (!o) { setDetail(null); setConfirmDel(false) } }}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{tr('smspLogDetail')}</DialogTitle>
            <DialogDescription className="font-mono">{detail?.toNumber}</DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="space-y-3">
              <p className="rounded-lg border bg-muted/40 px-3 py-2.5 text-xs leading-relaxed">{detail.body}</p>
              <div className="space-y-1 text-xs">
                {[
                  [tr('smspLogStatus'), <StatusBadge key="s" status={detail.status} />],
                  [tr('smspLogProvider'), detail.providerType ?? '—'],
                  [tr('smspLogMsgId'), detail.providerMessageId ?? '—'],
                  [tr('smspLogCost'), formatBDT(detail.cost)],
                  [tr('smspLogAttempts'), String(detail.attempts)],
                  [tr('smspLogRelated'), [detail.relatedType, detail.relatedId, detail.customerRef].filter(Boolean).join(' · ') || '—'],
                  [tr('smspLogTime'), formatDateTime(detail.sentAt ?? detail.createdAt)],
                  ...(detail.error ? [[tr('smspLastError'), detail.error] as [string, React.ReactNode]] : []),
                ].map(([k, v]) => (
                  <div key={String(k)} className="flex items-start justify-between gap-4 border-b py-1.5 last:border-0">
                    <span className="shrink-0 text-muted-foreground">{k}</span>
                    <span className="break-all text-right font-semibold">{v}</span>
                  </div>
                ))}
              </div>

              {chain.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{tr('smspLogChainTitle')}</p>
                  <div className="space-y-1.5">
                    {chain.map((a, i) => (
                      <div key={i} className={cn('flex items-start gap-2 rounded-lg border px-2.5 py-1.5 text-xs', a.ok ? 'border-success/25 bg-success/5' : 'border-destructive/25 bg-destructive/5')}>
                        {a.ok ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" /> : <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />}
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold">{a.provider}{a.simulated ? ` · ${tr('smspSimulated')}` : ''} <span className="font-normal text-muted-foreground">({a.ms}{tr('smspLogMs')})</span></p>
                          <p className="break-all text-[11px] text-muted-foreground">{a.detail}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter className="flex-wrap gap-2">
            {detail && (
              <Button
                size="sm" variant="ghost"
                className={cn('press mr-auto h-8 gap-1.5', confirmDel ? 'bg-destructive text-white hover:bg-destructive/90' : 'text-destructive hover:text-destructive')}
                onClick={() => (confirmDel ? remove() : setConfirmDel(true))}
              >
                <Trash2 className="h-3.5 w-3.5" /> {confirmDel ? tr('smspLogDeleteTitle') : tr('smspLogDelete')}
              </Button>
            )}
            <Button size="sm" variant="outline" className="press h-8" onClick={() => { setDetail(null); setConfirmDel(false) }}>✕</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── Failover tab ─────────────────────────────────────────────────────────────

function FailoverTab({ tr, providers }: { tr: (k: string) => string; providers: ProvRow[] | null }) {
  const [chain, setChain] = useState<string[] | null>(null)
  const [cost, setCost] = useState('')
  const [err, setErr] = useState(false)

  useEffect(() => {
    fetchApi<{ settings: Record<string, string> }>('/api/admin/settings')
      .then((d) => {
        setChain(
          String(d.settings.smsFailoverChain ?? '')
            .split(',')
            .map((s) => s.trim().toUpperCase())
            .filter(Boolean),
        )
        setCost(d.settings.smsCostPerMessage ?? '')
      })
      .catch(() => setErr(true))
  }, [])

  const statusFor = (t: string) => {
    const row = providers?.find((p) => p.type === t)
    if (!row) return { ready: false, enabled: false, complete: false }
    return { ready: row.enabled, enabled: row.enabled, complete: row.configComplete }
  }

  if (err) {
    return <ErrorCard message={tr('smspLoadFail')} onRetry={() => window.location.reload()} />
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <h3 className="flex items-center gap-2 text-sm font-bold"><Route className="h-4 w-4 text-primary" /> {tr('smspFoTitle')}</h3>
          <p className="text-xs text-muted-foreground">{tr('smspFoDesc')}</p>
        </CardHeader>
        <CardContent>
          {!chain ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-muted/60" />)}
            </div>
          ) : chain.length === 0 ? (
            <EmptyState icon={<CircleSlash className="h-7 w-7" />} title={tr('smspFoNoProvider')} />
          ) : (
            <div className="space-y-0">
              {chain.map((t, i) => {
                const meta = P_META[t as PType]
                const st = statusFor(t)
                return (
                  <div key={`${t}-${i}`} className="stagger" style={{ animationDelay: `${i * 40}ms` }}>
                    <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-foreground">{meta ? tr(meta.name) : t}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {i === 0 ? tr('smspFoTriedFirst') : `${tr('smspFoThen')} #${i + 1}`}
                          {st.ready && !st.complete ? ` · ${tr('smspCfgIncomplete')}` : ''}
                        </p>
                      </div>
                      <Badge variant="outline" className={cn('shrink-0 text-[10px]', st.ready ? 'bg-success/10 text-success border-success/25' : 'text-muted-foreground')}>
                        {st.ready ? tr('smspFoReady') : tr('smspFoNoProvider')}
                      </Badge>
                    </div>
                    {i < chain.length - 1 && (
                      <div className="flex justify-center py-0.5"><ChevronRight className="h-4 w-4 rotate-90 text-muted-foreground/50" /></div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex items-start gap-2.5 rounded-xl border border-warning/30 bg-warning/5 px-4 py-3">
          <CircleSlash className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-400">{tr('smspFoNote')}</p>
        </div>
        {cost !== '' && (
          <div className="flex items-start gap-2.5 rounded-xl border bg-card px-4 py-3">
            <Coins className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <div>
              <p className="text-xs font-semibold">{tr('smspCostEach')}</p>
              <p className="text-sm font-bold tabular">{formatBDT(Number(cost) || 0)}</p>
            </div>
          </div>
        )}
      </div>

      {providers && providers.some((p) => !p.enabled) && (
        <p className="flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
          <Link2 className="h-3 w-3" /> {tr('smspTabProviders')} → {tr('smspEnabled')}
        </p>
      )}
    </div>
  )
}

export default SmsGatewayView
