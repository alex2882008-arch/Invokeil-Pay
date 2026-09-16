'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  ShieldAlert, Plus, Pencil, Trash2, RefreshCw, ListFilter, Play, ExternalLink, FlaskConical, Gavel,
} from 'lucide-react'
import Link from 'next/link'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { fetchApi } from '@/lib/api-client'
import { formatDateTime, timeAgo } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useUrlState } from '@/hooks/use-url-state'
import { useLang } from '@/lib/i18n'
import { isAdminRole } from '@/lib/roles'
import {
  PageHeader, StatCard, EmptyState, ErrorCard, Pagination, SearchInput,
} from './ui-bits'

// ── Types ────────────────────────────────────────────────────────────────────

interface RuleConfig {
  windowMin?: number
  maxCount?: number
  maxAmount?: number
  minAmount?: number
  startHour?: number
  endHour?: number
}

interface RiskRule {
  id: string
  name: string
  type: string
  config: RuleConfig
  action: string
  priority: number
  enabled: boolean
  hits: number
  lastHitAt: string | null
  createdAt: string
}

interface RiskCase {
  id: string
  ruleId: string | null
  rule?: { name: string; type: string; action: string } | null
  subjectType: string
  subjectRef: string
  score: number
  reason: string
  status: string
  decidedByName: string | null
  notes: string | null
  createdAt: string
  decidedAt: string | null
}

interface ListEntry {
  id: string
  list: string
  type: string
  value: string
  reason: string | null
  createdAt: string
}

interface CasesData {
  items: RiskCase[]
  total: number
  page: number
  pages: number
  counts: { open: number; cleared: number; blocked: number }
}

interface Verdict {
  action: 'ALLOW' | 'REVIEW' | 'BLOCK'
  cases: Array<{ id: string; rule: string; reason: string; score: number }>
  blocked: boolean
  score: number
}

const EMPTY_RULE_FORM = {
  name: '',
  type: 'VELOCITY',
  action: 'REVIEW',
  priority: 10,
  enabled: true,
  windowMin: 30,
  maxCount: 5,
  minAmount: 0,
  maxAmount: 25000,
  startHour: 1,
  endHour: 5,
}
type RuleForm = typeof EMPTY_RULE_FORM

const EMPTY_ENTRY_FORM = { list: 'BLOCK', type: 'PHONE', value: '', reason: '' }
type EntryForm = typeof EMPTY_ENTRY_FORM

const TYPE_BADGE: Record<string, string> = {
  VELOCITY: 'bg-primary/10 text-primary border-primary/25',
  AMOUNT_LIMIT: 'bg-primary/10 text-primary border-primary/25',
  LIST_MATCH: 'bg-muted text-muted-foreground border-border',
  HOUR_PATTERN: 'bg-muted text-muted-foreground border-border',
}

const ACTION_BADGE: Record<string, string> = {
  ALLOW: 'bg-success/10 text-success border-success/20',
  REVIEW: 'bg-warning/15 text-amber-700 dark:text-amber-400 border-warning/30',
  BLOCK: 'bg-destructive/10 text-destructive border-destructive/25',
}

const LIST_BADGE: Record<string, string> = {
  ALLOW: 'bg-success/10 text-success border-success/20',
  BLOCK: 'bg-destructive/10 text-destructive border-destructive/25',
}

// ── Component ────────────────────────────────────────────────────────────────

export function RiskView() {
  const { t } = useLang()
  const { get, getNum, set } = useUrlState()
  const tab = get('tab', 'rules')
  const casePage = getNum('page', 1)
  const caseStatus = get('status', 'ALL')

  const [rules, setRules] = useState<RiskRule[] | null>(null)
  const [cases, setCases] = useState<CasesData | null>(null)
  const [entries, setEntries] = useState<ListEntry[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Rule dialog
  const [ruleDialog, setRuleDialog] = useState(false)
  const [editingRule, setEditingRule] = useState<RiskRule | null>(null)
  const [ruleForm, setRuleForm] = useState<RuleForm>(EMPTY_RULE_FORM)
  const [ruleSaving, setRuleSaving] = useState(false)
  const [deletingRule, setDeletingRule] = useState<RiskRule | null>(null)
  const [ruleDeleteBusy, setRuleDeleteBusy] = useState(false)

  // Entry dialog
  const [entryDialog, setEntryDialog] = useState(false)
  const [entryForm, setEntryForm] = useState<EntryForm>(EMPTY_ENTRY_FORM)
  const [entrySaving, setEntrySaving] = useState(false)
  const [deletingEntry, setDeletingEntry] = useState<ListEntry | null>(null)
  const [entryDeleteBusy, setEntryDeleteBusy] = useState(false)

  // Case notes + busy
  const [caseNotes, setCaseNotes] = useState<Record<string, string>>({})
  const [caseBusy, setCaseBusy] = useState<string | null>(null)

  // Test evaluator
  const [testForm, setTestForm] = useState({ amount: '1000', phone: '', email: '', ip: '' })
  const [testRunning, setTestRunning] = useState(false)
  const [verdict, setVerdict] = useState<Verdict | null>(null)

  const canWrite = true // refined after me loads — kept simple: server enforces writes

  const cfgText = useCallback((r: RiskRule) => {
    const c = r.config
    const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
    if (r.type === 'VELOCITY') {
      return t('rskCfgVelocity')
        .replace('{n}', String(num(c.maxCount, 5)))
        .replace('{m}', String(num(c.windowMin, 60)))
    }
    if (r.type === 'AMOUNT_LIMIT') {
      return t('rskCfgAmount')
        .replace('{min}', c.minAmount != null ? String(c.minAmount) : '—')
        .replace('{max}', c.maxAmount != null ? String(c.maxAmount) : '—')
    }
    if (r.type === 'HOUR_PATTERN') {
      return t('rskCfgHours')
        .replace('{s}', String(num(c.startHour, 1)))
        .replace('{e}', String(num(c.endHour, 5)))
    }
    if (r.type === 'LIST_MATCH') return t('rskCfgList')
    return t('rskCfgNone')
  }, [t])

  const typeLabel = (ty: string) =>
    ty === 'VELOCITY' ? t('rskTypeVelocity')
      : ty === 'AMOUNT_LIMIT' ? t('rskTypeAmount')
      : ty === 'LIST_MATCH' ? t('rskTypeList')
      : ty === 'HOUR_PATTERN' ? t('rskTypeHour')
      : ty

  const actionLabel = (a: string) =>
    a === 'ALLOW' ? t('rskActionAllow') : a === 'BLOCK' ? t('rskActionBlock') : t('rskActionReview')

  const listTypeLabel = (ty: string) =>
    ty === 'PHONE' ? t('rskTypePhone')
      : ty === 'EMAIL' ? t('rskTypeEmail')
      : ty === 'IP' ? t('rskTypeIp')
      : ty === 'TRX' ? t('rskTypeTrx')
      : ty

  // ── Data loading ──

  const loadRules = useCallback(async () => {
    try {
      const res = await fetchApi<{ rules: RiskRule[] }>('/api/admin/risk/rules')
      setRules(res.rules)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed')
    }
  }, [])

  const loadCases = useCallback(async () => {
    const params = new URLSearchParams({ page: String(casePage) })
    if (caseStatus !== 'ALL') params.set('status', caseStatus)
    const q = get('q')
    if (q) params.set('q', q)
    try {
      const res = await fetchApi<CasesData>(`/api/admin/risk/cases?${params}`)
      setCases(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed')
    }
  }, [casePage, caseStatus, get])

  const loadEntries = useCallback(async () => {
    try {
      const res = await fetchApi<{ items: ListEntry[] }>('/api/admin/risk/lists')
      setEntries(res.items)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed')
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    setError(null)
    Promise.all([loadRules(), loadCases(), loadEntries()])
      .finally(() => setLoading(false))
  }, [loadRules, loadCases, loadEntries])

  const reloadAll = async () => {
    setLoading(true)
    setError(null)
    await Promise.all([loadRules(), loadCases(), loadEntries()])
    setLoading(false)
  }

  // ── Rule CRUD ──

  const openCreateRule = () => {
    setEditingRule(null)
    setRuleForm(EMPTY_RULE_FORM)
    setRuleDialog(true)
  }

  const openEditRule = (r: RiskRule) => {
    setEditingRule(r)
    setRuleForm({
      name: r.name,
      type: r.type,
      action: r.action,
      priority: r.priority,
      enabled: r.enabled,
      windowMin: r.config.windowMin ?? 30,
      maxCount: r.config.maxCount ?? 5,
      minAmount: r.config.minAmount ?? 0,
      maxAmount: r.config.maxAmount ?? 25000,
      startHour: r.config.startHour ?? 1,
      endHour: r.config.endHour ?? 5,
    })
    setRuleDialog(true)
  }

  const buildConfig = (f: RuleForm): RuleConfig => {
    if (f.type === 'VELOCITY') return { windowMin: f.windowMin, maxCount: f.maxCount }
    if (f.type === 'AMOUNT_LIMIT') {
      return {
        ...(f.minAmount > 0 ? { minAmount: f.minAmount } : {}),
        maxAmount: f.maxAmount,
      }
    }
    if (f.type === 'HOUR_PATTERN') return { startHour: f.startHour, endHour: f.endHour }
    return {}
  }

  const submitRule = async () => {
    if (!ruleForm.name.trim()) { toast.error(t('rskNeedName')); return }
    setRuleSaving(true)
    try {
      const body = {
        name: ruleForm.name.trim(),
        type: ruleForm.type,
        action: ruleForm.action,
        priority: ruleForm.priority,
        enabled: ruleForm.enabled,
        config: buildConfig(ruleForm),
      }
      if (editingRule) {
        await fetchApi(`/api/admin/risk/rules/${editingRule.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        toast.success(t('ruleUpdatedToast'))
      } else {
        await fetchApi('/api/admin/risk/rules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        toast.success(t('ruleCreatedToast'))
      }
      setRuleDialog(false)
      await loadRules()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setRuleSaving(false)
    }
  }

  const toggleRule = async (r: RiskRule, enabled: boolean) => {
    try {
      await fetchApi(`/api/admin/risk/rules/${r.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      })
      await loadRules()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Request failed')
    }
  }

  const removeRule = async () => {
    if (!deletingRule) return
    setRuleDeleteBusy(true)
    try {
      await fetchApi(`/api/admin/risk/rules/${deletingRule.id}`, { method: 'DELETE' })
      toast.success(t('ruleDeletedToast'))
      setDeletingRule(null)
      await loadRules()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setRuleDeleteBusy(false)
    }
  }

  // ── Case decisions ──

  const decideCase = async (c: RiskCase, action: 'clear' | 'block') => {
    setCaseBusy(c.id)
    try {
      await fetchApi(`/api/admin/risk/cases/${c.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, notes: caseNotes[c.id] || undefined }),
      })
      toast.success(action === 'clear' ? t('rskClearedToast') : t('rskBlockedToast'))
      await loadCases()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setCaseBusy(null)
    }
  }

  // ── List entries ──

  const submitEntry = async () => {
    if (!entryForm.value.trim()) { toast.error(t('rskEntryValue')); return }
    setEntrySaving(true)
    try {
      await fetchApi('/api/admin/risk/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          list: entryForm.list,
          type: entryForm.type,
          value: entryForm.value.trim(),
          reason: entryForm.reason.trim() || undefined,
        }),
      })
      toast.success(t('entryAddedToast'))
      setEntryDialog(false)
      setEntryForm(EMPTY_ENTRY_FORM)
      await loadEntries()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setEntrySaving(false)
    }
  }

  const removeEntry = async () => {
    if (!deletingEntry) return
    setEntryDeleteBusy(true)
    try {
      await fetchApi(`/api/admin/risk/lists/${deletingEntry.id}`, { method: 'DELETE' })
      toast.success(t('entryDeletedToast'))
      setDeletingEntry(null)
      await loadEntries()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setEntryDeleteBusy(false)
    }
  }

  // ── Test evaluator ──

  const runTest = async () => {
    const amount = Number(testForm.amount)
    if (!Number.isFinite(amount) || amount <= 0) { toast.error(t('rskNeedAmount')); return }
    setTestRunning(true)
    try {
      const res = await fetchApi<{ verdict: Verdict }>('/api/admin/risk/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          phone: testForm.phone.trim() || undefined,
          email: testForm.email.trim() || undefined,
          ip: testForm.ip.trim() || undefined,
        }),
      })
      setVerdict(res.verdict)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setTestRunning(false)
    }
  }

  const verdictBadge = (a: string) => (
    <span className={cn(
      'inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-bold',
      ACTION_BADGE[a] ?? ACTION_BADGE.REVIEW,
    )}>
      {actionLabel(a)}
    </span>
  )

  const scoreChip = (score: number) => (
    <span className={cn(
      'inline-flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-sm font-extrabold tabular',
      score >= 100 ? 'bg-destructive/10 text-destructive'
        : score >= 60 ? 'bg-warning/15 text-amber-700 dark:text-amber-400'
        : 'bg-muted text-muted-foreground',
    )}>
      {score}
    </span>
  )

  const entryTable = (list: 'ALLOW' | 'BLOCK') => {
    const rows = (entries ?? []).filter((e) => e.list === list)
    const emptyText = list === 'ALLOW' ? t('rskEmptyAllow') : t('rskEmptyBlock')
    return (
      <Card className="overflow-hidden p-0 shadow-brand">
        <div className={cn(
          'flex items-start justify-between gap-2 border-b p-4',
          list === 'ALLOW' ? 'bg-success/5' : 'bg-destructive/5',
        )}>
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={cn('font-bold', LIST_BADGE[list])}>
                {list === 'ALLOW' ? t('rskAllowList') : t('rskBlockList')}
              </Badge>
              <span className="text-xs text-muted-foreground">{rows.length}</span>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              {list === 'ALLOW' ? t('rskAllowHint') : t('rskBlockHint')}
            </p>
          </div>
        </div>
        {rows.length === 0 ? (
          <EmptyState
            icon={<ListFilter className="h-6 w-6" />}
            title={emptyText}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left">
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('rskColValue')}</th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('rskColEntryType')}</th>
                  <th className="hidden px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:table-cell">{t('rskColReason')}</th>
                  <th className="hidden px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:table-cell">{t('rskColAdded')}</th>
                  {canWrite && <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('rskColActions') ?? ''}</th>}
                </tr>
              </thead>
              <tbody className="stagger">
                {rows.map((e) => (
                  <tr key={e.id} className="border-b transition-colors last:border-0 hover:bg-muted/40">
                    <td className="max-w-[200px] truncate px-4 py-2.5 font-mono text-xs font-semibold text-foreground">{e.value}</td>
                    <td className="px-4 py-2.5"><Badge variant="outline" className="font-medium">{listTypeLabel(e.type)}</Badge></td>
                    <td className="hidden max-w-[180px] truncate px-4 py-2.5 text-xs text-muted-foreground sm:table-cell">{e.reason ?? '—'}</td>
                    <td className="hidden px-4 py-2.5 text-xs text-foreground/70 md:table-cell" title={formatDateTime(e.createdAt)}>{timeAgo(e.createdAt)}</td>
                    {canWrite && (
                      <td className="px-4 py-2.5 text-right">
                        <Button
                          variant="ghost" size="icon"
                          className="press h-7 w-7 text-destructive hover:text-destructive"
                          title={t('delete')} aria-label={t('delete')}
                          onClick={() => setDeletingEntry(e)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    )
  }

  return (
    <div>
      <PageHeader
        title={t('rskTitle')}
        description={t('rskSubtitle')}
        icon={<ShieldAlert className="h-5 w-5" />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {tab === 'rules' && canWrite && (
              <Button onClick={openCreateRule} className="press gap-1.5">
                <Plus className="h-4 w-4" /> {t('rskNewRule')}
              </Button>
            )}
            {tab === 'lists' && canWrite && (
              <Button onClick={() => { setEntryForm(EMPTY_ENTRY_FORM); setEntryDialog(true) }} className="press gap-1.5">
                <Plus className="h-4 w-4" /> {t('rskAddEntry')}
              </Button>
            )}
            <Button variant="outline" size="icon" className="press h-9 w-9" onClick={() => void reloadAll()} aria-label={t('refresh')}>
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            </Button>
          </div>
        }
      />

      {/* Stats */}
      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t('rskStatRules')}
          value={rules ? String(rules.filter((r) => r.enabled).length) : '—'}
          icon={<ShieldAlert className="h-5 w-5" />}
          tone="text-primary bg-primary/10"
          loading={!rules}
        />
        <StatCard
          label={t('rskStatOpen')}
          value={cases ? String(cases.counts.open) : '—'}
          icon={<Gavel className="h-5 w-5" />}
          tone="text-warning bg-warning/10"
          loading={!cases}
        />
        <StatCard
          label={t('rskStatBlockedCases')}
          value={cases ? String(cases.counts.blocked) : '—'}
          icon={<ShieldAlert className="h-5 w-5" />}
          tone="text-destructive bg-destructive/10"
          loading={!cases}
        />
        <StatCard
          label={t('rskStatListEntries')}
          value={entries ? String(entries.length) : '—'}
          icon={<ListFilter className="h-5 w-5" />}
          tone="text-success bg-success/10"
          loading={!entries}
        />
      </div>

      {error && !rules ? (
        <ErrorCard message={error} onRetry={() => void reloadAll()} />
      ) : (
        <Tabs value={tab} onValueChange={(v) => set({ tab: v === 'rules' ? null : v, page: null, q: null, status: null })}>
          <TabsList className="h-auto w-full flex-wrap justify-start gap-1 sm:grid sm:w-full sm:grid-cols-3">
            <TabsTrigger value="rules" className="gap-1.5 px-3">{t('rskTabRules')}</TabsTrigger>
            <TabsTrigger value="queue" className="gap-1.5 px-3">
              {t('rskTabQueue')}
              {cases && cases.counts.open > 0 && (
                <span className="ml-1 rounded-full bg-warning/20 px-1.5 text-[10px] font-bold text-amber-700 dark:text-amber-400">
                  {cases.counts.open}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="lists" className="gap-1.5 px-3">{t('rskTabLists')}</TabsTrigger>
          </TabsList>

          {/* ── Rules ── */}
          <TabsContent value="rules" className="mt-4">
            <div className="grid gap-4 xl:grid-cols-3">
              <div className="xl:col-span-2">
                {!rules ? (
                  <div className="space-y-2">
                    {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
                  </div>
                ) : rules.length === 0 ? (
                  <Card className="border-dashed p-2 shadow-brand">
                    <EmptyState
                      icon={<ShieldAlert className="h-7 w-7" />}
                      title={t('rskEmptyRules')}
                      hint={t('rskEmptyRulesHint')}
                      action={canWrite ? (
                        <Button onClick={openCreateRule} className="press gap-1.5">
                          <Plus className="h-4 w-4" /> {t('rskNewRule')}
                        </Button>
                      ) : undefined}
                    />
                  </Card>
                ) : (
                  <>
                    {/* Desktop table */}
                    <Card className="hidden overflow-hidden p-0 shadow-brand lg:block">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-muted/50 text-left">
                              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('rskColRule')}</th>
                              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('rskColConfig')}</th>
                              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('rskColAction')}</th>
                              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('rskColHits')}</th>
                              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('rskColEnabled')}</th>
                              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('actions')}</th>
                            </tr>
                          </thead>
                          <tbody className="stagger">
                            {rules.map((r, i) => (
                              <tr key={r.id} className="border-b transition-colors last:border-0 hover:bg-muted/40" style={{ animationDelay: `${i * 40}ms` }}>
                                <td className="px-4 py-3">
                                  <p className="font-semibold text-foreground">{r.name}</p>
                                  <div className="mt-0.5 flex items-center gap-1.5">
                                    <Badge variant="outline" className={cn('text-[10px] font-bold', TYPE_BADGE[r.type] ?? TYPE_BADGE.LIST_MATCH)}>
                                      {typeLabel(r.type)}
                                    </Badge>
                                    <span className="text-[10px] text-muted-foreground">#{r.priority}</span>
                                  </div>
                                </td>
                                <td className="max-w-[220px] px-4 py-3 text-xs text-foreground/80">{cfgText(r)}</td>
                                <td className="px-4 py-3">
                                  <Badge variant="outline" className={cn('font-bold', ACTION_BADGE[r.action] ?? ACTION_BADGE.REVIEW)}>
                                    {actionLabel(r.action)}
                                  </Badge>
                                </td>
                                <td className="tabular px-4 py-3">
                                  <span className="font-semibold text-foreground">{r.hits}</span>
                                  {r.lastHitAt && (
                                    <p className="text-[10px] text-muted-foreground" title={formatDateTime(r.lastHitAt)}>{timeAgo(r.lastHitAt)}</p>
                                  )}
                                </td>
                                <td className="px-4 py-3">
                                  <Switch checked={r.enabled} onCheckedChange={(v) => void toggleRule(r, v)} aria-label={r.name} />
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center justify-end gap-1">
                                    <Button variant="ghost" size="icon" className="press h-7 w-7" title={t('edit')} aria-label={t('edit')} onClick={() => openEditRule(r)}>
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                      variant="ghost" size="icon"
                                      className="press h-7 w-7 text-destructive hover:text-destructive"
                                      title={t('delete')} aria-label={t('delete')}
                                      onClick={() => setDeletingRule(r)}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </Card>

                    {/* Mobile cards */}
                    <div className="stagger space-y-3 lg:hidden">
                      {rules.map((r, i) => (
                        <Card key={r.id} className="hover-lift p-4 shadow-brand" style={{ animationDelay: `${i * 40}ms` }}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-semibold text-foreground">{r.name}</p>
                              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                <Badge variant="outline" className={cn('text-[10px] font-bold', TYPE_BADGE[r.type] ?? TYPE_BADGE.LIST_MATCH)}>
                                  {typeLabel(r.type)}
                                </Badge>
                                <Badge variant="outline" className={cn('text-[10px] font-bold', ACTION_BADGE[r.action] ?? ACTION_BADGE.REVIEW)}>
                                  {actionLabel(r.action)}
                                </Badge>
                                <span className="text-[10px] text-muted-foreground">#{r.priority}</span>
                              </div>
                            </div>
                            <Switch checked={r.enabled} onCheckedChange={(v) => void toggleRule(r, v)} aria-label={r.name} />
                          </div>
                          <p className="mt-2 text-xs text-muted-foreground">{cfgText(r)}</p>
                          <div className="mt-3 flex items-center justify-between border-t pt-3">
                            <span className="text-xs text-muted-foreground">
                              {t('rskColHits')}: <span className="font-bold text-foreground">{r.hits}</span>
                            </span>
                            <div className="flex items-center gap-1">
                              <Button variant="outline" size="sm" className="press h-8 gap-1" onClick={() => openEditRule(r)}>
                                <Pencil className="h-3 w-3" /> {t('edit')}
                              </Button>
                              <Button
                                variant="ghost" size="sm"
                                className="press h-8 gap-1 text-destructive hover:text-destructive"
                                onClick={() => setDeletingRule(r)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Test evaluator card */}
              <Card className="hover-lift h-fit p-5 shadow-brand xl:sticky xl:top-20">
                <div className="flex items-center gap-2">
                  <div className="rounded-lg bg-primary/10 p-2 text-primary">
                    <FlaskConical className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground">{t('rskTesterTitle')}</h3>
                    <p className="text-[11px] leading-relaxed text-muted-foreground">{t('rskTesterDesc')}</p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="risk-test-amount" className="text-xs">{t('rskTesterAmount')} *</Label>
                    <Input
                      id="risk-test-amount" inputMode="decimal"
                      value={testForm.amount}
                      onChange={(e) => setTestForm({ ...testForm, amount: e.target.value.replace(/[^\d.]/g, '') })}
                      className="tabular"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-1.5">
                      <Label htmlFor="risk-test-phone" className="text-xs">{t('rskTesterPhone')}</Label>
                      <Input
                        id="risk-test-phone" inputMode="tel"
                        value={testForm.phone}
                        onChange={(e) => setTestForm({ ...testForm, phone: e.target.value })}
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="risk-test-ip" className="text-xs">{t('rskTesterIp')}</Label>
                      <Input
                        id="risk-test-ip"
                        value={testForm.ip}
                        onChange={(e) => setTestForm({ ...testForm, ip: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="risk-test-email" className="text-xs">{t('rskTesterEmail')}</Label>
                    <Input
                      id="risk-test-email" type="email"
                      value={testForm.email}
                      onChange={(e) => setTestForm({ ...testForm, email: e.target.value })}
                    />
                  </div>
                  <Button className="press gap-1.5" onClick={() => void runTest()} disabled={testRunning}>
                    <Play className="h-4 w-4" /> {testRunning ? t('rskTestRunning') : t('rskTestRun')}
                  </Button>
                </div>

                {verdict && (
                  <div className="anim-fade-up mt-4 rounded-xl border p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t('rskTestVerdict')}</span>
                      {verdictBadge(verdict.action)}
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t('rskTestScore')}</span>
                      {scoreChip(verdict.score)}
                    </div>
                    <div className="mt-3 border-t pt-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t('rskTestTriggered')}</p>
                      {verdict.cases.length === 0 ? (
                        <p className="mt-1.5 text-xs text-success">{t('rskTestNoHits')}</p>
                      ) : (
                        <ul className="mt-1.5 space-y-1.5">
                          {verdict.cases.map((c) => (
                            <li key={c.id} className="flex items-start justify-between gap-2 text-xs">
                              <div className="min-w-0">
                                <p className="font-semibold text-foreground">{c.rule}</p>
                                <p className="truncate text-muted-foreground">{c.reason}</p>
                              </div>
                              <span className={cn(
                                'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold',
                                c.score >= 100 ? 'bg-destructive/10 text-destructive' : 'bg-warning/15 text-amber-700 dark:text-amber-400',
                              )}>
                                {c.score}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            </div>
          </TabsContent>

          {/* ── Review queue ── */}
          <TabsContent value="queue" className="mt-4">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
              <SearchInput paramKey="q" placeholder={t('rskQueueSearchPh')} className="sm:max-w-xs" />
              <Select value={caseStatus} onValueChange={(v) => set({ status: v === 'ALL' ? null : v, page: 1 })}>
                <SelectTrigger className="h-9 w-full sm:w-44" aria-label={t('rskFilterStatus')}>
                  <SelectValue placeholder={t('rskFilterStatus')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">{t('rskFilterStatus')}</SelectItem>
                  <SelectItem value="OPEN">{t('rskStatusOpen')}</SelectItem>
                  <SelectItem value="CLEARED">{t('rskStatusCleared')}</SelectItem>
                  <SelectItem value="BLOCKED">{t('rskStatusBlocked')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {!cases ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
              </div>
            ) : cases.items.length === 0 ? (
              <Card className="border-dashed p-2 shadow-brand">
                {get('q') || caseStatus !== 'ALL' ? (
                  <EmptyState
                    icon={<Gavel className="h-7 w-7" />}
                    title={t('noResults')}
                    action={
                      <Button variant="outline" size="sm" className="press" onClick={() => set({ q: null, status: null, page: 1 })}>
                        {t('clearFilters')}
                      </Button>
                    }
                  />
                ) : (
                  <EmptyState
                    icon={<Gavel className="h-7 w-7" />}
                    title={t('rskEmptyQueue')}
                    hint={t('rskEmptyQueueHint')}
                  />
                )}
              </Card>
            ) : (
              <>
                <div className="stagger grid gap-3 lg:grid-cols-2">
                  {cases.items.map((c, i) => (
                    <Card key={c.id} className="hover-lift p-4 shadow-brand" style={{ animationDelay: `${i * 40}ms` }}>
                      <div className="flex items-start gap-3">
                        {scoreChip(c.score)}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge variant="outline" className={cn(
                              'text-[10px] font-bold',
                              c.status === 'OPEN' ? 'bg-warning/15 text-amber-700 dark:text-amber-400 border-warning/30'
                                : c.status === 'CLEARED' ? 'bg-success/10 text-success border-success/20'
                                : 'bg-destructive/10 text-destructive border-destructive/25',
                            )}>
                              {c.status === 'OPEN' ? t('rskStatusOpen') : c.status === 'CLEARED' ? t('rskStatusCleared') : t('rskStatusBlocked')}
                            </Badge>
                            {c.rule && (
                              <Badge variant="outline" className="max-w-[200px] truncate text-[10px] font-medium">
                                {c.rule.name}
                              </Badge>
                            )}
                          </div>
                          <p className="mt-1.5 text-sm font-medium leading-snug text-foreground">{c.reason}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                            <span className="font-mono">{c.subjectType} · {c.subjectRef}</span>
                            <span title={formatDateTime(c.createdAt)}>{timeAgo(c.createdAt)}</span>
                            {c.decidedByName && (
                              <span>{t('rskColDecidedBy')}: <span className="font-semibold text-foreground/80">{c.decidedByName}</span></span>
                            )}
                          </div>
                        </div>
                      </div>

                      {c.status === 'OPEN' ? (
                        <div className="mt-3 flex flex-col gap-2 border-t pt-3 sm:flex-row sm:items-center">
                          <Input
                            value={caseNotes[c.id] ?? ''}
                            onChange={(e) => setCaseNotes({ ...caseNotes, [c.id]: e.target.value })}
                            placeholder={t('rskNotesPh')}
                            className="h-9 flex-1"
                            aria-label={t('rskNotesPh')}
                          />
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline" size="sm"
                              className="press h-9 flex-1 gap-1.5 border-success/30 text-success hover:bg-success/10 hover:text-success sm:flex-none"
                              disabled={caseBusy === c.id}
                              onClick={() => void decideCase(c, 'clear')}
                            >
                              <ListFilter className="h-3.5 w-3.5" /> {t('rskClearBtn')}
                            </Button>
                            <Button
                              variant="destructive" size="sm"
                              className="press h-9 flex-1 gap-1.5 sm:flex-none"
                              disabled={caseBusy === c.id}
                              onClick={() => void decideCase(c, 'block')}
                            >
                              <ShieldAlert className="h-3.5 w-3.5" /> {t('rskBlockBtn')}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3 border-t pt-3">
                          <Link
                            href={`/admin/transactions?q=${encodeURIComponent(c.subjectRef)}`}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                          >
                            <ExternalLink className="h-3 w-3" /> {t('rskViewTrx')}
                          </Link>
                        </div>
                      )}
                    </Card>
                  ))}
                </div>
                <Pagination page={cases.page} pages={cases.pages} total={cases.total} />
              </>
            )}
          </TabsContent>

          {/* ── Lists ── */}
          <TabsContent value="lists" className="mt-4">
            {!entries ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-56 rounded-xl" />)}
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {entryTable('ALLOW')}
                {entryTable('BLOCK')}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}

      {/* Rule create/edit dialog */}
      <Dialog open={ruleDialog} onOpenChange={setRuleDialog}>
        <DialogContent className="nice-scroll max-h-[92vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingRule ? t('rskRuleEditTitle') : t('rskRuleCreateTitle')}</DialogTitle>
            <DialogDescription className="sr-only">{t('rskRuleDesc')}</DialogDescription>
          </DialogHeader>
          <p className="text-xs leading-relaxed text-muted-foreground">{t('rskRuleDesc')}</p>

          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="risk-rule-name">{t('rskRuleName')} *</Label>
              <Input
                id="risk-rule-name"
                value={ruleForm.name}
                onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })}
                placeholder={t('rskRuleNamePh')}
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>{t('rskRuleType')}</Label>
                <Select value={ruleForm.type} onValueChange={(v) => setRuleForm({ ...ruleForm, type: v })} disabled={!!editingRule}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="VELOCITY">{t('rskTypeVelocity')}</SelectItem>
                    <SelectItem value="AMOUNT_LIMIT">{t('rskTypeAmount')}</SelectItem>
                    <SelectItem value="LIST_MATCH">{t('rskTypeList')}</SelectItem>
                    <SelectItem value="HOUR_PATTERN">{t('rskTypeHour')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>{t('rskRuleAction')}</Label>
                <Select value={ruleForm.action} onValueChange={(v) => setRuleForm({ ...ruleForm, action: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALLOW">{t('rskActionAllow')}</SelectItem>
                    <SelectItem value="REVIEW">{t('rskActionReview')}</SelectItem>
                    <SelectItem value="BLOCK">{t('rskActionBlock')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="risk-rule-priority">{t('rskPriority')}</Label>
              <Input
                id="risk-rule-priority" inputMode="numeric"
                value={String(ruleForm.priority)}
                onChange={(e) => setRuleForm({ ...ruleForm, priority: Number(e.target.value.replace(/[^\d]/g, '')) || 0 })}
                className="tabular"
              />
              <p className="text-[11px] text-muted-foreground">{t('rskPriorityHint')}</p>
            </div>

            {ruleForm.type === 'VELOCITY' && (
              <div className="grid grid-cols-2 gap-3 rounded-xl border p-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="risk-cfg-window" className="text-xs">{t('rskCfgWindow')}</Label>
                  <Input
                    id="risk-cfg-window" inputMode="numeric"
                    value={String(ruleForm.windowMin)}
                    onChange={(e) => setRuleForm({ ...ruleForm, windowMin: Number(e.target.value.replace(/[^\d]/g, '')) || 0 })}
                    className="tabular"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="risk-cfg-count" className="text-xs">{t('rskCfgMaxCount')}</Label>
                  <Input
                    id="risk-cfg-count" inputMode="numeric"
                    value={String(ruleForm.maxCount)}
                    onChange={(e) => setRuleForm({ ...ruleForm, maxCount: Number(e.target.value.replace(/[^\d]/g, '')) || 0 })}
                    className="tabular"
                  />
                </div>
              </div>
            )}

            {ruleForm.type === 'AMOUNT_LIMIT' && (
              <div className="grid grid-cols-2 gap-3 rounded-xl border p-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="risk-cfg-min" className="text-xs">{t('rskCfgMinAmount')}</Label>
                  <Input
                    id="risk-cfg-min" inputMode="decimal"
                    value={String(ruleForm.minAmount)}
                    onChange={(e) => setRuleForm({ ...ruleForm, minAmount: Number(e.target.value.replace(/[^\d.]/g, '')) || 0 })}
                    className="tabular"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="risk-cfg-max" className="text-xs">{t('rskCfgMaxAmount')}</Label>
                  <Input
                    id="risk-cfg-max" inputMode="decimal"
                    value={String(ruleForm.maxAmount)}
                    onChange={(e) => setRuleForm({ ...ruleForm, maxAmount: Number(e.target.value.replace(/[^\d.]/g, '')) || 0 })}
                    className="tabular"
                  />
                </div>
              </div>
            )}

            {ruleForm.type === 'HOUR_PATTERN' && (
              <div className="grid grid-cols-2 gap-3 rounded-xl border p-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="risk-cfg-start" className="text-xs">{t('rskCfgStartHour')}</Label>
                  <Input
                    id="risk-cfg-start" inputMode="numeric"
                    value={String(ruleForm.startHour)}
                    onChange={(e) => setRuleForm({ ...ruleForm, startHour: Math.min(23, Number(e.target.value.replace(/[^\d]/g, '')) || 0) })}
                    className="tabular"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="risk-cfg-end" className="text-xs">{t('rskCfgEndHour')}</Label>
                  <Input
                    id="risk-cfg-end" inputMode="numeric"
                    value={String(ruleForm.endHour)}
                    onChange={(e) => setRuleForm({ ...ruleForm, endHour: Math.min(23, Number(e.target.value.replace(/[^\d]/g, '')) || 0) })}
                    className="tabular"
                  />
                </div>
              </div>
            )}

            {ruleForm.type === 'LIST_MATCH' && (
              <p className="rounded-xl border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">{t('rskCfgListHint')}</p>
            )}

            <div className="flex items-center justify-between rounded-xl border p-3">
              <p className="text-sm font-semibold text-foreground">{t('rskColEnabled')}</p>
              <Switch
                checked={ruleForm.enabled}
                onCheckedChange={(v) => setRuleForm({ ...ruleForm, enabled: v })}
                aria-label={t('rskColEnabled')}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRuleDialog(false)}>{t('cancel')}</Button>
            <Button className="press" onClick={() => void submitRule()} disabled={ruleSaving}>
              {editingRule ? t('saveChanges') : t('create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete rule confirm */}
      <AlertDialog open={!!deletingRule} onOpenChange={(o) => !o && setDeletingRule(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('rskDeleteRuleTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingRule?.name} — {t('rskDeleteRuleBody')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={ruleDeleteBusy}
              onClick={(e) => { e.preventDefault(); void removeRule() }}
            >
              {t('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add list entry dialog */}
      <Dialog open={entryDialog} onOpenChange={setEntryDialog}>
        <DialogContent className="nice-scroll max-h-[92vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('rskAddEntry')}</DialogTitle>
            <DialogDescription className="sr-only">{t('rskAddEntry')}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>{t('rskEntryList')}</Label>
                <Select value={entryForm.list} onValueChange={(v) => setEntryForm({ ...entryForm, list: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BLOCK">{t('rskBlockList')}</SelectItem>
                    <SelectItem value="ALLOW">{t('rskAllowList')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>{t('rskEntryType')}</Label>
                <Select value={entryForm.type} onValueChange={(v) => setEntryForm({ ...entryForm, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PHONE">{t('rskTypePhone')}</SelectItem>
                    <SelectItem value="EMAIL">{t('rskTypeEmail')}</SelectItem>
                    <SelectItem value="IP">{t('rskTypeIp')}</SelectItem>
                    <SelectItem value="TRX">{t('rskTypeTrx')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="risk-entry-value">{t('rskEntryValue')} *</Label>
              <Input
                id="risk-entry-value"
                value={entryForm.value}
                onChange={(e) => setEntryForm({ ...entryForm, value: e.target.value })}
                placeholder={t('rskEntryValuePh')}
                autoFocus
                className="font-mono"
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="risk-entry-reason">{t('rskEntryReason')}</Label>
              <Textarea
                id="risk-entry-reason"
                value={entryForm.reason}
                onChange={(e) => setEntryForm({ ...entryForm, reason: e.target.value })}
                placeholder={t('rskEntryReasonPh')}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEntryDialog(false)}>{t('cancel')}</Button>
            <Button className="press" onClick={() => void submitEntry()} disabled={entrySaving}>
              {t('create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete entry confirm */}
      <AlertDialog open={!!deletingEntry} onOpenChange={(o) => !o && setDeletingEntry(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('rskDeleteEntryTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-mono">{deletingEntry?.value}</span> — {t('rskDeleteEntryBody')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={entryDeleteBusy}
              onClick={(e) => { e.preventDefault(); void removeEntry() }}
            >
              {t('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
