'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Workflow, Zap, Plus, Play, History, Pencil, Trash2, RefreshCcw, Clock, Layers,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
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
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { fetchApi } from '@/lib/api-client'
import { formatDateTime, timeAgo } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useLang } from '@/lib/i18n'
import { PageHeader, EmptyState, ErrorCard } from './ui-bits'

// ── Types ────────────────────────────────────────────────────────────────────

interface ConditionUI { field: string; op: string; value: string }

interface ActionUI {
  type: string
  to?: string
  subject?: string
  body?: string
  value?: string
  minutes?: number
  field?: string
  op?: string
  then?: ActionUI[]
  else?: ActionUI[]
}

interface BrandOption { id: string; name: string }

interface AutomationRow {
  id: string
  name: string
  description: string | null
  trigger: string
  conditions: ConditionUI[]
  actions: ActionUI[]
  enabled: boolean
  runCount: number
  lastRunAt: string | null
  brandId: string | null
  brand?: BrandOption | null
  builtIn: boolean
  createdAt: string
}

interface TemplateRow {
  key: string
  name: string
  description: string
  trigger: string
  conditions: unknown
  actions: ActionUI[]
}

interface RunRow {
  id: string
  automationId: string
  status: string
  context: string | null
  log: string | null
  waitUntil: string | null
  createdAt: string
  finishedAt: string | null
  automation?: { id: string; name: string; trigger: string } | null
}

interface LogEntry { step: string; ok: boolean; detail: string; at: string }

interface BuilderForm {
  name: string
  description: string
  trigger: string
  brandId: string
  enabled: boolean
  conditions: ConditionUI[]
  actions: ActionUI[]
}

// ── Constants ────────────────────────────────────────────────────────────────

const TRIGGERS = [
  'PAYMENT_PAID', 'PAYMENT_UNPAID_30M', 'PAYMENT_UNPAID_24H', 'CHECKOUT_CREATED',
  'INVOICE_OVERDUE', 'LINK_USED', 'SUBSCRIPTION_DUE', 'RISK_FLAGGED', 'MANUAL',
] as const

const CONDITION_FIELDS = ['amount', 'mfs', 'gateway', 'customer_name', 'customer_email', 'customer_phone', 'status'] as const
const CONDITION_OPS = ['eq', 'ne', 'gt', 'lt', 'contains'] as const
const ACTION_TYPES = ['SEND_EMAIL', 'SEND_SMS', 'WEBHOOK', 'ADD_NOTE', 'TAG_CUSTOMER', 'BRANCH', 'WAIT'] as const

const TONE: Record<string, string> = {
  success: 'bg-success/10 text-success border-success/25',
  warning: 'bg-warning/15 text-amber-700 dark:text-amber-400 border-warning/30',
  destructive: 'bg-destructive/10 text-destructive border-destructive/25',
  info: 'bg-primary/10 text-primary border-primary/25',
  neutral: 'bg-muted text-muted-foreground border-border',
}

const TRIGGER_TONE: Record<string, string> = {
  PAYMENT_PAID: 'success',
  PAYMENT_UNPAID_30M: 'warning',
  PAYMENT_UNPAID_24H: 'warning',
  CHECKOUT_CREATED: 'info',
  INVOICE_OVERDUE: 'warning',
  LINK_USED: 'info',
  SUBSCRIPTION_DUE: 'info',
  RISK_FLAGGED: 'destructive',
  MANUAL: 'neutral',
}

const RUN_TONE: Record<string, string> = {
  RUNNING: 'info',
  WAITING: 'warning',
  SUCCESS: 'success',
  FAILED: 'destructive',
  CANCELLED: 'neutral',
}

// ── Shape guards ─────────────────────────────────────────────────────────────

function isAutomationsData(d: unknown): d is { automations: AutomationRow[]; brands: BrandOption[] } {
  if (!d || typeof d !== 'object') return false
  const o = d as Partial<{ automations: unknown; brands: unknown }>
  return Array.isArray(o.automations) && Array.isArray(o.brands)
}

function isTemplatesData(d: unknown): d is { templates: TemplateRow[] } {
  if (!d || typeof d !== 'object') return false
  return Array.isArray((d as Partial<{ templates: unknown }>).templates)
}

function isRunsData(d: unknown): d is { runs: RunRow[]; total: number; page: number; pages: number } {
  if (!d || typeof d !== 'object') return false
  const o = d as Partial<{ runs: unknown; total: unknown; page: unknown; pages: unknown }>
  return Array.isArray(o.runs) && typeof o.total === 'number' && typeof o.page === 'number' && typeof o.pages === 'number'
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function newAction(type: string): ActionUI {
  switch (type) {
    case 'SEND_EMAIL': return { type, to: '', subject: '', body: '' }
    case 'SEND_SMS': return { type, to: '', body: '' }
    case 'WEBHOOK': return { type, to: '' }
    case 'ADD_NOTE': return { type, body: '' }
    case 'TAG_CUSTOMER': return { type, value: '' }
    case 'WAIT': return { type, minutes: 5 }
    case 'BRANCH': return { type, field: 'amount', op: 'gt', value: '', then: [], else: [] }
    default: return { type: 'SEND_EMAIL', to: '', subject: '', body: '' }
  }
}

function fieldKey(f: string): string {
  return `autoFld${f.charAt(0).toUpperCase()}${f.slice(1)}`
}

function opKey(o: string): string {
  return `autoOp${o.charAt(0).toUpperCase()}${o.slice(1)}`
}

function actionsOk(actions: ActionUI[]): boolean {
  return actions.every((a) => {
    switch (a.type) {
      case 'SEND_EMAIL':
      case 'SEND_SMS':
      case 'WEBHOOK':
        return !!a.to?.trim()
      case 'ADD_NOTE':
        return !!a.body?.trim()
      case 'TAG_CUSTOMER':
        return !!a.value?.trim()
      case 'BRANCH':
        return actionsOk(a.then ?? []) && actionsOk(a.else ?? [])
      default:
        return true
    }
  })
}

function parseLog(raw: string | null): LogEntry[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (e): e is LogEntry => !!e && typeof e === 'object' && 'step' in (e as LogEntry)
    )
  } catch {
    return []
  }
}

function replaceAt<T>(list: T[], i: number, item: T): T[] {
  return list.map((x, xi) => (xi === i ? item : x))
}

// ── Small components ─────────────────────────────────────────────────────────

function TriggerBadge({ trigger }: { trigger: string }) {
  const { t } = useLang()
  return (
    <Badge variant="outline" className={cn('text-[11px] font-semibold', TONE[TRIGGER_TONE[trigger] ?? 'neutral'])}>
      {t(`autoTrg${trigger}`)}
    </Badge>
  )
}

function RunStatusBadge({ status }: { status: string }) {
  const { t } = useLang()
  return (
    <Badge variant="outline" className={cn('text-[11px] font-semibold', TONE[RUN_TONE[status] ?? 'neutral'])}>
      {t(`autoSt${status}`)}
    </Badge>
  )
}

function ConditionRow({ cond, onChange, onRemove }: {
  cond: ConditionUI
  onChange: (next: ConditionUI) => void
  onRemove: () => void
}) {
  const { t } = useLang()
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={cond.field} onValueChange={(v) => onChange({ ...cond, field: v })}>
        <SelectTrigger className="h-9 w-full sm:w-[170px]" aria-label={t('autoField')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {CONDITION_FIELDS.map((f) => (
            <SelectItem key={f} value={f}>{t(fieldKey(f))}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={cond.op} onValueChange={(v) => onChange({ ...cond, op: v })}>
        <SelectTrigger className="h-9 w-full sm:w-[130px]" aria-label={t('autoOperator')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {CONDITION_OPS.map((o) => (
            <SelectItem key={o} value={o}>{t(opKey(o))}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        value={cond.value}
        onChange={(e) => onChange({ ...cond, value: e.target.value })}
        placeholder={t('autoValue')}
        className="h-9 min-w-[120px] flex-1"
        aria-label={t('autoValue')}
      />
      <Button type="button" variant="outline" size="icon" className="press h-9 w-9 shrink-0 text-destructive" onClick={onRemove} aria-label={t('autoDelete')}>
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  )
}

/** One action row — per-type fields; BRANCH nests then/else exactly one level. */
function ActionEditor({ action, onChange, onRemove, depth = 0 }: {
  action: ActionUI
  onChange: (next: ActionUI) => void
  onRemove: () => void
  depth?: number
}) {
  const { t } = useLang()
  const types = ACTION_TYPES.filter((ty) => depth === 0 || ty !== 'BRANCH')

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center gap-2">
        <Select value={action.type} onValueChange={(v) => onChange(newAction(v))}>
          <SelectTrigger className="h-9 w-full sm:w-[200px]" aria-label={t('autoActions')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {types.map((ty) => (
              <SelectItem key={ty} value={ty}>{t(`autoAct${ty}`)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" variant="outline" size="icon" className="press h-9 w-9 shrink-0 text-destructive" onClick={onRemove} aria-label={t('autoDelete')}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {(action.type === 'SEND_EMAIL' || action.type === 'SEND_SMS') && (
        <div className="mt-3 space-y-2.5">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">{t('autoTo')}</Label>
              <Input value={action.to ?? ''} onChange={(e) => onChange({ ...action, to: e.target.value })}
                placeholder={action.type === 'SEND_EMAIL' ? '{{customer_email}}' : '{{customer_phone}}'} className="h-9" />
              <p className="text-[10px] text-muted-foreground">
                {action.type === 'SEND_EMAIL' ? t('autoToEmailHint') : t('autoToSmsHint')}
              </p>
            </div>
            {action.type === 'SEND_EMAIL' && (
              <div className="space-y-1">
                <Label className="text-xs">{t('autoSubject')}</Label>
                <Input value={action.subject ?? ''} onChange={(e) => onChange({ ...action, subject: e.target.value })} className="h-9" />
              </div>
            )}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t('autoBody')}</Label>
            <Textarea value={action.body ?? ''} onChange={(e) => onChange({ ...action, body: e.target.value })} rows={3} className="min-h-[64px]" />
          </div>
        </div>
      )}

      {action.type === 'WEBHOOK' && (
        <div className="mt-3 space-y-1">
          <Label className="text-xs">{t('autoUrl')}</Label>
          <Input value={action.to ?? ''} onChange={(e) => onChange({ ...action, to: e.target.value })} placeholder="https://example.com/hooks/automation" className="h-9" />
          <p className="text-[10px] text-muted-foreground">{t('autoUrlHint')}</p>
        </div>
      )}

      {action.type === 'ADD_NOTE' && (
        <div className="mt-3 space-y-1">
          <Label className="text-xs">{t('autoNoteLabel')}</Label>
          <Textarea value={action.body ?? ''} onChange={(e) => onChange({ ...action, body: e.target.value })} rows={2} className="min-h-[52px]" />
        </div>
      )}

      {action.type === 'TAG_CUSTOMER' && (
        <div className="mt-3 space-y-1">
          <Label className="text-xs">{t('autoTag')}</Label>
          <Input value={action.value ?? ''} onChange={(e) => onChange({ ...action, value: e.target.value })} placeholder="vip" className="h-9" />
        </div>
      )}

      {action.type === 'WAIT' && (
        <div className="mt-3 space-y-1">
          <Label className="text-xs">{t('autoMinutes')}</Label>
          <Input
            type="number"
            min={0}
            value={String(action.minutes ?? 0)}
            onChange={(e) => {
              const n = Number(e.target.value)
              onChange({ ...action, minutes: Number.isFinite(n) && n >= 0 ? Math.round(n) : 0 })
            }}
            className="h-9 sm:w-40"
          />
          <p className="text-[10px] text-muted-foreground">{t('autoWaitNote')}</p>
        </div>
      )}

      {action.type === 'BRANCH' && depth === 0 && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground">{t('autoBranchField')}</span>
            <Select value={action.field ?? 'amount'} onValueChange={(v) => onChange({ ...action, field: v })}>
              <SelectTrigger className="h-9 w-full sm:w-[170px]" aria-label={t('autoField')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONDITION_FIELDS.map((f) => (
                  <SelectItem key={f} value={f}>{t(fieldKey(f))}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={action.op ?? 'gt'} onValueChange={(v) => onChange({ ...action, op: v })}>
              <SelectTrigger className="h-9 w-full sm:w-[130px]" aria-label={t('autoOperator')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONDITION_OPS.map((o) => (
                  <SelectItem key={o} value={o}>{t(opKey(o))}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={action.value ?? ''}
              onChange={(e) => onChange({ ...action, value: e.target.value })}
              placeholder={t('autoValue')}
              className="h-9 min-w-[120px] flex-1"
              aria-label={t('autoValue')}
            />
          </div>
          <p className="text-[10px] text-muted-foreground">{t('autoBranchHint')}</p>

          {(['then', 'else'] as const).map((branch) => (
            <div key={branch} className="rounded-lg border border-dashed bg-muted/30 p-3">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                {branch === 'then' ? t('autoBranchThen') : t('autoBranchElse')}
              </p>
              <div className="space-y-2">
                {(branch === 'then' ? action.then : action.else)?.map((child, ci) => (
                  <ActionEditor
                    key={ci}
                    depth={1}
                    action={child}
                    onChange={(next) => onChange({ ...action, [branch]: replaceAt(branch === 'then' ? action.then ?? [] : action.else ?? [], ci, next) })}
                    onRemove={() => {
                      const list = branch === 'then' ? action.then ?? [] : action.else ?? []
                      onChange({ ...action, [branch]: list.filter((_, li) => li !== ci) })
                    }}
                  />
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="press mt-2 h-8 gap-1"
                onClick={() => onChange({ ...action, [branch]: [...(branch === 'then' ? action.then : action.else) ?? [], newAction('SEND_EMAIL')] })}
              >
                <Plus className="h-3.5 w-3.5" /> {t('autoAddBranchAction')}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── View ─────────────────────────────────────────────────────────────────────

export function AutomationsView() {
  const { t } = useLang()

  // list + templates
  const [data, setData] = useState<{ automations: AutomationRow[]; brands: BrandOption[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [templates, setTemplates] = useState<TemplateRow[]>([])
  const [installing, setInstalling] = useState<string | null>(null)

  // engine chip + queue
  const [engineOn, setEngineOn] = useState<boolean | null>(null)
  const [tickBusy, setTickBusy] = useState(false)

  // builder
  const [builderOpen, setBuilderOpen] = useState(false)
  const [editing, setEditing] = useState<AutomationRow | null>(null)
  const [form, setForm] = useState<BuilderForm>({
    name: '', description: '', trigger: 'PAYMENT_PAID', brandId: '', enabled: true, conditions: [], actions: [],
  })
  const [saving, setSaving] = useState(false)

  // delete confirm
  const [deleteTarget, setDeleteTarget] = useState<AutomationRow | null>(null)
  const [deleting, setDeleting] = useState(false)

  // manual run
  const [runFor, setRunFor] = useState<AutomationRow | null>(null)
  const [runEmail, setRunEmail] = useState('')
  const [runAmount, setRunAmount] = useState('500')
  const [runBusy, setRunBusy] = useState(false)

  // history drawer
  const [historyFor, setHistoryFor] = useState<AutomationRow | null>(null)
  const [runsPage, setRunsPage] = useState(1)
  const [runsStatus, setRunsStatus] = useState('ALL')
  const [runsData, setRunsData] = useState<{ runs: RunRow[]; total: number; page: number; pages: number } | null>(null)
  const [runsLoading, setRunsLoading] = useState(false)
  const [runsError, setRunsError] = useState<string | null>(null)
  const [selectedRun, setSelectedRun] = useState<RunRow | null>(null)

  const automations = data?.automations ?? []
  const brands = data?.brands ?? []

  // ── data loading ──

  const loadAutomations = useCallback(async () => {
    try {
      const d = await fetchApi<unknown>('/api/admin/automations')
      if (!isAutomationsData(d)) throw new Error('Unexpected response from server')
      setError(null)
      setData(d)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadTemplates = useCallback(async () => {
    try {
      const d = await fetchApi<unknown>('/api/admin/automations/templates')
      if (isTemplatesData(d)) setTemplates(d.templates)
    } catch { /* gallery is non-critical */ }
  }, [])

  const loadEngine = useCallback(async () => {
    try {
      const d = await fetchApi<{ settings?: { automationEnabled?: string } }>('/api/admin/settings')
      setEngineOn(d.settings?.automationEnabled === 'true')
    } catch {
      setEngineOn(null)
    }
  }, [])

  const loadRuns = useCallback(async (automationId: string, page: number, status: string) => {
    setRunsLoading(true)
    try {
      const params = new URLSearchParams({ automationId, page: String(page) })
      if (status && status !== 'ALL') params.set('status', status)
      const d = await fetchApi<unknown>(`/api/admin/automations/runs?${params.toString()}`)
      if (!isRunsData(d)) throw new Error('Unexpected response from server')
      setRunsError(null)
      setRunsData(d)
    } catch (e) {
      setRunsError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setRunsLoading(false)
    }
  }, [])

  useEffect(() => { loadAutomations(); loadTemplates(); loadEngine() }, [loadAutomations, loadTemplates, loadEngine])

  useEffect(() => {
    if (historyFor) loadRuns(historyFor.id, runsPage, runsStatus)
  }, [historyFor, runsPage, runsStatus, loadRuns])

  // ── actions ──

  const openCreate = () => {
    setEditing(null)
    setForm({ name: '', description: '', trigger: 'PAYMENT_PAID', brandId: '', enabled: true, conditions: [], actions: [newAction('SEND_EMAIL')] })
    setBuilderOpen(true)
  }

  const openEdit = (a: AutomationRow) => {
    setEditing(a)
    setForm({
      name: a.name,
      description: a.description ?? '',
      trigger: a.trigger,
      brandId: a.brandId ?? '',
      enabled: a.enabled,
      conditions: a.conditions.map((c) => ({ ...c })),
      actions: JSON.parse(JSON.stringify(a.actions)) as ActionUI[],
    })
    setBuilderOpen(true)
  }

  const submitBuilder = async () => {
    if (!form.name.trim()) { toast.error(t('autoNameRequired')); return }
    if (form.actions.length === 0 || !actionsOk(form.actions)) { toast.error(t('autoFillRequired')); return }
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        trigger: form.trigger,
        enabled: form.enabled,
        brandId: form.brandId || undefined,
        conditions: form.conditions,
        actions: form.actions,
      }
      if (editing) {
        await fetchApi(`/api/admin/automations/${editing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        toast.success(t('autoUpdated'))
      } else {
        await fetchApi('/api/admin/automations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        toast.success(t('autoCreated'))
      }
      setBuilderOpen(false)
      await loadAutomations()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setSaving(false)
    }
  }

  const toggleEnabled = async (a: AutomationRow, next: boolean) => {
    setData((d) => d ? { ...d, automations: d.automations.map((x) => (x.id === a.id ? { ...x, enabled: next } : x)) } : d)
    try {
      await fetchApi(`/api/admin/automations/${a.id}/toggle`, { method: 'POST' })
    } catch (e) {
      setData((d) => d ? { ...d, automations: d.automations.map((x) => (x.id === a.id ? { ...x, enabled: a.enabled } : x)) } : d)
      toast.error(e instanceof Error ? e.message : 'Request failed')
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await fetchApi(`/api/admin/automations/${deleteTarget.id}`, { method: 'DELETE' })
      toast.success(t('autoDeleted'))
      setDeleteTarget(null)
      await loadAutomations()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setDeleting(false)
    }
  }

  const installTemplate = async (tpl: TemplateRow) => {
    setInstalling(tpl.key)
    try {
      await fetchApi('/api/admin/automations/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: tpl.key }),
      })
      toast.success(t('autoInstalled'))
      await loadAutomations()
    } catch (e) {
      const status = (e as { status?: number }).status
      if (status === 409) toast.info(t('autoAlreadyInstalled'))
      else toast.error(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setInstalling(null)
    }
  }

  const processQueue = async () => {
    setTickBusy(true)
    try {
      const d = await fetchApi<{ resumed?: number; scheduled?: number }>('/api/admin/automations/tick', { method: 'POST' })
      toast.success(
        t('autoQueueResult')
          .replace('{r}', String(d.resumed ?? 0))
          .replace('{s}', String(d.scheduled ?? 0))
      )
      await loadAutomations()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setTickBusy(false)
    }
  }

  const submitRun = async () => {
    if (!runFor) return
    const target = runFor
    setRunBusy(true)
    try {
      const d = await fetchApi<{ fired: number; engineEnabled: boolean; warning?: string }>(`/api/admin/automations/${target.id}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerEmail: runEmail.trim() || undefined,
          amount: Number(runAmount) > 0 ? Number(runAmount) : undefined,
        }),
      })
      setRunFor(null)
      if (!d.engineEnabled) toast.error(t('autoRunEngineOff'))
      else if (d.fired > 0) toast.success(t('autoRunFired').replace('{n}', String(d.fired)))
      else toast.warning(t('autoRunNotFired').replace('{t}', t(`autoTrg${target.trigger}`)))
      await loadAutomations()
      if (historyFor) loadRuns(historyFor.id, runsPage, runsStatus)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setRunBusy(false)
    }
  }

  const openHistory = (a: AutomationRow) => {
    setHistoryFor(a)
    setRunsPage(1)
    setRunsStatus('ALL')
    setSelectedRun(null)
    setRunsData(null)
  }

  const summary = (a: AutomationRow): string => {
    const parts = [t('autoNActions').replace('{n}', String(a.actions.length))]
    if (a.conditions.length > 0) parts.push(t('autoNConditions').replace('{n}', String(a.conditions.length)))
    return parts.join(' · ')
  }

  // ── render ──

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <PageHeader
        title={t('autoTitle')}
        description={t('autoSub')}
        icon={<Workflow className="h-5 w-5" />}
        actions={
          <>
            <span
              title={t('autoEngineHint')}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold',
                engineOn == null ? TONE.neutral : engineOn ? TONE.success : TONE.warning
              )}
            >
              <Zap className="h-3.5 w-3.5" />
              {engineOn == null ? '…' : engineOn ? t('autoEngineOn') : t('autoEngineOff')}
            </span>
            <Button variant="outline" className="press h-9 gap-1.5" onClick={processQueue} disabled={tickBusy}>
              <RefreshCcw className={cn('h-4 w-4', tickBusy && 'animate-spin')} />
              {t('autoProcessQueue')}
            </Button>
            <Button className="press h-9 gap-1.5" onClick={openCreate}>
              <Plus className="h-4 w-4" />
              {t('autoNew')}
            </Button>
          </>
        }
      />

      {/* Workflow template gallery */}
      <section className="mb-6" aria-label={t('autoTemplates')}>
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-bold tracking-tight text-foreground">{t('autoTemplates')}</h2>
          <p className="hidden text-xs text-muted-foreground sm:block">{t('autoTemplatesHint')}</p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((tpl, i) => (
            <Card key={tpl.key} className="anim-fade-up hover-lift flex flex-col gap-2 p-4" style={{ animationDelay: `${i * 40}ms` }}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-bold leading-snug text-foreground">{tpl.name}</p>
                <TriggerBadge trigger={tpl.trigger} />
              </div>
              <p className="flex-1 text-xs leading-relaxed text-muted-foreground">{tpl.description}</p>
              <div className="flex items-center justify-between gap-2 pt-1">
                <span className="text-[11px] font-medium text-muted-foreground">
                  {t('autoNActions').replace('{n}', String(tpl.actions?.length ?? 0))}
                </span>
                <Button size="sm" className="press h-8 gap-1.5" disabled={installing === tpl.key} onClick={() => installTemplate(tpl)}>
                  <Zap className="h-3.5 w-3.5" />
                  {installing === tpl.key ? t('autoInstalling') : t('autoInstall')}
                </Button>
              </div>
            </Card>
          ))}
          {templates.length === 0 &&
            [0, 1, 2].map((i) => (
              <Card key={i} className="p-4">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="mt-2 h-3 w-full" />
                <Skeleton className="mt-2 h-3 w-1/2" />
                <Skeleton className="mt-4 h-8 w-24" />
              </Card>
            ))}
        </div>
      </section>

      {/* Automation list */}
      <section aria-label={t('autoTitle')}>
        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Card key={i} className="p-4">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="mt-2 h-3 w-2/3" />
                <Skeleton className="mt-3 h-8 w-full" />
              </Card>
            ))}
          </div>
        ) : error ? (
          <ErrorCard message={error} onRetry={() => { setLoading(true); loadAutomations() }} />
        ) : automations.length === 0 ? (
          <EmptyState
            icon={<Workflow className="h-7 w-7" />}
            title={t('autoNoAutomations')}
            hint={t('autoNoAutomationsHint')}
            action={
              <Button className="press h-9 gap-1.5" onClick={openCreate}>
                <Plus className="h-4 w-4" /> {t('autoNew')}
              </Button>
            }
          />
        ) : (
          <div className="space-y-3">
            {automations.map((a, i) => (
              <Card key={a.id} className={cn('anim-fade-up p-4', !a.enabled && 'opacity-75')} style={{ animationDelay: `${i * 40}ms` }}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-bold text-foreground">{a.name}</p>
                      {a.builtIn && (
                        <Badge variant="outline" className="gap-1 text-[10px] font-semibold text-primary border-primary/25">
                          <Layers className="h-3 w-3" /> {t('autoBuiltIn')}
                        </Badge>
                      )}
                      <TriggerBadge trigger={a.trigger} />
                    </div>
                    {a.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{a.description}</p>}
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-muted-foreground">
                      <Badge variant="secondary" className="text-[10px]">{summary(a)}</Badge>
                      <Badge variant="secondary" className="text-[10px]">{t('autoRunsCount').replace('{n}', String(a.runCount))}</Badge>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {t('autoLastRun')}: {a.lastRunAt ? timeAgo(a.lastRunAt) : t('autoNever')}
                      </span>
                      {a.brand && <span>{t('autoBrandChip').replace('{b}', a.brand.name)}</span>}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 lg:justify-end">
                    <Switch checked={a.enabled} onCheckedChange={(v) => toggleEnabled(a, v)} aria-label={t('autoEnabled')} />
                    <Button variant="outline" size="sm" className="press h-8 gap-1" onClick={() => { setRunFor(a); setRunEmail(''); setRunAmount('500') }}>
                      <Play className="h-3.5 w-3.5" /> {t('autoRunNow')}
                    </Button>
                    <Button variant="outline" size="sm" className="press h-8 gap-1" onClick={() => openHistory(a)}>
                      <History className="h-3.5 w-3.5" /> {t('autoHistory')}
                    </Button>
                    <Button variant="outline" size="sm" className="press h-8 gap-1" onClick={() => openEdit(a)}>
                      <Pencil className="h-3.5 w-3.5" /> {t('autoEditBtn')}
                    </Button>
                    <Button variant="outline" size="sm" className="press h-8 w-8 p-0 text-destructive hover:bg-destructive/10" onClick={() => setDeleteTarget(a)} aria-label={t('autoDelete')}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Builder dialog */}
      <Dialog open={builderOpen} onOpenChange={setBuilderOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? t('autoEditTitle') : t('autoCreateTitle')}</DialogTitle>
            <DialogDescription>{t('autoVarsHint')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-1">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">{t('autoName')} *</Label>
                <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder={t('autoNamePlaceholder')} className="h-9" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t('autoDescription')}</Label>
                <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder={t('autoDescriptionPlaceholder')} className="h-9" />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs">{t('autoTrigger')}</Label>
                <Select value={form.trigger} onValueChange={(v) => setForm((f) => ({ ...f, trigger: v }))}>
                  <SelectTrigger className="h-9" aria-label={t('autoTrigger')}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TRIGGERS.map((tr) => (
                      <SelectItem key={tr} value={tr}>{t(`autoTrg${tr}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground">{t('autoTriggerHint')}</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t('autoBrand')}</Label>
                <Select value={form.brandId || 'ALL'} onValueChange={(v) => setForm((f) => ({ ...f, brandId: v === 'ALL' ? '' : v }))}>
                  <SelectTrigger className="h-9" aria-label={t('autoBrand')}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">{t('autoAllBrands')}</SelectItem>
                    {brands.map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Conditions */}
            <div className="rounded-lg border p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{t('autoConditions')}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="press h-7 gap-1 text-xs"
                  onClick={() => setForm((f) => ({ ...f, conditions: [...f.conditions, { field: 'amount', op: 'gt', value: '' }] }))}
                >
                  <Plus className="h-3.5 w-3.5" /> {t('autoAddCondition')}
                </Button>
              </div>
              {form.conditions.length === 0 && <p className="text-[11px] text-muted-foreground">{t('autoConditionsHint')}</p>}
              <div className="space-y-2">
                {form.conditions.map((c, i) => (
                  <ConditionRow
                    key={i}
                    cond={c}
                    onChange={(next) => setForm((f) => ({ ...f, conditions: replaceAt(f.conditions, i, next) }))}
                    onRemove={() => setForm((f) => ({ ...f, conditions: f.conditions.filter((_, ci) => ci !== i) }))}
                  />
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="rounded-lg border p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{t('autoActions')}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="press h-7 gap-1 text-xs"
                  onClick={() => setForm((f) => ({ ...f, actions: [...f.actions, newAction('SEND_EMAIL')] }))}
                >
                  <Plus className="h-3.5 w-3.5" /> {t('autoAddAction')}
                </Button>
              </div>
              <p className="mb-2 text-[11px] text-muted-foreground">{t('autoActionsHint')}</p>
              <div className="space-y-2">
                {form.actions.map((a, i) => (
                  <ActionEditor
                    key={i}
                    action={a}
                    onChange={(next) => setForm((f) => ({ ...f, actions: replaceAt(f.actions, i, next) }))}
                    onRemove={() => setForm((f) => ({ ...f, actions: f.actions.filter((_, ai) => ai !== i) }))}
                  />
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 rounded-lg border p-3">
              <Label htmlFor="auto-enabled-switch" className="text-xs font-semibold">{t('autoEnabled')}</Label>
              <Switch
                id="auto-enabled-switch"
                checked={form.enabled}
                onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" className="press h-9" onClick={() => setBuilderOpen(false)} disabled={saving}>
              {t('autoCancel')}
            </Button>
            <Button className="press h-9 gap-1.5" onClick={submitBuilder} disabled={saving}>
              {saving && <RefreshCcw className="h-4 w-4 animate-spin" />}
              {saving ? t('autoSaving') : t('autoSave')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('autoDeleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('autoDeleteDesc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="press">{t('autoCancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="press bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); confirmDelete() }}
              disabled={deleting}
            >
              {deleting && <RefreshCcw className="mr-1.5 h-4 w-4 animate-spin" />}
              {t('autoDelete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Manual run dialog */}
      <Dialog open={!!runFor} onOpenChange={(o) => !o && setRunFor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('autoRunTitle')}</DialogTitle>
            <DialogDescription>{t('autoRunDesc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label className="text-xs">{t('autoRunTestEmail')}</Label>
              <Input value={runEmail} onChange={(e) => setRunEmail(e.target.value)} placeholder="test@invokeil.test" className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t('autoRunTestAmount')}</Label>
              <Input type="number" min={0} value={runAmount} onChange={(e) => setRunAmount(e.target.value)} className="h-9" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="press h-9" onClick={() => setRunFor(null)} disabled={runBusy}>{t('autoCancel')}</Button>
            <Button className="press h-9 gap-1.5" onClick={submitRun} disabled={runBusy}>
              {runBusy ? <RefreshCcw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {t('autoRunNow')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Run history drawer */}
      <Sheet open={!!historyFor} onOpenChange={(o) => !o && setHistoryFor(null)}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
          <SheetHeader className="border-b p-4 pb-3">
            <SheetTitle className="flex items-center gap-2 text-base">
              <History className="h-4 w-4 text-primary" />
              {selectedRun ? t('autoRunDetail') : t('autoRunHistory')}
            </SheetTitle>
            <SheetDescription className="text-xs">
              {historyFor?.name}
              {selectedRun ? ` · ${selectedRun.id.slice(-8)}` : ''}
            </SheetDescription>
          </SheetHeader>

          <div className="nice-scroll flex-1 overflow-y-auto p-4">
            {selectedRun ? (
              /* ── run detail: step timeline ── */
              <div>
                <Button variant="outline" size="sm" className="press mb-4 h-8 gap-1" onClick={() => setSelectedRun(null)}>
                  {t('autoBackToList')}
                </Button>
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <RunStatusBadge status={selectedRun.status} />
                  <span className="text-[11px] text-muted-foreground">{formatDateTime(selectedRun.createdAt)}</span>
                </div>
                {selectedRun.status === 'WAITING' && selectedRun.waitUntil && (
                  <p className="mb-4 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                    {t('autoWaitUntil')}: {formatDateTime(selectedRun.waitUntil)}
                  </p>
                )}
                {parseLog(selectedRun.log).length === 0 ? (
                  <p className="py-6 text-center text-xs text-muted-foreground">{t('autoNoRuns')}</p>
                ) : (
                  <div>
                    {parseLog(selectedRun.log).map((entry, i, arr) => (
                      <div key={i} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <span className={cn('mt-1 h-2.5 w-2.5 shrink-0 rounded-full', entry.ok ? 'bg-success' : 'bg-destructive')} />
                          {i < arr.length - 1 && <span className="w-px flex-1 bg-border" />}
                        </div>
                        <div className="pb-5">
                          <p className="font-mono text-[11px] font-bold text-foreground">{entry.step}</p>
                          <p className="mt-0.5 break-words text-xs text-muted-foreground">{entry.detail}</p>
                          <p className="mt-0.5 text-[10px] text-muted-foreground/70">{formatDateTime(entry.at)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              /* ── runs list ── */
              <div>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <Select
                    value={runsStatus}
                    onValueChange={(v) => { setRunsStatus(v); setRunsPage(1) }}
                  >
                    <SelectTrigger className="h-8 w-[150px] text-xs" aria-label={t('autoStatus')}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">{t('autoStatus')}: —</SelectItem>
                      {['SUCCESS', 'FAILED', 'WAITING', 'RUNNING', 'CANCELLED'].map((s) => (
                        <SelectItem key={s} value={s}>{t(`autoSt${s}`)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {runsData && (
                    <span className="text-[11px] text-muted-foreground">{t('autoRunsCount').replace('{n}', String(runsData.total))}</span>
                  )}
                </div>

                {runsLoading ? (
                  <div className="space-y-2">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="rounded-lg border p-3">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="mt-2 h-3 w-40" />
                      </div>
                    ))}
                  </div>
                ) : runsError ? (
                  <ErrorCard message={runsError} onRetry={() => historyFor && loadRuns(historyFor.id, runsPage, runsStatus)} />
                ) : !runsData || runsData.runs.length === 0 ? (
                  <EmptyState icon={<History className="h-6 w-6" />} title={t('autoNoRuns')} hint={t('autoNoRunsHint')} />
                ) : (
                  <>
                    <div className="space-y-2">
                      {runsData.runs.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          className="press w-full rounded-lg border bg-card p-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
                          onClick={() => setSelectedRun(r)}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <RunStatusBadge status={r.status} />
                            <span className="text-[10px] text-muted-foreground">{timeAgo(r.createdAt)}</span>
                          </div>
                          <p className="mt-1.5 text-[11px] text-muted-foreground">
                            {formatDateTime(r.createdAt)}
                            {r.finishedAt ? ` → ${formatDateTime(r.finishedAt)}` : ''}
                          </p>
                          {r.status === 'WAITING' && r.waitUntil && (
                            <p className="mt-1 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                              {t('autoWaitUntil')}: {formatDateTime(r.waitUntil)}
                            </p>
                          )}
                        </button>
                      ))}
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <Button
                        variant="outline" size="sm" className="press h-8"
                        disabled={runsData.page <= 1}
                        onClick={() => setRunsPage((p) => Math.max(1, p - 1))}
                      >
                        ‹ Prev
                      </Button>
                      <span className="text-[11px] text-muted-foreground">{runsData.page} / {runsData.pages}</span>
                      <Button
                        variant="outline" size="sm" className="press h-8"
                        disabled={runsData.page >= runsData.pages}
                        onClick={() => setRunsPage((p) => p + 1)}
                      >
                        Next ›
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
