'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader, EmptyState, ErrorCard } from './ui-bits'
import { useLang } from '@/lib/i18n'
import { INC_EN, INC_BN } from '@/lib/i18n/incidents'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { formatDateTime } from '@/lib/format'
import {
  Siren, Plus, Pencil, Trash2, Send, CheckCircle2, ChevronRight, ListChecks, Clock3, History,
} from 'lucide-react'

// ── i18n helper ──────────────────────────────────────────────────────────────

function useIncT() {
  const { t, lang } = useLang()
  return useCallback((k: string) => {
    const v = t(k)
    if (v && v !== k) return v
    return (lang === 'bn' ? INC_BN[k] : INC_EN[k]) ?? INC_EN[k] ?? k
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

// ── types + meta ─────────────────────────────────────────────────────────────

type IncidentUpdate = { at: string; body: string; status: string }

type Incident = {
  id: string
  title: string
  body: string
  impact: string
  status: string
  components: string[]
  updates: IncidentUpdate[]
  startedAt: string
  resolvedAt: string | null
}

type StatusComponent = {
  id: string
  name: string
  status: string
  sortOrder: number
}

const IMPACTS = ['CRITICAL', 'MAJOR', 'MINOR', 'MAINTENANCE'] as const
const INCIDENT_STATUSES = ['INVESTIGATING', 'IDENTIFIED', 'MONITORING', 'RESOLVED'] as const
const COMPONENT_STATUSES = ['OPERATIONAL', 'DEGRADED', 'PARTIAL', 'OUTAGE', 'MAINTENANCE'] as const

function impactBadge(impact: string, label: string) {
  const tone =
    impact === 'CRITICAL' ? 'border-destructive/30 bg-destructive/10 text-destructive'
    : impact === 'MAJOR' ? 'border-warning/40 bg-warning/10 text-amber-700 dark:text-amber-400'
    : impact === 'MINOR' ? 'border-primary/25 bg-primary/10 text-primary'
    : 'border-border bg-muted text-muted-foreground'
  return <Badge variant="outline" className={cn('text-[10px] font-bold uppercase', tone)}>{label}</Badge>
}

function incidentStatusBadge(status: string, label: string) {
  const tone =
    status === 'INVESTIGATING' ? 'border-destructive/30 bg-destructive/10 text-destructive'
    : status === 'IDENTIFIED' ? 'border-warning/40 bg-warning/10 text-amber-700 dark:text-amber-400'
    : status === 'MONITORING' ? 'border-primary/25 bg-primary/10 text-primary'
    : 'border-success/30 bg-success/10 text-success'
  return <Badge variant="outline" className={cn('text-[10px] font-bold uppercase', tone)}>{label}</Badge>
}

function compStatusDot(status: string) {
  return status === 'OPERATIONAL' ? 'bg-success'
    : status === 'DEGRADED' ? 'bg-warning'
    : status === 'PARTIAL' ? 'bg-amber-600 dark:text-amber-400'
    : status === 'OUTAGE' ? 'bg-destructive'
    : 'bg-muted-foreground'
}

function compStatusLabel(status: string, t: (k: string) => string) {
  return status === 'OPERATIONAL' ? t('compOperational')
    : status === 'DEGRADED' ? t('compDegraded')
    : status === 'PARTIAL' ? t('compPartial')
    : status === 'OUTAGE' ? t('compOutage')
    : t('compMaintenance')
}

function duration(startedAt: string, resolvedAt: string | null): string {
  const end = resolvedAt ? new Date(resolvedAt).getTime() : Date.now()
  const mins = Math.max(0, Math.round((end - new Date(startedAt).getTime()) / 60_000))
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h < 24) return `${h}h ${m}m`
  return `${Math.floor(h / 24)}d ${h % 24}h`
}

// ── main view ────────────────────────────────────────────────────────────────

export function IncidentsView() {
  const t = useIncT()
  const [tab, setTab] = useState('incidents')

  const [incidents, setIncidents] = useState<Incident[] | null>(null)
  const [incLoading, setIncLoading] = useState(true)
  const [incError, setIncError] = useState<string | null>(null)
  const [components, setComponents] = useState<StatusComponent[] | null>(null)
  const [compError, setCompError] = useState<string | null>(null)

  // incident dialog state
  const [incDialog, setIncDialog] = useState(false)
  const [editing, setEditing] = useState<Incident | null>(null)
  const [incSaving, setIncSaving] = useState(false)
  const [incForm, setIncForm] = useState({ title: '', body: '', impact: 'MINOR', components: [] as string[] })

  // resolve dialog
  const [resolving, setResolving] = useState<Incident | null>(null)
  const [resolveNote, setResolveNote] = useState('')
  const [resolveSaving, setResolveSaving] = useState(false)

  // post update
  const [updateDraft, setUpdateDraft] = useState<Record<string, { body: string; status: string }>>({})
  const [postingId, setPostingId] = useState<string | null>(null)

  // component dialog
  const [compDialog, setCompDialog] = useState(false)
  const [editingComp, setEditingComp] = useState<StatusComponent | null>(null)
  const [compSaving, setCompSaving] = useState(false)
  const [compForm, setCompForm] = useState({ name: '', status: 'OPERATIONAL', sortOrder: 0 })
  const [deletingComp, setDeletingComp] = useState<StatusComponent | null>(null)

  const loadIncidents = useCallback(async () => {
    try {
      setIncError(null)
      const d = await getJSON<{ items: Incident[] }>('/api/admin/incidents')
      setIncidents(d.items)
    } catch (e) {
      setIncError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setIncLoading(false)
    }
  }, [])

  const loadComponents = useCallback(async () => {
    try {
      setCompError(null)
      const d = await getJSON<{ items: StatusComponent[] }>('/api/admin/status-components')
      setComponents(d.items)
    } catch (e) {
      setCompError(e instanceof Error ? e.message : 'Failed to load')
    }
  }, [])

  useEffect(() => {
    loadIncidents()
    loadComponents()
  }, [loadIncidents, loadComponents])

  const open = (incidents ?? []).filter((i) => i.status !== 'RESOLVED')
  const resolvedCount = (incidents ?? []).length - open.length

  function openCreate() {
    setEditing(null)
    setIncForm({ title: '', body: '', impact: 'MINOR', components: [] })
    setIncDialog(true)
  }

  function openEdit(inc: Incident) {
    setEditing(inc)
    setIncForm({ title: inc.title, body: inc.body, impact: inc.impact, components: inc.components })
    setIncDialog(true)
  }

  async function saveIncident() {
    if (!incForm.title.trim() || !incForm.body.trim()) {
      toast.error(t('incTitleRequired'))
      return
    }
    setIncSaving(true)
    try {
      if (editing) {
        await sendJSON(`/api/admin/incidents/${editing.id}`, { action: 'edit', ...incForm }, 'PATCH')
        toast.success(t('incUpdated'))
      } else {
        await sendJSON('/api/admin/incidents', incForm)
        toast.success(t('incCreated'))
      }
      setIncDialog(false)
      loadIncidents()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('incSaveFail'))
    } finally {
      setIncSaving(false)
    }
  }

  async function resolveIncident() {
    if (!resolving) return
    setResolveSaving(true)
    try {
      await sendJSON(`/api/admin/incidents/${resolving.id}`, { action: 'status', status: 'RESOLVED', note: resolveNote }, 'PATCH')
      toast.success(t('incResolved'))
      setResolving(null)
      setResolveNote('')
      loadIncidents()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('incResolveFail'))
    } finally {
      setResolveSaving(false)
    }
  }

  async function postUpdate(inc: Incident) {
    const draft = updateDraft[inc.id]
    if (!draft?.body.trim()) return
    setPostingId(inc.id)
    try {
      await sendJSON(`/api/admin/incidents/${inc.id}`, { action: 'status', status: draft.status || inc.status, note: draft.body }, 'PATCH')
      toast.success(t('incPosted'))
      setUpdateDraft((d) => ({ ...d, [inc.id]: { body: '', status: inc.status } }))
      loadIncidents()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('incPostFail'))
    } finally {
      setPostingId(null)
    }
  }

  async function deleteIncident(id: string) {
    try {
      await sendJSON(`/api/admin/incidents/${id}`, undefined, 'DELETE')
      toast.success(t('incDeleted'))
      loadIncidents()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('incSaveFail'))
    }
  }

  function openCompCreate() {
    setEditingComp(null)
    setCompForm({ name: '', status: 'OPERATIONAL', sortOrder: (components?.length ?? 0) + 1 })
    setCompDialog(true)
  }

  function openCompEdit(c: StatusComponent) {
    setEditingComp(c)
    setCompForm({ name: c.name, status: c.status, sortOrder: c.sortOrder })
    setCompDialog(true)
  }

  async function saveComponent() {
    if (!compForm.name.trim()) {
      toast.error(t('compNameRequired'))
      return
    }
    setCompSaving(true)
    try {
      if (editingComp) {
        await sendJSON(`/api/admin/status-components/${editingComp.id}`, compForm, 'PATCH')
        toast.success(t('compUpdated'))
      } else {
        await sendJSON('/api/admin/status-components', compForm)
        toast.success(t('compCreated'))
      }
      setCompDialog(false)
      loadComponents()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('compSaveFail'))
    } finally {
      setCompSaving(false)
    }
  }

  async function setCompStatus(c: StatusComponent, status: string) {
    try {
      await sendJSON(`/api/admin/status-components/${c.id}`, { status }, 'PATCH')
      setComponents((list) => (list ?? []).map((x) => x.id === c.id ? { ...x, status } : x))
      toast.success(t('compUpdated'))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('compSaveFail'))
    }
  }

  async function setCompOrder(c: StatusComponent, sortOrder: number) {
    try {
      await sendJSON(`/api/admin/status-components/${c.id}`, { sortOrder }, 'PATCH')
      setComponents((list) => (list ?? []).map((x) => x.id === c.id ? { ...x, sortOrder } : x))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('compSaveFail'))
    }
  }

  async function deleteComponent(id: string) {
    try {
      await sendJSON(`/api/admin/status-components/${id}`, undefined, 'DELETE')
      toast.success(t('compDeleted'))
      loadComponents()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('compSaveFail'))
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title={t('incTitle')}
        description={t('incSub')}
        icon={<Siren className="h-5 w-5" />}
        actions={
          <Button size="sm" className="press h-9 gap-1.5" onClick={openCreate}>
            <Plus className="h-4 w-4" /> {t('incCreate')}
          </Button>
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-10 w-full justify-start overflow-x-auto sm:w-auto">
          <TabsTrigger value="incidents" className="gap-1.5 px-3">
            <Siren className="h-3.5 w-3.5" /> {t('incTabIncidents')}
            {open.length > 0 && <Badge variant="outline" className="ml-1 border-destructive/30 bg-destructive/10 px-1.5 text-[10px] font-bold text-destructive">{open.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="components" className="gap-1.5 px-3">
            <ListChecks className="h-3.5 w-3.5" /> {t('incTabComponents')}
          </TabsTrigger>
        </TabsList>

        {/* ── Incidents tab ── */}
        <TabsContent value="incidents" className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:max-w-sm">
            <Card className="ilp-fade-up">
              <CardContent className="p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t('incOpenCount')}</p>
                <p className={cn('mt-1 text-2xl font-bold tabular', open.length > 0 ? 'text-destructive' : 'text-foreground')}>{open.length}</p>
              </CardContent>
            </Card>
            <Card className="ilp-fade-up" style={{ animationDelay: '60ms' }}>
              <CardContent className="p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t('incResolvedToday')}</p>
                <p className="mt-1 text-2xl font-bold tabular text-success">{resolvedCount}</p>
              </CardContent>
            </Card>
          </div>

          {incLoading ? (
            <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-36 rounded-xl" />)}</div>
          ) : incError ? (
            <ErrorCard message={incError} onRetry={loadIncidents} />
          ) : (incidents ?? []).length === 0 ? (
            <Card>
              <CardContent>
                <EmptyState
                  icon={<Siren className="h-6 w-6" />}
                  title={t('incNoIncidents')}
                  hint={t('incNoIncidentsHint')}
                  action={<Button size="sm" className="press gap-1.5" onClick={openCreate}><Plus className="h-3.5 w-3.5" /> {t('incCreate')}</Button>}
                />
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {(incidents ?? []).map((inc, idx) => {
                const draft = updateDraft[inc.id] ?? { body: '', status: inc.status }
                const isResolved = inc.status === 'RESOLVED'
                return (
                  <Card key={inc.id} className={cn('ilp-fade-up', !isResolved && inc.impact === 'CRITICAL' && 'border-destructive/30')} style={{ animationDelay: `${idx * 50}ms` }}>
                    <CardHeader className="pb-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                            {inc.title}
                            {impactBadge(inc.impact, inc.impact === 'CRITICAL' ? t('incImpactCritical') : inc.impact === 'MAJOR' ? t('incImpactMajor') : inc.impact === 'MINOR' ? t('incImpactMinor') : t('incImpactMaintenance'))}
                            {incidentStatusBadge(inc.status, inc.status === 'INVESTIGATING' ? t('incStatusInvestigating') : inc.status === 'IDENTIFIED' ? t('incStatusIdentified') : inc.status === 'MONITORING' ? t('incStatusMonitoring') : t('incStatusResolved'))}
                          </CardTitle>
                          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                            <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" /> {t('incStartedAt')} {formatDateTime(inc.startedAt)}</span>
                            <span>· {t('incDuration')} {duration(inc.startedAt, inc.resolvedAt)}</span>
                            {inc.resolvedAt && <span>· {t('incResolvedAt')} {formatDateTime(inc.resolvedAt)}</span>}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {!isResolved && (
                            <Button size="sm" variant="outline" className="press h-8 gap-1.5 border-success/30 text-success hover:bg-success/10" onClick={() => { setResolving(inc); setResolveNote('') }}>
                              <CheckCircle2 className="h-3.5 w-3.5" /> {t('incResolve')}
                            </Button>
                          )}
                          <Button size="icon" variant="ghost" className="press h-8 w-8 text-muted-foreground" onClick={() => openEdit(inc)} aria-label={t('incEdit')}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="icon" variant="ghost" className="press h-8 w-8 text-muted-foreground hover:text-destructive" aria-label={t('incDelete')}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>{t('incDeleteMsg')}</AlertDialogTitle>
                                <AlertDialogDescription>{inc.title}</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel className="press">{t('impClose')}</AlertDialogCancel>
                                <AlertDialogAction className="press bg-destructive text-white hover:bg-destructive/90" onClick={() => deleteIncident(inc.id)}>{t('incDelete')}</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{inc.body}</p>

                      {inc.components.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {inc.components.map((c) => (
                            <Badge key={c} variant="outline" className="text-[10px] text-muted-foreground">{c}</Badge>
                          ))}
                        </div>
                      )}

                      {/* Timeline */}
                      {inc.updates.length > 0 && (
                        <div className="rounded-lg border bg-background/50 p-3">
                          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t('incTimeline')}</p>
                          <ol className="space-y-2.5">
                            {inc.updates.slice().reverse().map((u, i) => (
                              <li key={`${u.at}-${i}`} className="flex gap-2.5">
                                <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', u.status === 'RESOLVED' ? 'bg-success' : u.status === 'IDENTIFIED' ? 'bg-warning' : u.status === 'MONITORING' ? 'bg-primary' : 'bg-destructive')} aria-hidden="true" />
                                <div className="min-w-0">
                                  <p className="text-xs leading-relaxed text-foreground/90">{u.body}</p>
                                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                                    {formatDateTime(u.at)} · {u.status === 'INVESTIGATING' ? t('incStatusInvestigating') : u.status === 'IDENTIFIED' ? t('incStatusIdentified') : u.status === 'MONITORING' ? t('incStatusMonitoring') : t('incStatusResolved')}
                                  </p>
                                </div>
                              </li>
                            ))}
                          </ol>
                        </div>
                      )}

                      {/* Post update */}
                      {!isResolved && (
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <Input
                            value={draft.body}
                            onChange={(e) => setUpdateDraft((d) => ({ ...d, [inc.id]: { ...draft, body: e.target.value } }))}
                            placeholder={t('incUpdatePh')}
                            className="h-10 flex-1"
                            aria-label={t('incPostUpdate')}
                          />
                          <Select value={draft.status} onValueChange={(v) => setUpdateDraft((d) => ({ ...d, [inc.id]: { ...draft, status: v } }))}>
                            <SelectTrigger className="h-10 w-full sm:w-44" aria-label={t('incUpdateNewStatus')}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {INCIDENT_STATUSES.filter((s) => s !== 'RESOLVED').map((s) => (
                                <SelectItem key={s} value={s}>
                                  {s === 'INVESTIGATING' ? t('incStatusInvestigating') : s === 'IDENTIFIED' ? t('incStatusIdentified') : t('incStatusMonitoring')}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button className="press h-10 gap-1.5" disabled={postingId === inc.id || !draft.body.trim()} onClick={() => postUpdate(inc)}>
                            <Send className="h-3.5 w-3.5" /> {postingId === inc.id ? t('incPosting') : t('incPost')}
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>

        {/* ── Status components tab ── */}
        <TabsContent value="components" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-sm font-semibold">
                <span className="flex items-center gap-2"><ListChecks className="h-4 w-4 text-primary" />{t('compTitle')}</span>
                <Button size="sm" className="press h-8 gap-1.5" onClick={openCompCreate}>
                  <Plus className="h-3.5 w-3.5" /> {t('compAdd')}
                </Button>
              </CardTitle>
              <p className="text-xs text-muted-foreground">{t('compSub')}</p>
            </CardHeader>
            <CardContent>
              {components === null ? (
                <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>
              ) : compError ? (
                <ErrorCard message={compError} onRetry={loadComponents} />
              ) : components.length === 0 ? (
                <EmptyState icon={<ListChecks className="h-6 w-6" />} title={t('compNoComponents')} hint={t('compNoComponentsHint')} />
              ) : (
                <div className="space-y-2">
                  {components.slice().sort((a, b) => a.sortOrder - b.sortOrder).map((c, i) => (
                    <div key={c.id} className="ilp-fade-up flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-background/50 px-3 py-2.5" style={{ animationDelay: `${i * 40}ms` }}>
                      <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', compStatusDot(c.status))} aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground">{c.name}</p>
                        <p className="text-[11px] text-muted-foreground">{compStatusLabel(c.status, t)}</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Label className="sr-only" htmlFor={`order-${c.id}`}>{t('compSortOrder')}</Label>
                        <Input
                          id={`order-${c.id}`}
                          type="number"
                          defaultValue={c.sortOrder}
                          onBlur={(e) => {
                            const v = parseInt(e.target.value, 10)
                            if (Number.isFinite(v) && v !== c.sortOrder) setCompOrder(c, v)
                          }}
                          className="h-8 w-16 text-center text-xs"
                          aria-label={`${c.name} ${t('compSortOrder')}`}
                        />
                        <Select value={c.status} onValueChange={(v) => setCompStatus(c, v)}>
                          <SelectTrigger className="h-8 w-36 text-xs" aria-label={`${c.name} ${t('compStatus')}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {COMPONENT_STATUSES.map((s) => (
                              <SelectItem key={s} value={s}>{compStatusLabel(s, t)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button size="icon" variant="ghost" className="press h-8 w-8 text-muted-foreground" onClick={() => openCompEdit(c)} aria-label={`${t('incEdit')} ${c.name}`}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="icon" variant="ghost" className="press h-8 w-8 text-muted-foreground hover:text-destructive" aria-label={`${t('incDelete')} ${c.name}`}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>{t('compDeleteMsg')}</AlertDialogTitle>
                              <AlertDialogDescription>{c.name}</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel className="press">{t('impClose')}</AlertDialogCancel>
                              <AlertDialogAction className="press bg-destructive text-white hover:bg-destructive/90" onClick={() => deleteComponent(c.id)}>{t('incDelete')}</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create / edit incident dialog */}
      <Dialog open={incDialog} onOpenChange={setIncDialog}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? t('incEditTitle') : t('incCreateTitle')}</DialogTitle>
            <DialogDescription>{t('incImpactHint')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3.5">
            <div className="space-y-1.5">
              <Label htmlFor="inc-title">{t('incFieldTitle')}</Label>
              <Input id="inc-title" value={incForm.title} onChange={(e) => setIncForm((f) => ({ ...f, title: e.target.value }))} placeholder={t('incNamePh')} autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inc-body">{t('incFieldBody')}</Label>
              <Textarea id="inc-body" value={incForm.body} onChange={(e) => setIncForm((f) => ({ ...f, body: e.target.value }))} placeholder={t('incBodyPh')} rows={4} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('incImpact')}</Label>
              <div className="grid grid-cols-2 gap-2">
                {IMPACTS.map((imp) => (
                  <button
                    key={imp}
                    type="button"
                    className={cn(
                      'press flex items-center justify-between rounded-lg border px-3 py-2 text-xs font-semibold transition-colors',
                      incForm.impact === imp ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted/50'
                    )}
                    onClick={() => setIncForm((f) => ({ ...f, impact: imp }))}
                    aria-pressed={incForm.impact === imp}
                  >
                    {imp === 'CRITICAL' ? t('incImpactCritical') : imp === 'MAJOR' ? t('incImpactMajor') : imp === 'MINOR' ? t('incImpactMinor') : t('incImpactMaintenance')}
                    <ChevronRight className="h-3 w-3" />
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t('incComponentsPh')}</Label>
              {components && components.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {components.map((c) => {
                    const active = incForm.components.includes(c.name)
                    return (
                      <button
                        key={c.id}
                        type="button"
                        className={cn(
                          'press rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                          active ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted/50'
                        )}
                        aria-pressed={active}
                        onClick={() => setIncForm((f) => ({
                          ...f,
                          components: active ? f.components.filter((x) => x !== c.name) : [...f.components, c.name],
                        }))}
                      >
                        {c.name}
                      </button>
                    )
                  })}
                </div>
              ) : (
                <p className="rounded-lg border border-dashed px-3 py-2.5 text-xs text-muted-foreground">{t('incNoComponentsYet')}</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="press" onClick={() => setIncDialog(false)}>{t('impClose')}</Button>
            <Button className="press gap-1.5" onClick={saveIncident} disabled={incSaving}>
              <History className="h-3.5 w-3.5" /> {incSaving ? t('incSaving') : t('incSave')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Resolve dialog */}
      <Dialog open={!!resolving} onOpenChange={(v) => { if (!v) setResolving(null) }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-success" />{t('incResolveTitle')}</DialogTitle>
            <DialogDescription>{resolving?.title}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="resolve-note">{t('incResolveNote')}</Label>
            <Textarea id="resolve-note" value={resolveNote} onChange={(e) => setResolveNote(e.target.value)} placeholder={t('incResolvePh')} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" className="press" onClick={() => setResolving(null)}>{t('impClose')}</Button>
            <Button className="press gap-1.5 bg-success text-white hover:bg-success/90" onClick={resolveIncident} disabled={resolveSaving}>
              <CheckCircle2 className="h-3.5 w-3.5" /> {resolveSaving ? t('incSaving') : t('incResolveBtn')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add / edit component dialog */}
      <Dialog open={compDialog} onOpenChange={setCompDialog}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingComp ? t('compEditTitle') : t('compAddTitle')}</DialogTitle>
            <DialogDescription>{t('compSub')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3.5">
            <div className="space-y-1.5">
              <Label htmlFor="comp-name">{t('compTitle')}</Label>
              <Input id="comp-name" value={compForm.name} onChange={(e) => setCompForm((f) => ({ ...f, name: e.target.value }))} placeholder={t('compNamePh')} autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t('compStatus')}</Label>
                <Select value={compForm.status} onValueChange={(v) => setCompForm((f) => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COMPONENT_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>{compStatusLabel(s, t)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="comp-order">{t('compSortOrder')}</Label>
                <Input
                  id="comp-order"
                  type="number"
                  value={compForm.sortOrder}
                  onChange={(e) => setCompForm((f) => ({ ...f, sortOrder: parseInt(e.target.value, 10) || 0 }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="press" onClick={() => setCompDialog(false)}>{t('impClose')}</Button>
            <Button className="press gap-1.5" onClick={saveComponent} disabled={compSaving}>
              <Plus className="h-3.5 w-3.5" /> {compSaving ? t('incSaving') : t('incSave')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
