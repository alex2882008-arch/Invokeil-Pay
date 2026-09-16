'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Webhook, Plus, Send, RefreshCcw, Inbox, Zap, Trash2, Pencil, ExternalLink, RotateCw,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
import {
  PageHeader, EmptyState, ErrorCard, Pagination, StatusBadge,
} from './ui-bits'

// ── Types ────────────────────────────────────────────────────────────────────

interface StoreOption { id: string; name: string }

interface EndpointRow {
  id: string
  storeId: string
  url: string
  events: string
  secret: string
  active: boolean
  createdAt: string
  store?: { id: string; name: string; active: boolean }
  _count?: { deliveries: number }
}

interface EndpointsData {
  endpoints: EndpointRow[]
  stores: StoreOption[]
}

interface DeliveryRow {
  id: string
  storeId: string
  endpointId: string | null
  event: string
  payload: string
  signature: string | null
  status: string
  httpCode: number | null
  error: string | null
  attempts: number
  nextRetryAt: string | null
  responseAt: string | null
  createdAt: string
  endpoint?: { url: string; active: boolean } | null
  store?: { id: string; name: string } | null
}

interface DeliveriesData {
  deliveries: DeliveryRow[]
  total: number
  page: number
  pages: number
}

interface EndpointForm {
  storeId: string
  url: string
  secret: string
  events: string[] // ['*'] = all
  active: boolean
}

/** Mirrors WEBHOOK_EVENTS in src/lib/webhook.ts (kept client-side to avoid pulling server code). */
const EVENTS = [
  'checkout.paid',
  'checkout.created',
  'checkout.cancelled',
  'invoice.paid',
  'payment_link.paid',
  'transaction.matched',
  'transaction.reversed',
  'device.online',
  'test',
] as const

function isEndpointsData(d: unknown): d is EndpointsData {
  if (!d || typeof d !== 'object') return false
  const o = d as Partial<EndpointsData>
  return Array.isArray(o.endpoints) && Array.isArray(o.stores)
}

function isDeliveriesData(d: unknown): d is DeliveriesData {
  if (!d || typeof d !== 'object') return false
  const o = d as Partial<DeliveriesData>
  return Array.isArray(o.deliveries) && typeof o.total === 'number' && typeof o.page === 'number' && typeof o.pages === 'number'
}

function hostOf(url: string): string {
  try { return new URL(url).host } catch { return url.slice(0, 40) }
}

function eventKey(e: string): string {
  return `whEv_${e.replace(/\./g, '_')}`
}

// ── View ─────────────────────────────────────────────────────────────────────

export function WebhooksView() {
  const { t } = useLang()
  const { get, getNum, set } = useUrlState()

  const tab = get('tab', 'endpoints')
  const storeId = get('store')
  const dPage = getNum('page', 1)

  // endpoints tab
  const [epData, setEpData] = useState<EndpointsData | null>(null)
  const [epLoading, setEpLoading] = useState(true)
  const [epError, setEpError] = useState<string | null>(null)

  // deliveries tab
  const [dData, setDData] = useState<DeliveriesData | null>(null)
  const [dLoading, setDLoading] = useState(true)
  const [dError, setDError] = useState<string | null>(null)

  // endpoint dialog
  const [epDialogOpen, setEpDialogOpen] = useState(false)
  const [editingEp, setEditingEp] = useState<EndpointRow | null>(null)
  const [epForm, setEpForm] = useState<EndpointForm>({ storeId: '', url: '', secret: '', events: ['*'], active: true })
  const [epSaving, setEpSaving] = useState(false)

  // delete endpoint
  const [deletingEp, setDeletingEp] = useState<EndpointRow | null>(null)
  const [busy, setBusy] = useState(false)

  // delivery detail dialog
  const [detail, setDetail] = useState<DeliveryRow | null>(null)
  const [resending, setResending] = useState(false)

  const stores = epData?.stores ?? []

  const loadEndpoints = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (storeId) params.set('storeId', storeId)
      const d = await fetchApi<unknown>(`/api/admin/webhooks?${params.toString()}`)
      if (!isEndpointsData(d)) throw new Error('Unexpected response from server')
      setEpError(null)
      setEpData(d)
    } catch (e) {
      setEpError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setEpLoading(false)
    }
  }, [storeId])

  const loadDeliveries = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(dPage) })
      if (storeId) params.set('storeId', storeId)
      const event = get('event')
      if (event && event !== 'ALL') params.set('event', event)
      const status = get('status')
      if (status && status !== 'ALL') params.set('status', status)
      const d = await fetchApi<unknown>(`/api/admin/webhooks?deliveries=1&${params.toString()}`)
      if (!isDeliveriesData(d)) throw new Error('Unexpected response from server')
      setDError(null)
      setDData(d)
    } catch (e) {
      setDError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setDLoading(false)
    }
  }, [dPage, storeId, get])

  useEffect(() => { loadEndpoints() }, [loadEndpoints])
  useEffect(() => { if (tab === 'deliveries') loadDeliveries() }, [tab, loadDeliveries])

  // ── Endpoint form ──

  const openEpCreate = () => {
    setEditingEp(null)
    setEpForm({
      storeId: storeId || stores[0]?.id || '',
      url: '',
      secret: '',
      events: ['*'],
      active: true,
    })
    setEpDialogOpen(true)
  }

  const openEpEdit = (ep: EndpointRow) => {
    setEditingEp(ep)
    setEpForm({
      storeId: ep.storeId,
      url: ep.url,
      secret: '',
      events: ep.events === '*' ? ['*'] : ep.events.split(',').map((s) => s.trim()).filter(Boolean),
      active: ep.active,
    })
    setEpDialogOpen(true)
  }

  const toggleEpEvent = (e: string) => {
    setEpForm((f) => {
      if (e === '*') return { ...f, events: f.events.includes('*') ? [] : ['*'] }
      const withoutAll = f.events.filter((x) => x !== '*')
      return {
        ...f,
        events: withoutAll.includes(e) ? withoutAll.filter((x) => x !== e) : [...withoutAll, e],
      }
    })
  }

  const validateEp = (): string | null => {
    if (!editingEp && !epForm.storeId) return t('whStoreRequired')
    if (!epForm.url.trim()) return t('whUrlRequired')
    try {
      const u = new URL(epForm.url.trim())
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return t('whUrlRequired')
    } catch { return t('whUrlRequired') }
    if (epForm.events.length === 0) return t('whEventRequired')
    return null
  }

  const submitEp = async () => {
    const err = validateEp()
    if (err) { toast.error(err); return }
    setEpSaving(true)
    const eventsParam = epForm.events.includes('*') ? '*' : epForm.events.join(',')
    try {
      if (editingEp) {
        await fetchApi(`/api/admin/webhooks/${editingEp.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: epForm.url.trim(), events: eventsParam, active: epForm.active }),
        })
        toast.success(t('whEndpointUpdated'))
      } else {
        await fetchApi('/api/admin/webhooks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storeId: epForm.storeId,
            url: epForm.url.trim(),
            events: eventsParam,
            secret: epForm.secret.trim() || undefined,
          }),
        })
        toast.success(t('whEndpointCreated'))
      }
      setEpDialogOpen(false)
      await loadEndpoints()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setEpSaving(false)
    }
  }

  // ── Endpoint actions ──

  const toggleEpActive = async (ep: EndpointRow, next: boolean) => {
    setEpData((d) => d ? {
      ...d,
      endpoints: d.endpoints.map((x) => (x.id === ep.id ? { ...x, active: next } : x)),
    } : d)
    try {
      await fetchApi(`/api/admin/webhooks/${ep.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: next }),
      })
    } catch (e) {
      setEpData((d) => d ? {
        ...d,
        endpoints: d.endpoints.map((x) => (x.id === ep.id ? { ...x, active: ep.active } : x)),
      } : d)
      toast.error(e instanceof Error ? e.message : 'Request failed')
    }
  }

  const testEp = async (ep: EndpointRow) => {
    try {
      const d = await fetchApi<{ delivery: { status: string; httpCode: number | null } }>(`/api/admin/webhooks/${ep.id}/test`, { method: 'POST' })
      toast[d.delivery.status === 'SUCCESS' ? 'success' : 'error'](
        d.delivery.status === 'SUCCESS' ? t('whTestOk') : `${t('whTestFailed')} (${d.delivery.httpCode ?? '—'})`
      )
      loadDeliveries()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Request failed')
    }
  }

  const removeEp = async () => {
    if (!deletingEp) return
    setBusy(true)
    try {
      await fetchApi(`/api/admin/webhooks/${deletingEp.id}`, { method: 'DELETE' })
      toast.success(t('whEndpointDeleted'))
      setDeletingEp(null)
      await loadEndpoints()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setBusy(false)
    }
  }

  // ── Retry + resend ──

  const processRetries = async () => {
    try {
      const d = await fetchApi<{ processed: number }>('/api/admin/webhooks/retry', { method: 'POST' })
      toast.success(`${t('whRetriesDone')} — ${t('whRetriesResult').replace('{n}', String(d.processed))}`)
      loadDeliveries()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Request failed')
    }
  }

  const resendDelivery = async () => {
    if (!detail) return
    setResending(true)
    try {
      const d = await fetchApi<{ delivery: { status: string; httpCode: number | null } }>(`/api/admin/webhooks/deliveries/${detail.id}/resend`, { method: 'POST' })
      toast[d.delivery.status === 'SUCCESS' ? 'success' : 'error'](
        d.delivery.status === 'SUCCESS' ? `${t('whResent')} (${d.delivery.httpCode ?? ''})` : `${t('whResendFailed')} (${d.delivery.httpCode ?? '—'})`
      )
      setDetail(null)
      loadDeliveries()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setResending(false)
    }
  }

  // ── Render helpers ──

  const prettyPayload = (p: string): string => {
    try {
      const obj = JSON.parse(p) as unknown
      return JSON.stringify(obj, null, 2)
    } catch {
      return p
    }
  }

  const eventsChips = (events: string) => {
    if (events === '*') {
      return <Badge variant="outline" className="border-primary/25 bg-primary/10 font-mono text-[10px] text-primary">*</Badge>
    }
    return (
      <div className="flex max-w-[12rem] flex-wrap gap-1">
        {events.split(',').map((e) => (
          <Badge key={e} variant="secondary" className="px-1.5 py-0 font-mono text-[10px]">{e}</Badge>
        ))}
      </div>
    )
  }

  const endpointActions = (ep: EndpointRow) => (
    <div className="flex items-center justify-end gap-1">
      <Button
        variant="outline" size="sm" className="press h-8 gap-1.5 text-xs"
        onClick={() => testEp(ep)}
        title={t('whTest')} aria-label={t('whTest')}
      >
        <Send className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{t('whTest')}</span>
      </Button>
      <Button
        variant="ghost" size="icon" className="press h-8 w-8 min-h-8"
        title={t('mEdit')} aria-label={t('mEdit')} onClick={() => openEpEdit(ep)}
      >
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost" size="icon" className="press h-8 w-8 min-h-8 text-destructive hover:text-destructive"
        title={t('mDelete')} aria-label={t('mDelete')} onClick={() => setDeletingEp(ep)}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  )

  const filtered = !!(storeId || get('event') || get('status'))

  // ── Render ──

  return (
    <div>
      <PageHeader
        title={t('webhookCenter')}
        description={t('whSub')}
        icon={<Webhook className="h-5 w-5" />}
        actions={
          <>
            <Button variant="outline" className="press gap-1.5" onClick={processRetries}>
              <RefreshCcw className="h-4 w-4" /> {t('whProcessRetries')}
            </Button>
            <Button className="press gap-1.5" onClick={openEpCreate} disabled={stores.length === 0}>
              <Plus className="h-4 w-4" /> {t('whNewEndpoint')}
            </Button>
          </>
        }
      />

      {/* Store filter (shared by both tabs) */}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Select value={storeId || 'ALL'} onValueChange={(v) => set({ store: v === 'ALL' ? null : v, page: 1 })}>
          <SelectTrigger className="h-9 w-full sm:w-56" aria-label={t('store')}>
            <SelectValue placeholder={t('whAllStores')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('whAllStores')}</SelectItem>
            {stores.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Tabs value={tab} onValueChange={(v) => set({ tab: v === 'endpoints' ? null : v, page: null })}>
        <TabsList className="mb-4 h-auto w-full flex-wrap justify-start gap-1 sm:grid sm:w-full sm:grid-cols-3">
          <TabsTrigger value="endpoints" className="gap-1.5 px-3">{t('whTabEndpoints')}</TabsTrigger>
          <TabsTrigger value="deliveries" className="gap-1.5 px-3">
            <Inbox className="h-3.5 w-3.5" /> {t('whTabDeliveries')}
          </TabsTrigger>
          <TabsTrigger value="events" className="gap-1.5 px-3">
            <Zap className="h-3.5 w-3.5" /> {t('whTabEvents')}
          </TabsTrigger>
        </TabsList>

        {/* ── Endpoints tab ── */}
        <TabsContent value="endpoints" className="mt-0">
          {epError && !epData ? (
            <ErrorCard message={epError} onRetry={() => { setEpLoading(true); loadEndpoints() }} />
          ) : epLoading && !epData ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
            </div>
          ) : stores.length === 0 ? (
            <Card className="border-dashed p-2 shadow-brand">
              <EmptyState
                icon={<Webhook className="h-7 w-7" />}
                title={t('whNoStoresTitle')}
                hint={t('whNoStoresHint')}
              />
            </Card>
          ) : !epData || epData.endpoints.length === 0 ? (
            <Card className="border-dashed p-2 shadow-brand">
              <EmptyState
                icon={<Webhook className="h-7 w-7" />}
                title={t('whNoEndpoints')}
                hint={t('whNoEndpointsHint')}
                action={
                  <Button onClick={openEpCreate} className="press gap-1.5">
                    <Plus className="h-4 w-4" /> {t('whNewEndpoint')}
                  </Button>
                }
              />
            </Card>
          ) : (
            <>
              {/* Desktop table */}
              <Card className="hidden overflow-hidden p-0 shadow-brand md:block">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50 text-left">
                        <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('whUrlCol')}</th>
                        <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('whEventsCol')}</th>
                        <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('whActive')}</th>
                        <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('whDeliveriesCol')}</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('mActions')}</th>
                      </tr>
                    </thead>
                    <tbody className="stagger">
                      {epData.endpoints.map((ep) => (
                        <tr key={ep.id} className="border-b transition-colors last:border-0 hover:bg-muted/40">
                          <td className="max-w-xs px-4 py-3">
                            <p className="truncate font-mono text-xs font-semibold text-foreground">{ep.url}</p>
                            {ep.store && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{ep.store.name}</p>}
                          </td>
                          <td className="px-4 py-3">{eventsChips(ep.events)}</td>
                          <td className="px-4 py-3">
                            <Switch checked={ep.active} aria-label={`${t('whActive')}: ${hostOf(ep.url)}`} onCheckedChange={(v) => toggleEpActive(ep, v)} />
                          </td>
                          <td className="px-4 py-3 tabular text-sm font-semibold">{ep._count?.deliveries ?? 0}</td>
                          <td className="px-4 py-3">{endpointActions(ep)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* Mobile cards */}
              <div className="stagger space-y-3 md:hidden">
                {epData.endpoints.map((ep) => (
                  <Card key={ep.id} className="hover-lift p-4 shadow-brand">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="break-all font-mono text-xs font-semibold text-foreground">{ep.url}</p>
                        {ep.store && <p className="mt-0.5 text-[11px] text-muted-foreground">{ep.store.name}</p>}
                      </div>
                      <Switch checked={ep.active} aria-label={t('whActive')} onCheckedChange={(v) => toggleEpActive(ep, v)} />
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      {eventsChips(ep.events)}
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {ep._count?.deliveries ?? 0} {t('whDeliveriesCol').toLowerCase()}
                      </span>
                    </div>
                    <div className="mt-3 border-t pt-2">{endpointActions(ep)}</div>
                  </Card>
                ))}
              </div>
            </>
          )}
        </TabsContent>

        {/* ── Deliveries tab ── */}
        <TabsContent value="deliveries" className="mt-0">
          {/* Filters */}
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <Select value={get('event') || 'ALL'} onValueChange={(v) => set({ event: v === 'ALL' ? null : v, page: 1 })}>
              <SelectTrigger className="h-9 w-full sm:w-48" aria-label={t('whEvent')}>
                <SelectValue placeholder={t('whEvent')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t('whAllEvents')}</SelectItem>
                {EVENTS.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={get('status') || 'ALL'} onValueChange={(v) => set({ status: v === 'ALL' ? null : v, page: 1 })}>
              <SelectTrigger className="h-9 w-full sm:w-40" aria-label={t('whStatus')}>
                <SelectValue placeholder={t('whStatus')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t('whAllStatuses')}</SelectItem>
                <SelectItem value="SUCCESS">{t('whStatusSuccess')}</SelectItem>
                <SelectItem value="FAILED">{t('whStatusFailed')}</SelectItem>
                <SelectItem value="PENDING">{t('whStatusPending')}</SelectItem>
              </SelectContent>
            </Select>
            {filtered && (
              <Button variant="ghost" size="sm" className="press h-9" onClick={() => set({ event: null, status: null, page: 1 })}>
                {t('whClearFilters')}
              </Button>
            )}
          </div>

          {dError && !dData ? (
            <ErrorCard message={dError} onRetry={() => { setDLoading(true); loadDeliveries() }} />
          ) : dLoading && !dData ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
            </div>
          ) : !dData || dData.deliveries.length === 0 ? (
            <Card className="border-dashed p-2 shadow-brand">
              {filtered ? (
                <EmptyState
                  icon={<Inbox className="h-7 w-7" />}
                  title={t('whNoResults')}
                  action={
                    <Button variant="outline" size="sm" className="press" onClick={() => set({ event: null, status: null, page: 1 })}>
                      {t('whClearFilters')}
                    </Button>
                  }
                />
              ) : (
                <EmptyState icon={<Inbox className="h-7 w-7" />} title={t('whNoDeliveries')} hint={t('whNoDeliveriesHint')} />
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
                        <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('whEvent')}</th>
                        <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('whUrlCol')}</th>
                        <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('whStatus')}</th>
                        <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('whHttpCol')}</th>
                        <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('whAttemptsCol')}</th>
                        <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('whTimeCol')}</th>
                      </tr>
                    </thead>
                    <tbody className="stagger">
                      {dData.deliveries.map((d) => (
                        <tr
                          key={d.id}
                          className="cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/40"
                          onClick={() => setDetail(d)}
                        >
                          <td className="px-4 py-3">
                            <Badge variant="outline" className="font-mono text-[11px]">{d.event}</Badge>
                          </td>
                          <td className="max-w-[16rem] px-4 py-3">
                            <p className="truncate text-xs font-medium text-foreground">{d.endpoint ? hostOf(d.endpoint.url) : `— ${t('mWebhookUrl').toLowerCase()}`}</p>
                            {d.store && <p className="truncate text-[11px] text-muted-foreground">{d.store.name}</p>}
                          </td>
                          <td className="px-4 py-3"><StatusBadge status={d.status} /></td>
                          <td className="px-4 py-3 tabular text-xs font-semibold">{d.httpCode ?? '—'}</td>
                          <td className="px-4 py-3 tabular text-xs">{d.attempts}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{timeAgo(d.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* Mobile cards */}
              <div className="stagger space-y-2.5 md:hidden">
                {dData.deliveries.map((d) => (
                  <Card
                    key={d.id}
                    className="hover-lift cursor-pointer p-3.5 shadow-brand"
                    onClick={() => setDetail(d)}
                    role="button" tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter') setDetail(d) }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant="outline" className="font-mono text-[11px]">{d.event}</Badge>
                      <StatusBadge status={d.status} />
                    </div>
                    <p className="mt-1.5 truncate text-xs font-medium text-foreground">
                      {d.endpoint ? hostOf(d.endpoint.url) : '—'}
                    </p>
                    <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
                      <span>HTTP {d.httpCode ?? '—'}</span>
                      <span>{t('whAttemptsCol')}: {d.attempts}</span>
                      <span>{timeAgo(d.createdAt)}</span>
                    </div>
                  </Card>
                ))}
              </div>
              <Pagination page={dData.page} pages={dData.pages} total={dData.total} />
            </>
          )}
        </TabsContent>

        {/* ── Events tab ── */}
        <TabsContent value="events" className="mt-0">
          <p className="mb-4 text-sm text-muted-foreground">{t('whEventDescHint')}</p>
          <div className="stagger grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {EVENTS.map((e) => (
              <Card key={e} className="hover-lift p-4 shadow-brand">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="border-primary/25 bg-primary/10 font-mono text-[11px] text-primary">{e}</Badge>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{t(eventKey(e))}</p>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Endpoint create/edit dialog */}
      <Dialog open={epDialogOpen} onOpenChange={setEpDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingEp ? t('whEditEndpoint') : t('whNewEndpoint')}</DialogTitle>
            <DialogDescription>{t('whEndpointUrlHint')}</DialogDescription>
          </DialogHeader>
          <div className="grid max-h-[60vh] gap-3.5 overflow-y-auto nice-scroll">
            {!editingEp && (
              <div className="grid gap-1.5">
                <Label>{t('store')} *</Label>
                <Select value={epForm.storeId} onValueChange={(v) => setEpForm((f) => ({ ...f, storeId: v }))}>
                  <SelectTrigger aria-label={t('store')}><SelectValue placeholder={t('whStoreRequired')} /></SelectTrigger>
                  <SelectContent>
                    {stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor="ep-url">{t('whEndpointUrl')} *</Label>
              <Input
                id="ep-url" value={epForm.url} autoFocus
                onChange={(e) => setEpForm((f) => ({ ...f, url: e.target.value }))}
                placeholder="https://myshop.com/api/webhooks"
                className="font-mono text-xs"
              />
            </div>
            {!editingEp && (
              <div className="grid gap-1.5">
                <Label htmlFor="ep-secret">{t('whSecret')}</Label>
                <Input
                  id="ep-secret" value={epForm.secret}
                  onChange={(e) => setEpForm((f) => ({ ...f, secret: e.target.value }))}
                  placeholder="wh_…" className="font-mono text-xs"
                />
                <p className="text-[11px] text-muted-foreground">{t('whSecretHint')}</p>
              </div>
            )}
            <div className="grid gap-2">
              <Label>{t('whEvents')}</Label>
              <p className="text-[11px] text-muted-foreground">{t('whEventsHint')}</p>
              <div className="grid gap-1.5">
                <label className="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-muted/50">
                  <Checkbox checked={epForm.events.includes('*')} onCheckedChange={() => toggleEpEvent('*')} aria-label={t('whEventsAll')} />
                  <span className="font-mono text-xs font-semibold">{t('whEventsAll')}</span>
                </label>
                {epForm.events.includes('*') && (
                  <p className="px-1 text-[11px] text-muted-foreground">{t('whEventsAll')} — {EVENTS.join(', ')}</p>
                )}
                {!epForm.events.includes('*') && EVENTS.map((e) => (
                  <label key={e} className="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-muted/50">
                    <Checkbox checked={epForm.events.includes(e)} onCheckedChange={() => toggleEpEvent(e)} aria-label={e} />
                    <span className="font-mono text-xs">{e}</span>
                  </label>
                ))}
              </div>
            </div>
            {editingEp && (
              <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
                <Label htmlFor="ep-active" className="cursor-pointer">{t('whActive')}</Label>
                <Switch
                  id="ep-active" checked={epForm.active}
                  onCheckedChange={(v) => setEpForm((f) => ({ ...f, active: v }))}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" className="press" onClick={() => setEpDialogOpen(false)}>{t('mCancel')}</Button>
            <Button className="press" disabled={epSaving} onClick={submitEp}>
              {epSaving ? '…' : editingEp ? t('mSave') : t('mCreate')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delivery detail dialog */}
      <Dialog open={!!detail} onOpenChange={(o) => { if (!o) setDetail(null) }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              {t('whDeliveryDetail')}
              {detail && <Badge variant="outline" className="font-mono text-[11px]">{detail.event}</Badge>}
              {detail && <StatusBadge status={detail.status} />}
            </DialogTitle>
            <DialogDescription className="font-mono text-xs">
              {detail?.endpoint ? detail.endpoint.url : '—'}
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="max-h-[60vh] space-y-3 overflow-y-auto nice-scroll">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                <div>
                  <p className="text-muted-foreground">{t('whStatus')}</p>
                  <p className="font-semibold">{detail.status}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t('whHttpCol')}</p>
                  <p className="tabular font-semibold">{detail.httpCode ?? '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t('whAttemptsCol')}</p>
                  <p className="tabular font-semibold">{detail.attempts}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t('whResponseAt')}</p>
                  <p className="font-semibold">{detail.responseAt ? formatDateTime(detail.responseAt) : '—'}</p>
                </div>
                {detail.nextRetryAt && (
                  <div className="col-span-2">
                    <p className="text-muted-foreground">{t('whNextRetry')}</p>
                    <p className="font-semibold text-amber-600 dark:text-amber-400">{formatDateTime(detail.nextRetryAt)}</p>
                  </div>
                )}
                {detail.store && (
                  <div className="col-span-2">
                    <p className="text-muted-foreground">{t('store')}</p>
                    <p className="font-semibold">{detail.store.name}</p>
                  </div>
                )}
              </div>

              {detail.error && (
                <div className="rounded-lg border border-destructive/25 bg-destructive/5 p-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-destructive">{t('whError')}</p>
                  <p className="mt-0.5 break-all font-mono text-xs text-destructive">{detail.error}</p>
                </div>
              )}

              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t('whPayload')}</p>
                <pre className="max-h-56 overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed nice-scroll">
                  {prettyPayload(detail.payload)}
                </pre>
              </div>

              {detail.signature && (
                <div>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t('whSignature')}</p>
                  <code className="block break-all rounded-lg border bg-muted/40 px-2.5 py-2 font-mono text-[11px]">{detail.signature}</code>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline" className="press gap-1.5"
              onClick={() => { if (detail) window.open(detail.endpoint?.url ?? '#', '_blank', 'noopener') }}
              disabled={!detail?.endpoint}
            >
              <ExternalLink className="h-4 w-4" /> {t('whUrlCol')}
            </Button>
            <Button className="press gap-1.5" onClick={resendDelivery} disabled={resending}>
              <RotateCw className={cn('h-4 w-4', resending && 'animate-spin')} /> {t('whResend')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete endpoint confirm */}
      <AlertDialog open={!!deletingEp} onOpenChange={(o) => { if (!o) setDeletingEp(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('whDeleteEndpointTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="break-all font-mono text-xs">{deletingEp?.url}</span>
              <br />{t('whDeleteEndpointDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="press">{t('mCancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="press bg-destructive text-white hover:bg-destructive/90"
              disabled={busy}
              onClick={(e) => { e.preventDefault(); removeEp() }}
            >
              {t('mDelete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
