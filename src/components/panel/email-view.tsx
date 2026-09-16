'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader, EmptyState, ErrorCard, Pagination, StatCard, SearchInput } from './ui-bits'
import { useLang } from '@/lib/i18n'
import { EMA_EN, EMA_BN } from '@/lib/i18n/email'
import { toast } from 'sonner'
import { formatBDT, formatDateTime } from '@/lib/format'
import {
  Mail, Send, Inbox, Users, FileText, Plug, BarChart3, Plus, RefreshCw, Trash2,
  Pencil, Eye, FlaskConical, CheckCircle2, AlertTriangle, XCircle, Sparkles, Info,
} from 'lucide-react'
import { useUrlState } from '@/hooks/use-url-state'

// ── helpers ──────────────────────────────────────────────────────────────────

function useEmaT() {
  const { t, lang } = useLang()
  return useCallback((k: string) => {
    const v = t(k)
    if (v && v !== k) return v
    return (lang === 'bn' ? EMA_BN[k] : EMA_EN[k]) ?? EMA_EN[k] ?? k
  }, [t, lang])
}

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' })
  const j = (await res.json().catch(() => ({}))) as { data?: T; error?: string }
  if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
  return (j.data ?? j) as T
}

async function postJSON<T>(url: string, body: unknown, method = 'POST'): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
  const j = (await res.json().catch(() => ({}))) as { data?: T; error?: string }
  if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
  return (j.data ?? j) as T
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function statusTone(status: string): string {
  switch (status) {
    case 'SENT': case 'DELIVERED': case 'RECEIVED':
      return 'border-success/30 bg-success/10 text-success'
    case 'FAILED': case 'BOUNCED':
      return 'border-destructive/30 bg-destructive/10 text-destructive'
    case 'OPENED': case 'CLICKED':
      return 'border-primary/30 bg-primary/10 text-primary'
    case 'QUEUED':
      return 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400'
    default:
      return 'text-muted-foreground'
  }
}

function StatusChip({ status, label }: { status: string; label: string }) {
  return (
    <Badge variant="outline" className={`font-medium ${statusTone(status)}`}>{label}</Badge>
  )
}

function stLabel(tx: (k: string) => string, s: string): string {
  const key = `emaSt${s.charAt(0)}${s.slice(1).toLowerCase()}`
  const v = tx(key)
  return v === key ? s : v
}

function Dot({ ok, warn }: { ok: boolean; warn?: boolean }) {
  return (
    <span
      title={ok ? undefined : 'unhealthy'}
      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${ok ? 'bg-success' : warn ? 'bg-amber-500' : 'bg-destructive'}`}
      aria-hidden
    />
  )
}

// ── provider catalog (client metadata only — no secrets here) ───────────────

interface FieldDef { key: string; labelKey: string; hintKey?: string; type?: 'text' | 'password' | 'number' | 'textarea'; placeholder?: string }

const PROVIDER_TYPES = ['RESEND', 'SES', 'MAILERSEND', 'PLUNK', 'LOOPS', 'SMTP', 'CUSTOM'] as const

const PROVIDER_META: Record<string, { name: string; blurbKey: string; guides: string[]; fields: FieldDef[] }> = {
  RESEND: {
    name: 'Resend', blurbKey: 'emaProvResend',
    guides: ['emaGuideResend1', 'emaGuideResend2', 'emaGuideResend3'],
    fields: [{ key: 'apiKey', labelKey: 'emaFApiKey', hintKey: 'emaHintResend', type: 'password', placeholder: 're_...' }],
  },
  SES: {
    name: 'Amazon SES', blurbKey: 'emaProvSes',
    guides: ['emaGuideSes1', 'emaGuideSes2', 'emaGuideSes3', 'emaGuideSes4'],
    fields: [
      { key: 'accessKey', labelKey: 'emaFAccessKey', hintKey: 'emaHintSesKey', type: 'password' },
      { key: 'secretKey', labelKey: 'emaFSecretKey', type: 'password' },
      { key: 'region', labelKey: 'emaFRegion', hintKey: 'emaHintSesRegion', placeholder: 'us-east-1' },
    ],
  },
  MAILERSEND: {
    name: 'MailerSend', blurbKey: 'emaProvMs',
    guides: ['emaGuideMs1', 'emaGuideMs2', 'emaGuideMs3'],
    fields: [{ key: 'apiKey', labelKey: 'emaFApiKey', hintKey: 'emaHintMs', type: 'password' }],
  },
  PLUNK: {
    name: 'Plunk', blurbKey: 'emaProvPlunk',
    guides: ['emaGuidePlunk1', 'emaGuidePlunk2', 'emaGuidePlunk3'],
    fields: [{ key: 'apiKey', labelKey: 'emaFApiKey', hintKey: 'emaHintPlunk', type: 'password' }],
  },
  LOOPS: {
    name: 'Loops', blurbKey: 'emaProvLoops',
    guides: ['emaGuideLoops1', 'emaGuideLoops2', 'emaGuideLoops3', 'emaGuideLoops4'],
    fields: [
      { key: 'apiKey', labelKey: 'emaFApiKey', hintKey: 'emaHintLoops', type: 'password' },
      { key: 'transactionalId', labelKey: 'emaFTransactionalId', hintKey: 'emaHintLoopsTx', type: 'password' },
    ],
  },
  SMTP: {
    name: 'SMTP', blurbKey: 'emaProvSmtp',
    guides: ['emaGuideSmtp1', 'emaGuideSmtp2', 'emaGuideSmtp3'],
    fields: [
      { key: 'host', labelKey: 'emaFHost', hintKey: 'emaHintSmtpHost', placeholder: 'smtp.gmail.com' },
      { key: 'port', labelKey: 'emaFPort', hintKey: 'emaHintSmtpPort', type: 'number', placeholder: '587' },
      { key: 'user', labelKey: 'emaFUser', hintKey: 'emaHintSmtpUser' },
      { key: 'password', labelKey: 'emaFPassword', hintKey: 'emaHintSmtpPass', type: 'password' },
    ],
  },
  CUSTOM: {
    name: 'Custom HTTP', blurbKey: 'emaProvCustom',
    guides: ['emaGuideCustom1', 'emaGuideCustom2', 'emaGuideCustom3'],
    fields: [
      { key: 'url', labelKey: 'emaFUrl', hintKey: 'emaHintCustomUrl', placeholder: 'https://…' },
      { key: 'apiKey', labelKey: 'emaFApiKey', type: 'password' },
      { key: 'bodyTemplate', labelKey: 'emaFBodyTemplate', hintKey: 'emaHintCustomTpl', type: 'textarea' },
    ],
  },
}

const REQUIRED_FIELDS: Record<string, string[]> = {
  RESEND: ['apiKey'],
  SES: ['accessKey', 'secretKey', 'region'],
  MAILERSEND: ['apiKey'],
  PLUNK: ['apiKey'],
  LOOPS: ['apiKey', 'transactionalId'],
  SMTP: ['host', 'user', 'password'],
  CUSTOM: ['url'],
}

// ── types ────────────────────────────────────────────────────────────────────

interface ProviderRow {
  id: string; type: string; label: string; fromEmail: string; fromName: string | null
  priority: number; enabled: boolean; healthy: boolean; sentCount: number; failCount: number
  lastError: string | null; lastCheckedAt: string | null
  config: Record<string, string>; configPresent: boolean
}
interface ProvidersData { items: ProviderRow[]; sandbox: boolean; chain: string }
interface IdentityRow { id: string; label: string; email: string; purpose: string; signature: string | null; verified: boolean; active: boolean }
interface Preset { label: string; local: string; purpose: string }
interface TemplateRow {
  id: string; key: string; name: string; category: string; event: string | null; locale: string
  tone: string; subject: string; bodyHtml: string; variables: string[]; builtin: boolean; active: boolean
}
interface MessageRow {
  id: string; direction: string; toAddress: string; fromAddress: string | null; subject: string
  templateKey: string | null; status: string; providerType: string | null; error: string | null
  cost: number; attempts: number; relatedType: string | null; relatedId: string | null
  sentAt: string | null; receivedAt: string | null; createdAt: string
}
interface ChainAttempt { provider: string; ok: boolean; detail: string; ms: number; simulated?: boolean }
interface MessagesData {
  items: MessageRow[]; total: number; page: number; pages: number
  stats: { sent: number; failed: number; bounced: number; delivered: number; received: number; costTotal: number }
}
interface AnalyticsData {
  totals: { sent: number; failed: number; bounced: number; delivered: number; opened: number; clicked: number; received: number; costTotal: number }
  openRate: number; clickRate: number
  providers: Array<Pick<ProviderRow, 'id' | 'type' | 'label' | 'enabled' | 'healthy' | 'sentCount' | 'failCount' | 'lastError'>>
  daily: Array<{ date: string; sent: number }>
}

// ── Providers tab ────────────────────────────────────────────────────────────

interface ProviderDraft {
  id: string | null
  label: string
  fromEmail: string
  fromName: string
  priority: string
  enabled: boolean
  fields: Record<string, string>
  masked: Record<string, string>
}

function draftFor(type: string, row: ProviderRow | undefined): ProviderDraft {
  const meta = PROVIDER_META[type]
  const masked = row?.config ?? {}
  return {
    id: row?.id ?? null,
    label: row?.label ?? meta.name,
    fromEmail: row?.fromEmail ?? '',
    fromName: row?.fromName ?? '',
    priority: String(row?.priority ?? 10),
    enabled: row?.enabled ?? false,
    fields: Object.fromEntries(meta.fields.map((f) => [f.key, masked[f.key] ?? ''])),
    masked: { ...masked },
  }
}

function ProvidersTab() {
  const tx = useEmaT()
  const [data, setData] = useState<ProvidersData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [drafts, setDrafts] = useState<Record<string, ProviderDraft>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [testing, setTesting] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const d = await getJSON<ProvidersData>('/api/admin/email/providers')
      setData(d)
      setDrafts(Object.fromEntries(PROVIDER_TYPES.map((t) => [t, draftFor(t, d.items.find((r) => r.type === t))])))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const patchDraft = (type: string, patch: Partial<ProviderDraft>) =>
    setDrafts((prev) => ({ ...prev, [type]: { ...prev[type], ...patch } }))

  const save = async (type: string) => {
    const d = drafts[type]
    if (!d) return
    const meta = PROVIDER_META[type]
    if (!EMAIL_RE.test(d.fromEmail.trim())) {
      toast.error(tx('emaFromEmail') + ': ' + meta.name)
      return
    }
    // Only send config fields the user actually changed (masked secrets stay untouched server-side)
    const config: Record<string, string> = {}
    for (const f of meta.fields) {
      const v = (d.fields[f.key] ?? '').trim()
      if (v && v !== d.masked[f.key]) config[f.key] = v
    }
    setSaving(type)
    try {
      const payload: Record<string, unknown> = {
        type,
        label: d.id ? d.label : meta.name,
        fromEmail: d.fromEmail.trim(),
        fromName: d.fromName.trim() || null,
        priority: Number(d.priority) || 10,
        enabled: d.enabled,
      }
      if (d.id) payload.id = d.id
      if (Object.keys(config).length > 0) payload.config = config
      await postJSON('/api/admin/email/providers', payload)
      toast.success(tx('emaSavedToast'))
      await load()
    } catch (e) {
      toast.error(`${tx('emaSaveFail')}: ${e instanceof Error ? e.message : e}`)
    } finally {
      setSaving(null)
    }
  }

  const test = async (type: string) => {
    const d = drafts[type]
    if (!d?.id) return
    setTesting(type)
    try {
      const r = await postJSON<{ ok: boolean; provider: string; simulated: boolean; error?: string }>('/api/admin/email/providers/test', { id: d.id })
      if (r.ok) toast.success(`${tx('emaTestOkToast')} · ${r.provider}${r.simulated ? ' · ' + tx('emaSandboxTag') : ''}`)
      else toast.error(`${tx('emaTestFailToast')}: ${r.error ?? 'unknown'}`)
      await load()
    } catch (e) {
      toast.error(`${tx('emaTestFailToast')}: ${e instanceof Error ? e.message : e}`)
    } finally {
      setTesting(null)
    }
  }

  const removeProvider = async (id: string) => {
    try {
      await postJSON(`/api/admin/email/providers/${id}`, {}, 'DELETE')
      toast.success(tx('emaDeletedToast'))
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }

  if (loading) {
    return (
      <div className="grid gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-56 w-full rounded-xl" />
        ))}
      </div>
    )
  }
  if (error) return <ErrorCard message={error} onRetry={() => void load()} />
  if (!data) return null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {data.sandbox ? (
          <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <FlaskConical className="h-3 w-3" /> {tx('emaSandboxTag')}
          </Badge>
        ) : (
          <Badge variant="outline" className="border-success/40 bg-success/10 text-success">
            <CheckCircle2 className="h-3 w-3" /> PRODUCTION
          </Badge>
        )}
        <span className="text-xs text-muted-foreground">
          {tx('emaChain')}: <span className="font-mono font-semibold text-foreground">{data.chain}</span>
        </span>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">{tx('emaProvidersHint')}</p>

      <div className="grid gap-4 xl:grid-cols-2">
        {PROVIDER_TYPES.map((type, idx) => {
          const meta = PROVIDER_META[type]
          const row = data.items.find((r) => r.type === type)
          const others = data.items.filter((r) => r.type === type && r.id !== row?.id)
          const d = drafts[type] ?? draftFor(type, row)
          const missing = REQUIRED_FIELDS[type].filter((f) => !d.fields[f])
          const present = row ? row.configPresent && missing.length === 0 : false
          return (
            <Card key={type} className="ilp-fade-up overflow-hidden" style={{ animationDelay: `${idx * 40}ms` }}>
              <CardContent className="p-0">
                <div className="flex items-start justify-between gap-3 border-b bg-muted/40 p-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="rounded-lg bg-primary/10 p-2 text-primary"><Plug className="h-4 w-4" /></div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate text-sm font-bold text-foreground">{meta.name}</h3>
                        {row && (present ? (
                          <Badge variant="outline" className="border-success/40 bg-success/10 text-success">{tx('emaConfigured')}</Badge>
                        ) : (
                          <Badge variant="outline" className="border-warning/40 bg-warning/10 text-warning">{tx('emaMissingFields')}</Badge>
                        ))}
                        {row && <Dot ok={row.healthy && row.failCount === 0} warn={row.failCount > 0 && row.healthy} />}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{tx(meta.blurbKey)}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Label htmlFor={`ema-en-${type}`} className="sr-only">{tx('emaEnabled')}</Label>
                    <Switch
                      id={`ema-en-${type}`}
                      checked={d.enabled}
                      onCheckedChange={(v) => patchDraft(type, { enabled: v })}
                    />
                  </div>
                </div>

                <div className="p-4">
                  <ol className="mb-4 space-y-1.5 rounded-lg bg-muted/50 p-3">
                    <li className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                      <Info className="h-3 w-3" /> {tx('emaGuide')}
                    </li>
                    {meta.guides.map((g, gi) => (
                      <li key={g} className="flex gap-2 text-xs leading-relaxed text-muted-foreground">
                        <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">{gi + 1}</span>
                        <span>{tx(g)}</span>
                      </li>
                    ))}
                  </ol>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor={`ema-fe-${type}`} className="text-xs">{tx('emaFromEmail')} *</Label>
                      <Input
                        id={`ema-fe-${type}`} className="h-9" placeholder={tx('emaHintFromEmail')}
                        value={d.fromEmail} onChange={(e) => patchDraft(type, { fromEmail: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`ema-fn-${type}`} className="text-xs">{tx('emaFromName')}</Label>
                      <Input
                        id={`ema-fn-${type}`} className="h-9" placeholder="Invokeil Pay"
                        value={d.fromName} onChange={(e) => patchDraft(type, { fromName: e.target.value })}
                      />
                    </div>
                    {meta.fields.map((f) => (
                      <div key={f.key} className={`space-y-1.5 ${f.type === 'textarea' ? 'sm:col-span-2' : ''}`}>
                        <Label htmlFor={`ema-${type}-${f.key}`} className="text-xs">{tx(f.labelKey)}</Label>
                        {f.type === 'textarea' ? (
                          <Textarea
                            id={`ema-${type}-${f.key}`} className="min-h-[64px] font-mono text-xs"
                            placeholder={f.placeholder} value={d.fields[f.key] ?? ''}
                            onChange={(e) => patchDraft(type, { fields: { ...d.fields, [f.key]: e.target.value } })}
                          />
                        ) : (
                          <Input
                            id={`ema-${type}-${f.key}`} className="h-9" type={f.type === 'number' ? 'number' : f.type === 'password' ? 'password' : 'text'}
                            placeholder={f.placeholder ?? ''} value={d.fields[f.key] ?? ''}
                            onChange={(e) => patchDraft(type, { fields: { ...d.fields, [f.key]: e.target.value } })}
                          />
                        )}
                        {f.hintKey && (
                          <p className="flex items-start gap-1 text-[11px] leading-snug text-muted-foreground">
                            <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-primary/70" />
                            <span><span className="font-semibold">{tx('emaWhereFind')}</span> — {tx(f.hintKey)}</span>
                          </p>
                        )}
                      </div>
                    ))}
                    <div className="space-y-1.5">
                      <Label htmlFor={`ema-pr-${type}`} className="text-xs">{tx('emaPriority')} ⓘ</Label>
                      <Input
                        id={`ema-pr-${type}`} className="h-9" type="number" min={1} max={99}
                        value={d.priority} onChange={(e) => patchDraft(type, { priority: e.target.value })}
                      />
                      <p className="text-[11px] text-muted-foreground">{tx('emaChainHint')}</p>
                    </div>
                  </div>

                  {row && (
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-muted/40 p-2.5 text-[11px] text-muted-foreground">
                      <span>{tx('emaSentCount')}: <b className="text-foreground">{row.sentCount}</b></span>
                      <span>{tx('emaFailCount')}: <b className={row.failCount > 0 ? 'text-destructive' : 'text-foreground'}>{row.failCount}</b></span>
                      {row.lastError && (
                        <span className="max-w-full truncate" title={row.lastError}>
                          {tx('emaLastError')}: <b className="text-destructive">{row.lastError}</b>
                        </span>
                      )}
                    </div>
                  )}

                  {others.length > 0 && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                      {others.length} {tx('emaMore')}:
                      {others.map((o) => (
                        <Badge key={o.id} variant="secondary" className="gap-1">
                          {o.label}
                          <button
                            type="button" aria-label={`${tx('emaDelete')} ${o.label}`}
                            className="ml-0.5 rounded-full p-0.5 hover:bg-destructive/15 hover:text-destructive"
                            onClick={() => void removeProvider(o.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Button size="sm" className="press h-9 gap-1.5" disabled={saving === type} onClick={() => void save(type)}>
                      <CheckCircle2 className="h-3.5 w-3.5" /> {saving === type ? tx('emaSaving') : tx('emaSave')}
                    </Button>
                    <Button size="sm" variant="outline" className="press h-9 gap-1.5" disabled={!d.id || testing === type} onClick={() => void test(type)}>
                      <FlaskConical className="h-3.5 w-3.5" /> {testing === type ? tx('emaTesting') : tx('emaTest')}
                    </Button>
                    {!row && <span className="text-[11px] text-muted-foreground">{tx('emaNotConfigured')}</span>}
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

// ── Identities tab ───────────────────────────────────────────────────────────

const ID_PURPOSES = ['GENERAL', 'SALES', 'PAYMENTS', 'INVOICES', 'SUPPORT', 'REFUNDS', 'SECURITY', 'OTP', 'BILLING', 'NOREPLY', 'CUSTOM'] as const
const purposeKey: Record<string, string> = {
  GENERAL: 'emaPurposeGeneral', SALES: 'emaPurposeSales', PAYMENTS: 'emaPurposePayments',
  INVOICES: 'emaPurposeInvoices', SUPPORT: 'emaPurposeSupport', REFUNDS: 'emaPurposeRefunds',
  SECURITY: 'emaPurposeSecurity', OTP: 'emaPurposeOtp', BILLING: 'emaPurposeBilling',
  NOREPLY: 'emaPurposeNoreply', CUSTOM: 'emaPurposeCustom',
}

interface IdForm { id: string | null; label: string; email: string; purpose: string; signature: string; verified: boolean; active: boolean }
const EMPTY_ID: IdForm = { id: null, label: '', email: '', purpose: 'SUPPORT', signature: '', verified: false, active: true }

function IdentitiesTab() {
  const tx = useEmaT()
  const [items, setItems] = useState<IdentityRow[]>([])
  const [presets, setPresets] = useState<Preset[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<IdForm>(EMPTY_ID)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const d = await getJSON<{ items: IdentityRow[]; presets: Preset[] }>('/api/admin/email/identities')
      setItems(d.items)
      setPresets(d.presets ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { void load() }, [load])

  const domainGuess = useMemo(() => {
    const found = items.find((i) => i.email.includes('@'))
    return found ? found.email.split('@')[1] : ''
  }, [items])

  const applyPreset = (p: Preset) => {
    setForm({ ...EMPTY_ID, label: p.label, purpose: p.purpose, email: `${p.local}@${domainGuess}` })
    setOpen(true)
  }

  const save = async () => {
    if (!form.label.trim() || !EMAIL_RE.test(form.email.trim())) {
      toast.error(`${tx('emaLabel')} / ${tx('emaEmail')}`)
      return
    }
    setSaving(true)
    try {
      const payload = {
        id: form.id ?? undefined,
        label: form.label.trim(),
        email: form.email.trim().toLowerCase(),
        purpose: form.purpose,
        signature: form.signature.trim() || null,
        verified: form.verified,
        active: form.active,
      }
      if (form.id) await postJSON(`/api/admin/email/identities/${form.id}`, payload, 'PATCH')
      else await postJSON('/api/admin/email/identities', payload)
      toast.success(tx('emaIdSavedToast'))
      setOpen(false)
      await load()
    } catch (e) {
      toast.error(`${tx('emaSaveFail')}: ${e instanceof Error ? e.message : e}`)
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: string) => {
    try {
      await postJSON(`/api/admin/email/identities/${id}`, {}, 'DELETE')
      toast.success(tx('emaIdDeletedToast'))
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }

  if (loading) return <div className="grid gap-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}</div>
  if (error) return <ErrorCard message={error} onRetry={() => void load()} />

  return (
    <div className="space-y-4">
      <p className="text-xs leading-relaxed text-muted-foreground">{tx('emaIdentitiesHint')}</p>

      {presets.length > 0 && (
        <div className="ilp-fade-up rounded-xl border bg-card p-4">
          <p className="mb-2 text-xs font-semibold text-foreground">{tx('emaQuickAdd')}</p>
          <div className="flex flex-wrap gap-1.5">
            {presets.map((p) => (
              <button
                key={p.local} type="button" onClick={() => applyPreset(p)}
                className="press inline-flex h-8 items-center gap-1.5 rounded-full border bg-muted/50 px-3 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/10"
              >
                <Plus className="h-3 w-3 text-primary" />
                {p.label} · {p.local}@
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">{tx('emaDomainHint')}</p>
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState
          icon={<Users className="h-7 w-7" />}
          title={tx('emaNoIdentities')}
          hint={tx('emaIdentitiesHint')}
          action={
            <Button size="sm" className="press gap-1.5" onClick={() => { setForm(EMPTY_ID); setOpen(true) }}>
              <Plus className="h-4 w-4" /> {tx('emaAddIdentity')}
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="p-3 font-semibold">{tx('emaLabel')}</th>
                  <th className="p-3 font-semibold">{tx('emaEmail')}</th>
                  <th className="p-3 font-semibold">{tx('emaPurpose')}</th>
                  <th className="p-3 font-semibold">{tx('emaVerified')}</th>
                  <th className="p-3 text-right font-semibold">{tx('emaDelete')}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id} className="border-b transition-colors last:border-0 hover:bg-muted/30">
                    <td className="p-3">
                      <button
                        type="button" className="press flex min-h-[40px] items-center gap-1.5 font-semibold text-foreground hover:text-primary"
                        onClick={() => { setForm({ id: i.id, label: i.label, email: i.email, purpose: i.purpose, signature: i.signature ?? '', verified: i.verified, active: i.active }); setOpen(true) }}
                      >
                        <Pencil className="h-3.5 w-3.5 text-muted-foreground" /> {i.label}
                      </button>
                    </td>
                    <td className="p-3 font-mono text-xs text-foreground">{i.email}</td>
                    <td className="p-3"><Badge variant="secondary">{tx(purposeKey[i.purpose] ?? 'emaPurposeCustom')}</Badge></td>
                    <td className="p-3">
                      {i.verified ? (
                        <Badge variant="outline" className="border-success/40 bg-success/10 text-success"><CheckCircle2 className="h-3 w-3" /> ✓</Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">—</Badge>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="ghost" className="press h-9 w-9 p-0 text-muted-foreground hover:text-destructive" aria-label={`${tx('emaDelete')} ${i.label}`}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{tx('emaDelete')} {i.label}?</AlertDialogTitle>
                            <AlertDialogDescription>{tx('emaDeleteMsg')}</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{tx('emaClose')}</AlertDialogCancel>
                            <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={() => void remove(i.id)}>
                              {tx('emaDelete')}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Button variant="outline" className="press gap-1.5" onClick={() => { setForm(EMPTY_ID); setOpen(true) }}>
        <Plus className="h-4 w-4" /> {tx('emaAddIdentity')}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? tx('emaEditIdentity') : tx('emaAddIdentity')}</DialogTitle>
            <DialogDescription>{tx('emaDomainHint')}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ema-id-label" className="text-xs">{tx('emaLabel')} *</Label>
              <Input id="ema-id-label" className="h-9" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Support" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ema-id-email" className="text-xs">{tx('emaEmail')} *</Label>
              <Input id="ema-id-email" className="h-9" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="support@yourdomain.com" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{tx('emaPurpose')}</Label>
              <Select value={form.purpose} onValueChange={(v) => setForm({ ...form, purpose: v })}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ID_PURPOSES.map((p) => <SelectItem key={p} value={p}>{tx(purposeKey[p])}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ema-id-sig" className="text-xs">{tx('emaSignature')}</Label>
              <Textarea id="ema-id-sig" className="min-h-[72px]" value={form.signature} onChange={(e) => setForm({ ...form, signature: e.target.value })} placeholder="— Team Invokeil Pay" />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label htmlFor="ema-id-verified" className="text-xs">{tx('emaVerified')}</Label>
              <Switch id="ema-id-verified" checked={form.verified} onCheckedChange={(v) => setForm({ ...form, verified: v })} />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label htmlFor="ema-id-active" className="text-xs">{tx('emaActive')}</Label>
              <Switch id="ema-id-active" checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="press" onClick={() => setOpen(false)}>{tx('emaClose')}</Button>
            <Button className="press" disabled={saving} onClick={() => void save()}>{saving ? tx('emaSaving') : tx('emaSave')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── Templates tab ────────────────────────────────────────────────────────────

const TPL_CATEGORIES = ['PAYMENT', 'INVOICE', 'SUBSCRIPTION', 'SECURITY', 'REFUND', 'SUPPORT', 'MARKETING', 'SYSTEM', 'KYC', 'OTP'] as const
const catKey: Record<string, string> = {
  PAYMENT: 'emaCatPayment', INVOICE: 'emaCatInvoice', SUBSCRIPTION: 'emaCatSubscription',
  SECURITY: 'emaCatSecurity', REFUND: 'emaCatRefund', SUPPORT: 'emaCatSupport',
  MARKETING: 'emaCatMarketing', SYSTEM: 'emaCatSystem', KYC: 'emaCatKyc', OTP: 'emaCatOtp',
}
const toneKey: Record<string, string> = { FORMAL: 'emaToneFormal', FRIENDLY: 'emaToneFriendly', MINIMAL: 'emaToneMinimal' }
const TPL_PAGE_SIZE = 12

function TemplatesTab() {
  const tx = useEmaT()
  const { get, getNum, set } = useUrlState()
  const q = get('q')
  const category = get('category', 'ALL')
  const locale = get('locale', 'en')
  const page = getNum('page', 1)
  const [data, setData] = useState<{ items: TemplateRow[]; total: number; pages: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<TemplateRow | null>(null)
  const [editing, setEditing] = useState<TemplateRow | null>(null)
  const [draft, setDraft] = useState({ subject: '', bodyHtml: '' })
  const [saving, setSaving] = useState(false)
  const [restoreOpen, setRestoreOpen] = useState(false)
  const [restoreForce, setRestoreForce] = useState(false)
  const [restoring, setRestoring] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(TPL_PAGE_SIZE), locale })
      if (q) params.set('q', q)
      if (category !== 'ALL') params.set('category', category)
      const d = await getJSON<{ items: TemplateRow[]; total: number; pages: number }>(`/api/admin/email/templates?${params}`)
      setData(d)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [page, q, category, locale])

  useEffect(() => { void load() }, [load])

  const saveEdit = async () => {
    if (!editing) return
    setSaving(true)
    try {
      await postJSON(`/api/admin/email/templates/${editing.id}`, { subject: draft.subject, bodyHtml: draft.bodyHtml }, 'PATCH')
      toast.success(tx('emaTplSavedToast'))
      setEditing(null)
      await load()
    } catch (e) {
      toast.error(`${tx('emaSaveFail')}: ${e instanceof Error ? e.message : e}`)
    } finally {
      setSaving(false)
    }
  }

  const removeTpl = async (row: TemplateRow) => {
    if (row.builtin) {
      toast.error(tx('emaTplBuiltinDelete'))
      return
    }
    try {
      await postJSON(`/api/admin/email/templates/${row.id}`, {}, 'DELETE')
      toast.success(tx('emaTplDeletedToast'))
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }

  const restore = async () => {
    setRestoring(true)
    try {
      const r = await postJSON<{ created: number; updated: number; skipped: number }>('/api/admin/email/templates/restore', { force: restoreForce })
      toast.success(`${tx('emaTplRestoredToast')} · +${r.created} / ~${r.updated} / =${r.skipped}`)
      setRestoreOpen(false)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setRestoring(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-xl text-xs leading-relaxed text-muted-foreground">{tx('emaTemplatesHint')}</p>
        <Button variant="outline" size="sm" className="press h-9 gap-1.5" onClick={() => setRestoreOpen(true)}>
          <RefreshCw className="h-3.5 w-3.5" /> {tx('emaTplRestore')}
        </Button>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <SearchInput paramKey="q" placeholder={`${tx('emaTabTemplates')}…`} className="lg:w-72" />
        <div className="flex flex-wrap items-center gap-1.5">
          {(['ALL', ...TPL_CATEGORIES] as const).map((c) => (
            <button
              key={c} type="button"
              onClick={() => set({ category: c === 'ALL' ? null : c, page: 1 })}
              className={`press inline-flex h-8 items-center rounded-full border px-3 text-xs font-medium transition-colors ${
                category === c ? 'border-primary bg-primary/10 text-primary' : 'bg-muted/50 text-muted-foreground hover:text-foreground'
              }`}
            >
              {c === 'ALL' ? tx('emaCatAll') : tx(catKey[c])}
            </button>
          ))}
          <div className="ml-1 flex overflow-hidden rounded-full border">
            {(['en', 'bn'] as const).map((l) => (
              <button
                key={l} type="button"
                onClick={() => set({ locale: l, page: 1 })}
                className={`press h-8 px-3 text-xs font-semibold transition-colors ${locale === l ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {l === 'en' ? 'EN' : 'বাংলা'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}
        </div>
      ) : error ? (
        <ErrorCard message={error} onRetry={() => void load()} />
      ) : !data || data.items.length === 0 ? (
        <EmptyState icon={<FileText className="h-7 w-7" />} title={tx('emaInboxEmpty')} hint={tx('emaTplRestoreDesc')} />
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.items.map((row, i) => (
              <Card key={row.id} className="ilp-fade-up transition-shadow hover:shadow-brand" style={{ animationDelay: `${i * 30}ms` }}>
                <CardContent className="p-4">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground" title={row.name}>{row.name}</p>
                      <p className="truncate font-mono text-[11px] text-muted-foreground">{row.key}</p>
                    </div>
                    {!row.active && <Badge variant="outline" className="text-muted-foreground">{tx('emaTplInactive')}</Badge>}
                  </div>
                  <div className="mb-3 flex flex-wrap items-center gap-1.5">
                    <Badge variant="secondary">{tx(catKey[row.category] ?? row.category)}</Badge>
                    <Badge variant="outline" className="text-muted-foreground">{tx(toneKey[row.tone] ?? row.tone)}</Badge>
                    <Badge variant="outline" className="text-muted-foreground">{row.locale === 'bn' ? 'বাংলা' : 'EN'}</Badge>
                  </div>
                  <p className="mb-3 line-clamp-1 text-xs text-muted-foreground" title={row.subject}>{row.subject}</p>
                  <div className="flex items-center gap-1.5">
                    <Button size="sm" variant="outline" className="press h-8 gap-1" onClick={() => setPreview(row)}>
                      <Eye className="h-3 w-3" /> {tx('emaTplPreview')}
                    </Button>
                    <Button size="sm" variant="outline" className="press h-8 gap-1" onClick={() => { setEditing(row); setDraft({ subject: row.subject, bodyHtml: row.bodyHtml }) }}>
                      <Pencil className="h-3 w-3" /> {tx('emaTplEdit')}
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost" className="press h-8 w-8 p-0 text-muted-foreground hover:text-destructive" aria-label={`${tx('emaDelete')} ${row.name}`}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{tx('emaDelete')} {row.name}?</AlertDialogTitle>
                          <AlertDialogDescription>{row.builtin ? tx('emaTplBuiltinDelete') : tx('emaDeleteMsg')}</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{tx('emaClose')}</AlertDialogCancel>
                          {!row.builtin && (
                            <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={() => void removeTpl(row)}>
                              {tx('emaDelete')}
                            </AlertDialogAction>
                          )}
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <Pagination page={page} pages={data.pages} total={data.total} />
        </>
      )}

      {/* Preview dialog */}
      <Dialog open={!!preview} onOpenChange={(v) => !v && setPreview(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{preview?.name}</DialogTitle>
            <DialogDescription className="font-mono text-[11px]">{preview?.key}</DialogDescription>
          </DialogHeader>
          {preview && (
            <div className="space-y-3">
              <div className="rounded-lg border p-3 text-sm font-semibold text-foreground">{preview.subject}</div>
              <iframe title="template-preview" sandbox="" srcDoc={preview.bodyHtml} className="h-80 w-full rounded-lg border bg-white" />
              {preview.variables.length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs font-semibold text-muted-foreground">{tx('emaTplVars')}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {preview.variables.map((v) => (
                      <Badge key={v} variant="secondary" className="font-mono text-[11px]">{`{{${v}}}`}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{tx('emaTplEdit')} — {editing?.name}</DialogTitle>
            <DialogDescription className="font-mono text-[11px]">{editing?.key}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="ema-tpl-subject" className="text-xs">{tx('emaTplSubject')}</Label>
                <Input id="ema-tpl-subject" className="h-9" value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ema-tpl-body" className="text-xs">{tx('emaTplBody')}</Label>
                <Textarea id="ema-tpl-body" className="min-h-[220px] font-mono text-xs" value={draft.bodyHtml} onChange={(e) => setDraft({ ...draft, bodyHtml: e.target.value })} />
              </div>
              {editing && editing.variables.length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs font-semibold text-muted-foreground">{tx('emaTplVars')}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {editing.variables.map((v) => (
                      <button
                        key={v} type="button"
                        className="press rounded-full bg-primary/10 px-2.5 py-1 font-mono text-[11px] font-semibold text-primary transition-colors hover:bg-primary/20"
                        onClick={() => setDraft((d) => ({ ...d, bodyHtml: `${d.bodyHtml} {{${v}}}` }))}
                      >
                        {`{{${v}}}`}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground">{tx('emaTplLivePreview')}</p>
              <iframe title="template-live-preview" sandbox="" srcDoc={draft.bodyHtml || '<p></p>'} className="h-[340px] w-full rounded-lg border bg-white" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="press" onClick={() => setEditing(null)}>{tx('emaClose')}</Button>
            <Button className="press" disabled={saving} onClick={() => void saveEdit()}>{saving ? tx('emaSaving') : tx('emaSave')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restore dialog */}
      <Dialog open={restoreOpen} onOpenChange={setRestoreOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{tx('emaTplRestoreTitle')}</DialogTitle>
            <DialogDescription>{tx('emaTplRestoreDesc')}</DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <Label htmlFor="ema-tpl-force" className="text-xs">{tx('emaTplRestoreForce')}</Label>
            <Switch id="ema-tpl-force" checked={restoreForce} onCheckedChange={setRestoreForce} />
          </div>
          <DialogFooter>
            <Button variant="outline" className="press" onClick={() => setRestoreOpen(false)}>{tx('emaClose')}</Button>
            <Button className="press gap-1.5" disabled={restoring} onClick={() => void restore()}>
              <RefreshCw className={`h-4 w-4 ${restoring ? 'animate-spin' : ''}`} /> {tx('emaTplRestoreBtn')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── Inbox tab ────────────────────────────────────────────────────────────────

interface ComposeForm {
  identityId: string
  to: string
  subject: string
  bodyText: string
  templateKey: string
  vars: Record<string, string>
}

function InboxTab() {
  const tx = useEmaT()
  const [direction, setDirection] = useState<'SENT' | 'RECEIVED'>('SENT')
  const [data, setData] = useState<MessagesData | null>(null)
  const [identities, setIdentities] = useState<IdentityRow[]>([])
  const [templates, setTemplates] = useState<TemplateRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [detail, setDetail] = useState<(MessageRow & { chain?: ChainAttempt[]; bodyHtml?: string | null }) | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [mobileDetail, setMobileDetail] = useState<MessageRow | null>(null)
  const [composeOpen, setComposeOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [simulating, setSimulating] = useState(false)
  const [form, setForm] = useState<ComposeForm>({ identityId: '', to: '', subject: '', bodyText: '', templateKey: '', vars: {} })
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async (dir: 'SENT' | 'RECEIVED', s: string) => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ direction: dir, pageSize: '50' })
      if (s) params.set('q', s)
      const d = await getJSON<MessagesData>(`/api/admin/email/messages?${params}`)
      setData(d)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  const loadMeta = useCallback(async () => {
    try {
      const [idRes, tpRes] = await Promise.all([
        getJSON<{ items: IdentityRow[] }>('/api/admin/email/identities'),
        getJSON<{ items: TemplateRow[] }>('/api/admin/email/templates?pageSize=200&active=1'),
      ])
      setIdentities(idRes.items)
      setTemplates(tpRes.items)
    } catch { /* non-fatal for the inbox list */ }
  }, [])

  useEffect(() => { void load(direction, search) }, [load, direction])  
  useEffect(() => { void loadMeta() }, [loadMeta])

  const onSearch = (v: string) => {
    setSearch(v)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => { void load(direction, v) }, 350)
  }

  const openDetail = async (row: MessageRow) => {
    setMobileDetail(row)
    setDetailLoading(true)
    try {
      const d = await getJSON<{ message: MessageRow; chain: ChainAttempt[] | null }>(`/api/admin/email/messages/${row.id}`)
      setDetail({ ...row, ...d.message, chain: d.chain ?? undefined })
    } catch {
      setDetail(row) // list fallback still shows basics
    } finally {
      setDetailLoading(false)
    }
  }

  const openCompose = () => {
    setForm({ identityId: identities[0]?.id ?? '', to: '', subject: '', bodyText: '', templateKey: '', vars: {} })
    setComposeOpen(true)
  }

  const send = async () => {
    if (!EMAIL_RE.test(form.to.trim())) {
      toast.error(`${tx('emaTo')}: ${form.to}`)
      return
    }
    setSending(true)
    try {
      const payload: Record<string, unknown> = { to: form.to.trim(), identityId: form.identityId || null }
      if (form.templateKey) {
        payload.templateKey = form.templateKey
        payload.vars = form.vars
      } else {
        payload.subject = form.subject.trim()
        payload.body = form.bodyText
      }
      const r = await postJSON<{ ok: boolean; provider: string; simulated: boolean; status: string; error?: string }>('/api/admin/email/send', payload)
      if (r.ok) {
        toast.success(`${tx('emaSentOkToast')} · ${r.provider}${r.simulated ? ' · ' + tx('emaSandboxTag') : ''}`)
        setComposeOpen(false)
        setDirection('SENT')
        await load('SENT', search)
      } else {
        toast.error(`${tx('emaSentFailToast')}: ${r.error ?? 'unknown'}`)
      }
    } catch (e) {
      toast.error(`${tx('emaSentFailToast')}: ${e instanceof Error ? e.message : e}`)
    } finally {
      setSending(false)
    }
  }

  const simulateInbound = async () => {
    setSimulating(true)
    try {
      const to = identities[0]?.email ?? 'support@invokeil.com'
      await postJSON('/api/admin/email/inbound', {
        from: tx('emaInboundDemoFrom'),
        to,
        subject: tx('emaInboundDemoSubject'),
        text: tx('emaInboundDemoBody'),
      })
      toast.success(tx('emaInboundOkToast'))
      setDirection('RECEIVED')
      await load('RECEIVED', search)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setSimulating(false)
    }
  }

  const removeMessage = async (id: string) => {
    try {
      await postJSON(`/api/admin/email/messages/${id}`, {}, 'DELETE')
      toast.success(tx('emaDeletedToast'))
      setDetail(null)
      setMobileDetail(null)
      await load(direction, search)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }

  const selTemplate = templates.find((t) => t.key === form.templateKey)
  const rows = data?.items ?? []

  const list = (
    <div className={`overflow-hidden rounded-xl border bg-card ${detail ? 'hidden lg:block' : ''}`}>
      <div className="border-b p-2">
        <div className="relative">
          <Input aria-label="search" className="h-9 pl-3" placeholder="Search…" value={search} onChange={(e) => onSearch(e.target.value)} />
        </div>
      </div>
      <div className="max-h-[480px] overflow-y-auto nice-scroll">
        {rows.length === 0 ? (
          <EmptyState icon={<Inbox className="h-7 w-7" />} title={tx('emaInboxEmpty')} hint={tx('emaInboxEmptyHint')} />
        ) : (
          rows.map((m) => (
            <button
              key={m.id} type="button"
              onClick={() => void openDetail(m)}
              className={`flex w-full flex-col gap-0.5 border-b p-3 text-left transition-colors last:border-0 hover:bg-muted/40 ${
                (detail?.id ?? mobileDetail?.id) === m.id ? 'bg-primary/5' : ''
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs font-semibold text-foreground">{direction === 'SENT' ? m.toAddress : m.fromAddress ?? '—'}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground">{formatDateTime(m.receivedAt ?? m.sentAt ?? m.createdAt)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs text-muted-foreground">{m.subject}</span>
                <StatusChip status={m.status} label={stLabel(tx, m.status)} />
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )

  const detailPane = detail ? (
    <div className="rounded-xl border bg-card">
      <div className="flex items-start justify-between gap-2 border-b p-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-foreground">{detail.subject}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {detail.direction === 'SENT' ? `${tx('emaTo')}: ${detail.toAddress}` : `${tx('emaFrom')}: ${detail.fromAddress ?? '—'}`}
          </p>
          <p className="text-[11px] text-muted-foreground">{formatDateTime(detail.receivedAt ?? detail.sentAt ?? detail.createdAt)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <StatusChip status={detail.status} label={stLabel(tx, detail.status)} />
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 lg:hidden" aria-label="close" onClick={() => { setDetail(null); setMobileDetail(null) }}>
            <XCircle className="h-4 w-4" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="ghost" className="press h-8 w-8 p-0 text-muted-foreground hover:text-destructive" aria-label={tx('emaDelete')}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{tx('emaDelete')}?</AlertDialogTitle>
                <AlertDialogDescription>{tx('emaDeleteMsg')}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{tx('emaClose')}</AlertDialogCancel>
                <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={() => void removeMessage(detail.id)}>
                  {tx('emaDelete')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
      <div className="max-h-[420px] space-y-3 overflow-y-auto nice-scroll p-4">
        {detail.bodyHtml ? (
          <iframe title="message-body" sandbox="" srcDoc={detail.bodyHtml} className="h-64 w-full rounded-lg border bg-white" />
        ) : (
          <p className="whitespace-pre-wrap rounded-lg bg-muted/40 p-3 text-xs text-foreground">{detail.error ?? '—'}</p>
        )}
        <div className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
          <p><span className="text-muted-foreground">{tx('emaStatus')}:</span> <b className="text-foreground">{detail.status}</b></p>
          <p><span className="text-muted-foreground">{tx('emaProvider')}:</span> <b className="text-foreground">{detail.providerType ?? '—'}</b></p>
          {detail.templateKey && <p><span className="text-muted-foreground">{tx('emaTemplate')}:</span> <b className="font-mono text-foreground">{detail.templateKey}</b></p>}
          <p><span className="text-muted-foreground">{tx('emaCost')}:</span> <b className="text-foreground">{formatBDT(detail.cost)}</b></p>
          <p><span className="text-muted-foreground">{tx('emaAttempts')}:</span> <b className="text-foreground">{detail.attempts}</b></p>
          {detail.relatedType && <p><span className="text-muted-foreground">{tx('emaRelated')}:</span> <b className="text-foreground">{detail.relatedType}</b></p>}
        </div>
        {detail.error && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
            <b>{tx('emaErrorLabel')}:</b> {detail.error}
          </p>
        )}
        {detail.chain && detail.chain.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-semibold text-muted-foreground">{tx('emaChainLog')}</p>
            <div className="space-y-1">
              {detail.chain.map((a, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg bg-muted/40 p-2 text-xs">
                  <Dot ok={a.ok} />
                  <b className="text-foreground">{a.provider}</b>
                  <span className="truncate text-muted-foreground" title={a.detail}>{a.detail}</span>
                  <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{a.ms}ms</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  ) : (
    <div className="hidden lg:block">
      <EmptyState icon={<Mail className="h-7 w-7" />} title={tx('emaTabInbox')} hint={tx('emaInboxEmptyHint')} />
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex overflow-hidden rounded-full border">
          {(['SENT', 'RECEIVED'] as const).map((d) => (
            <button
              key={d} type="button"
              onClick={() => { setDirection(d); setDetail(null); setMobileDetail(null) }}
              className={`press inline-flex h-9 items-center gap-1.5 px-4 text-xs font-semibold transition-colors ${direction === d ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {d === 'SENT' ? <Send className="h-3.5 w-3.5" /> : <Inbox className="h-3.5 w-3.5" />}
              {d === 'SENT' ? tx('emaInboxSent') : tx('emaInboxReceived')}
            </button>
          ))}
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <Button variant="outline" size="sm" className="press h-9 min-w-0 gap-1.5" disabled={simulating} onClick={() => void simulateInbound()}>
            <FlaskConical className={`h-3.5 w-3.5 shrink-0 ${simulating ? 'animate-spin' : ''}`} />
            <span className="min-w-0 truncate">{tx('emaSimulateInbound')}</span>
            <Badge variant="secondary" className="ml-0.5 shrink-0">{tx('emaSandboxTag')}</Badge>
          </Button>
          <Button size="sm" className="press h-9 gap-1.5" onClick={openCompose}>
            <Plus className="h-4 w-4" /> {tx('emaCompose')}
          </Button>
        </div>
      </div>

      {loading && !data ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,380px)_1fr]">
          <Skeleton className="h-96 rounded-xl" />
          <Skeleton className="hidden h-96 rounded-xl lg:block" />
        </div>
      ) : error ? (
        <ErrorCard message={error} onRetry={() => void load(direction, search)} />
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,380px)_1fr]">
          {list}
          {detailPane}
        </div>
      )}

      {/* Mobile detail dialog */}
      <Dialog open={!!mobileDetail} onOpenChange={(v) => !v && setMobileDetail(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          {mobileDetail && (
            <div className="space-y-3">
              <DialogHeader>
                <DialogTitle className="text-base">{mobileDetail.subject}</DialogTitle>
                <DialogDescription>
                  {mobileDetail.direction === 'SENT' ? `${tx('emaTo')}: ${mobileDetail.toAddress}` : `${tx('emaFrom')}: ${mobileDetail.fromAddress ?? '—'}`}
                  {' · '}{formatDateTime(mobileDetail.receivedAt ?? mobileDetail.sentAt ?? mobileDetail.createdAt)}
                </DialogDescription>
              </DialogHeader>
              {detailLoading ? (
                <Skeleton className="h-40 w-full" />
              ) : detail && detail.id === mobileDetail.id ? (
                <>
                  {detail.bodyHtml && <iframe title="message-body-mobile" sandbox="" srcDoc={detail.bodyHtml} className="h-56 w-full rounded-lg border bg-white" />}
                  {detail.error && !detail.bodyHtml && (
                    <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">{detail.error}</p>
                  )}
                  {detail.chain && detail.chain.length > 0 && (
                    <div className="space-y-1">
                      {detail.chain.map((a, i) => (
                        <div key={i} className="flex items-center gap-2 rounded-lg bg-muted/40 p-2 text-xs">
                          <Dot ok={a.ok} />
                          <b className="text-foreground">{a.provider}</b>
                          <span className="truncate text-muted-foreground">{a.detail}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : null}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Compose dialog */}
      <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{tx('emaCompose')}</DialogTitle>
            <DialogDescription>{tx('emaSandboxNote')}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">{tx('emaSelectIdentity')}</Label>
                <Select value={form.identityId || '__default'} onValueChange={(v) => setForm({ ...form, identityId: v === '__default' ? '' : v })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__default">{tx('emaNoIdentity')}</SelectItem>
                    {identities.map((i) => <SelectItem key={i.id} value={i.id}>{i.label} · {i.email}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{tx('emaTemplate')}</Label>
                <Select value={form.templateKey || '__none'} onValueChange={(v) => setForm({ ...form, templateKey: v === '__none' ? '' : v, vars: {} })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">{tx('emaNoTemplate')}</SelectItem>
                    {templates.map((t) => <SelectItem key={t.id} value={t.key}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ema-comp-to" className="text-xs">{tx('emaTo')} *</Label>
              <Input id="ema-comp-to" className="h-9" type="email" placeholder="customer@example.com" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} />
            </div>
            {!form.templateKey && (
              <div className="space-y-1.5">
                <Label htmlFor="ema-comp-subject" className="text-xs">{tx('emaTplSubject')} *</Label>
                <Input id="ema-comp-subject" className="h-9" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
              </div>
            )}
            {selTemplate && selTemplate.variables.length > 0 && (
              <div className="space-y-2 rounded-lg bg-muted/40 p-3">
                <p className="text-xs font-semibold text-muted-foreground">{tx('emaTplVars')}</p>
                {selTemplate.variables.map((v) => (
                  <div key={v} className="grid grid-cols-[140px_1fr] items-center gap-2">
                    <span className="font-mono text-[11px] text-muted-foreground">{`{{${v}}}`}</span>
                    <Input
                      className="h-8 text-xs" aria-label={v}
                      value={form.vars[v] ?? ''}
                      onChange={(e) => setForm({ ...form, vars: { ...form.vars, [v]: e.target.value } })}
                    />
                  </div>
                ))}
              </div>
            )}
            {!form.templateKey && (
              <div className="space-y-1.5">
                <Label htmlFor="ema-comp-body" className="text-xs">{tx('emaBodyText')} *</Label>
                <Textarea id="ema-comp-body" className="min-h-[120px]" value={form.bodyText} onChange={(e) => setForm({ ...form, bodyText: e.target.value })} />
              </div>
            )}
            {form.identityId === '' && <p className="text-[11px] text-muted-foreground">{tx('emaNoIdentity')}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" className="press" onClick={() => setComposeOpen(false)}>{tx('emaClose')}</Button>
            <Button className="press gap-1.5" disabled={sending} onClick={() => void send()}>
              <Send className="h-4 w-4" /> {sending ? tx('emaSending') : tx('emaSend')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── Analytics tab ────────────────────────────────────────────────────────────

function AnalyticsTab() {
  const tx = useEmaT()
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setData(await getJSON<AnalyticsData>('/api/admin/email/analytics'))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { void load() }, [load])

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}</div>
        <Skeleton className="h-56 w-full rounded-xl" />
      </div>
    )
  }
  if (error) return <ErrorCard message={error} onRetry={() => void load()} />
  if (!data) return null

  const maxSent = Math.max(...data.daily.map((d) => d.sent), 1)
  const bounceRate = data.totals.sent > 0 ? (data.totals.bounced / data.totals.sent) * 100 : 0

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="ilp-fade-up" style={{ animationDelay: '0ms' }}>
          <StatCard label={tx('emaAnSent')} value={String(data.totals.sent)} icon={<Send className="h-4 w-4" />} />
        </div>
        <div className="ilp-fade-up" style={{ animationDelay: '40ms' }}>
          <StatCard label={tx('emaAnFailed')} value={String(data.totals.failed)} icon={<AlertTriangle className="h-4 w-4" />} tone="text-destructive bg-destructive/10" />
        </div>
        <div className="ilp-fade-up" style={{ animationDelay: '80ms' }}>
          <StatCard label={tx('emaAnBounceRate')} value={`${bounceRate.toFixed(1)}%`} icon={<XCircle className="h-4 w-4" />} tone="text-amber-600 bg-amber-500/10 dark:text-amber-400" />
        </div>
        <div className="ilp-fade-up" style={{ animationDelay: '120ms' }}>
          <StatCard label={tx('emaAnReceived')} value={String(data.totals.received)} icon={<Inbox className="h-4 w-4" />} tone="text-success bg-success/10" />
        </div>
        <div className="ilp-fade-up" style={{ animationDelay: '160ms' }}>
          <StatCard label={tx('emaAnCost')} value={formatBDT(data.totals.costTotal)} icon={<BarChart3 className="h-4 w-4" />} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="ilp-fade-up">
          <CardContent className="p-4">
            <p className="mb-3 text-sm font-bold text-foreground">{tx('emaAnDaily')}</p>
            {data.totals.sent === 0 ? (
              <EmptyState title={tx('emaAnNothing')} />
            ) : (
              <div className="flex h-40 items-end gap-1.5">
                {data.daily.map((d) => (
                  <div key={d.date} className="group flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${d.date}: ${d.sent}`}>
                    <span className="text-[9px] font-bold text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">{d.sent}</span>
                    <div
                      className="w-full rounded-t bg-primary/70 transition-colors group-hover:bg-primary"
                      style={{ height: `${Math.max((d.sent / maxSent) * 100, 3)}%` }}
                    />
                    <span className="text-[9px] text-muted-foreground">{d.date.slice(8)}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 border-t pt-3 text-xs">
              <span className="text-muted-foreground">{tx('emaAnDelivery')}: <b className="text-foreground">{data.totals.delivered}</b></span>
              <span className="text-muted-foreground">{tx('emaAnOpenRate')}: <b className="text-foreground">{data.openRate.toFixed(1)}%</b></span>
              <span className="text-muted-foreground">{tx('emaAnClickRate')}: <b className="text-foreground">{data.clickRate.toFixed(1)}%</b></span>
            </div>
          </CardContent>
        </Card>

        <Card className="ilp-fade-up">
          <CardContent className="p-4">
            <p className="mb-3 text-sm font-bold text-foreground">{tx('emaAnProviderHealth')}</p>
            {data.providers.length === 0 ? (
              <EmptyState title={tx('emaAnNothing')} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] text-sm">
                  <thead>
                    <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                      <th className="pb-2 font-semibold">{tx('emaProvider')}</th>
                      <th className="pb-2 font-semibold">{tx('emaEnabled')}</th>
                      <th className="pb-2 font-semibold">{tx('emaSentCount')}</th>
                      <th className="pb-2 font-semibold">{tx('emaFailCount')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.providers.map((p) => (
                      <tr key={p.id} className="border-b last:border-0">
                        <td className="py-2.5">
                          <span className="flex items-center gap-2 font-semibold text-foreground">
                            <Dot ok={p.healthy && p.failCount === 0} warn={p.failCount > 0 && p.healthy} />
                            {p.type}
                          </span>
                          {p.lastError && <span className="block max-w-[220px] truncate text-[10px] text-destructive" title={p.lastError}>{p.lastError}</span>}
                        </td>
                        <td className="py-2.5">{p.enabled ? <Badge variant="outline" className="border-success/40 bg-success/10 text-success">✓</Badge> : <Badge variant="outline" className="text-muted-foreground">—</Badge>}</td>
                        <td className="py-2.5 tabular font-semibold text-foreground">{p.sentCount}</td>
                        <td className={`py-2.5 tabular font-semibold ${p.failCount > 0 ? 'text-destructive' : 'text-foreground'}`}>{p.failCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ── Root view ────────────────────────────────────────────────────────────────

export function EmailAutomationView() {
  const tx = useEmaT()
  const { get, set } = useUrlState()
  const tab = get('tab', 'providers')

  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader
        title={tx('emaTitle')}
        description={tx('emaSub')}
        icon={<Mail className="h-5 w-5" />}
      />
      <Tabs value={tab} onValueChange={(v) => set({ tab: v === 'providers' ? null : v })} className="space-y-4">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 sm:w-auto">
          <TabsTrigger value="providers" className="gap-1.5"><Plug className="h-3.5 w-3.5" /> {tx('emaTabProviders')}</TabsTrigger>
          <TabsTrigger value="identities" className="gap-1.5"><Users className="h-3.5 w-3.5" /> {tx('emaTabIdentities')}</TabsTrigger>
          <TabsTrigger value="templates" className="gap-1.5"><FileText className="h-3.5 w-3.5" /> {tx('emaTabTemplates')}</TabsTrigger>
          <TabsTrigger value="inbox" className="gap-1.5"><Inbox className="h-3.5 w-3.5" /> {tx('emaTabInbox')}</TabsTrigger>
          <TabsTrigger value="analytics" className="gap-1.5"><BarChart3 className="h-3.5 w-3.5" /> {tx('emaTabAnalytics')}</TabsTrigger>
        </TabsList>
        <TabsContent value="providers"><ProvidersTab /></TabsContent>
        <TabsContent value="identities"><IdentitiesTab /></TabsContent>
        <TabsContent value="templates"><TemplatesTab /></TabsContent>
        <TabsContent value="inbox"><InboxTab /></TabsContent>
        <TabsContent value="analytics"><AnalyticsTab /></TabsContent>
      </Tabs>
    </div>
  )
}
