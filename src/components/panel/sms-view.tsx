'use client'

import { useCallback, useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import {
  Inbox, Clock, CheckCircle2, XCircle, AlertTriangle, MessageSquareText, Trash2,
  Send, WandSparkles, ShieldCheck, Loader2, Eye,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatBDT, formatDateTime, timeAgo, MFS_META } from '@/lib/format'
import { SAMPLE_SMS, detectMfsFromSender } from '@/lib/sms-parser'
import { fetchApi } from '@/lib/api-client'
import { useUrlState } from '@/hooks/use-url-state'
import { PageHeader, StatCard, EmptyState, ErrorCard, MfsBadge, SearchInput, Pagination, DetailRow } from './ui-bits'
import { useLang } from '@/lib/i18n'

interface TxLite {
  id: string
  trxId: string | null
  mfs: string
  amount: number
  status: string
  checkoutId: string | null
}

interface SmsItem {
  id: string
  deviceId: string
  sender: string
  body: string
  simNumber: string | null
  receivedAt: string
  processed: boolean
  parsed: boolean
  review: string
  note: string | null
  source: string
  device?: { id: string; name: string } | null
  transaction?: TxLite | null
}

interface SmsSummary { total: number; today: number; awaiting: number; errors: number }

interface SimResult {
  smsId: string
  parsed: boolean
  transactionId?: string
  matched?: boolean
  matchedKind?: 'checkout' | 'link' | 'invoice'
  note?: string
}

const LIST_TABS = ['inbox', 'review', 'errors'] as const
type ListTab = (typeof LIST_TABS)[number]

function reviewBadgeCls(review: string): string {
  switch (review) {
    case 'APPROVED': return 'border-success/25 bg-success/10 text-success'
    case 'AWAITING_REVIEW': return 'border-warning/30 bg-warning/15 text-amber-700 dark:text-amber-400'
    case 'ERROR': return 'border-destructive/25 bg-destructive/10 text-destructive'
    default: return 'bg-muted text-muted-foreground border-border'
  }
}

/** Display-only reference of sender IDs each provider sends payment SMS from. */
const WHITELIST: Array<{ mfs: string; senders: string[] }> = [
  { mfs: 'BKASH', senders: ['bKash', '16247'] },
  { mfs: 'NAGAD', senders: ['NAGAD', '16167'] },
  { mfs: 'ROCKET', senders: ['ROCKET', '16216', 'DBBL', '8446'] },
  { mfs: 'UPAY', senders: ['UPAY', '16745'] },
  { mfs: 'MCASH', senders: ['mCash', '16259'] },
  { mfs: 'BANK', senders: ['BRACBank', 'CityBank', 'EBL', 'IBBL', 'SCB', 'MTB', 'UCB', 'PubaliBank'] },
]

/** Human labels for SAMPLE_SMS (order matches src/lib/sms-parser.ts). */
const SAMPLE_LABELS = ['bKash', 'Nagad', 'Rocket', 'Upay', 'Bank · BEFTN', 'Bank · GPay', 'বাংলা']

export function SmsCenterView() {
  const { t } = useLang()
  const { get, getNum, set } = useUrlState()
  const tab = get('tab', 'inbox')
  const page = getNum('page', 1)
  const deviceId = get('deviceId')

  const [items, setItems] = useState<SmsItem[]>([])
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [summary, setSummary] = useState<SmsSummary | null>(null)
  const [devices, setDevices] = useState<Array<{ id: string; name: string; status: string }>>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  // detail dialog
  const [detail, setDetail] = useState<SmsItem | null>(null)

  // simulator state (own local state — not URL-driven)
  const [simDevice, setSimDevice] = useState('')
  const [simSender, setSimSender] = useState(SAMPLE_SMS[0]?.sender ?? 'bKash')
  const [simBody, setSimBody] = useState(SAMPLE_SMS[0]?.body ?? '')
  const [simBusy, setSimBusy] = useState(false)
  const [simResult, setSimResult] = useState<SimResult | null>(null)

  const isListTab = (LIST_TABS as readonly string[]).includes(tab)
  const reviewParam = tab === 'review' ? 'AWAITING_REVIEW' : tab === 'errors' ? 'ERROR' : null

  const load = useCallback(async (silent = false) => {
    if (!silent) setErr(null)
    try {
      const params = new URLSearchParams({ page: String(page) })
      if (reviewParam) params.set('review', reviewParam)
      if (deviceId) params.set('deviceId', deviceId)
      const q = get('q')
      if (q) params.set('q', q)
      const [list, sum] = await Promise.all([
        fetchApi<{ items: SmsItem[]; total: number; pageSize: number }>(`/api/admin/sms?${params}`),
        fetchApi<SmsSummary>('/api/admin/sms?summary=1'),
      ])
      setItems(Array.isArray(list.items) ? list.items : [])
      setTotal(list.total ?? 0)
      setPages(Math.max(1, Math.ceil((list.total ?? 0) / (list.pageSize ?? 25))))
      setSummary(sum ?? null)
    } catch (e) {
      if (!silent) setErr(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [page, reviewParam, deviceId, get])

  useEffect(() => {
    load()
    const iv = setInterval(() => load(true), 20_000)
    return () => clearInterval(iv)
  }, [load])

  useEffect(() => {
    let alive = true
    fetchApi<{ items: Array<{ id: string; name: string; status: string }> }>('/api/admin/devices')
      .then((d) => {
        if (!alive) return
        const list = Array.isArray(d.items) ? d.items : []
        setDevices(list)
        setSimDevice((cur) => cur || list[0]?.id || '')
      })
      .catch(() => { /* simulator device list stays empty */ })
    return () => { alive = false }
  }, [])

  async function act(sms: SmsItem, action: 'approve' | 'retry') {
    try {
      const res = await fetchApi<{ ok: boolean; transactionId: string; matched: boolean }>(`/api/admin/sms/${sms.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      toast.success(action === 'approve' ? t('approvedToast') : t('retriedToast'), {
        description: res.matched ? t('simMatchedYes') : undefined,
      })
      setDetail(null)
      load(true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    }
  }

  async function remove(sms: SmsItem) {
    try {
      await fetchApi(`/api/admin/sms/${sms.id}`, { method: 'DELETE' })
      toast.success(t('smsDeleted'))
      setDetail(null)
      load(true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    }
  }

  async function forward() {
    if (!simDevice) { toast.error(t('simNeedsDevice')); return }
    if (!simBody.trim()) return
    setSimBusy(true)
    setSimResult(null)
    try {
      const data = await fetchApi<{ result: SimResult }>('/api/admin/sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: simDevice, sender: simSender, body: simBody }),
      })
      setSimResult(data.result ?? null)
      toast.success(t('forwarded'))
      load(true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setSimBusy(false)
    }
  }

  function renderRow(s: SmsItem) {
    const tx = s.transaction
    const senderMfs = detectMfsFromSender(s.sender)
    return (
      <div key={s.id} className="flex flex-col gap-2 px-4 py-3.5 transition-colors hover:bg-muted/40 sm:flex-row sm:items-start sm:gap-3 sm:px-5">
        <div className="flex shrink-0 flex-col items-start gap-1.5">
          {senderMfs ? (
            <MfsBadge mfs={senderMfs} />
          ) : (
            <Badge variant="outline" className="max-w-[120px] truncate font-mono text-[10px]">{s.sender}</Badge>
          )}
          <Badge variant="outline" className={cn('text-[10px]', reviewBadgeCls(s.review))}>
            {s.review === 'AUTO' ? t('reviewAuto') : s.review === 'APPROVED' ? t('reviewApproved') : s.review === 'AWAITING_REVIEW' ? t('reviewAwaiting') : t('reviewError')}
          </Badge>
        </div>
        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setDetail(s)} aria-label={t('fullBody')}>
          <p className="line-clamp-2 break-words font-mono text-xs leading-relaxed text-foreground/85">{s.body}</p>
          <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-[11px] text-muted-foreground">
            <span className="font-medium">{s.device?.name ?? '—'}</span>
            {s.simNumber && <span>· {s.simNumber}</span>}
            <span>· {timeAgo(s.receivedAt)} · {formatDateTime(s.receivedAt)}</span>
            {s.source !== 'APP' && <span className="rounded bg-muted px-1 text-[10px] uppercase">{s.source}</span>}
          </p>
          {tx && (
            <span className="mt-1 inline-flex items-center gap-1.5 text-[11px]">
              <MfsBadge mfs={tx.mfs} />
              <span className="tabular font-semibold text-foreground">{formatBDT(tx.amount)}</span>
              {tx.trxId && <span className="font-mono text-muted-foreground">{tx.trxId}</span>}
            </span>
          )}
        </button>
        <div className="flex shrink-0 items-center gap-1">
          {tab === 'review' && (
            <Button size="sm" className="press h-9 gap-1" onClick={() => act(s, 'approve')}>
              <CheckCircle2 className="h-3.5 w-3.5" /> {t('approve')}
            </Button>
          )}
          {tab === 'errors' && (
            <Button size="sm" variant="outline" className="press h-9 gap-1" onClick={() => act(s, 'retry')}>
              <WandSparkles className="h-3.5 w-3.5" /> {t('retryParse')}
            </Button>
          )}
          <Button size="icon" variant="ghost" className="h-9 w-9 text-muted-foreground hover:text-destructive" aria-label={t('viewDetails')} onClick={() => setDetail(s)}>
            <Eye className="h-4 w-4" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="icon" variant="ghost" className="h-9 w-9 text-muted-foreground hover:text-destructive" aria-label={t('delete')}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('deleteSmsTitle')}</AlertDialogTitle>
                <AlertDialogDescription>{t('confirmDelete')}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
                <AlertDialogAction onClick={() => remove(s)} className="bg-destructive text-white hover:bg-destructive/90">
                  {t('delete')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    )
  }

  function renderList(emptyHint?: string) {
    if (loading) {
      return <div className="space-y-2 p-5">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
    }
    if (err) return <div className="p-5"><ErrorCard message={err} onRetry={() => load()} /></div>
    if (items.length === 0) {
      return <EmptyState icon={<MessageSquareText className="h-10 w-10" />} title={t('noSms')} hint={emptyHint ?? t('noSmsHint')} />
    }
    return (
      <>
        <div className="divide-y">{items.map(renderRow)}</div>
        <Pagination page={page} pages={pages} total={total} />
      </>
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader title={t('smsCenter')} description={t('smsSub')} icon={<MessageSquareText className="h-5 w-5" />} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard loading={!summary && loading} label={t('total')} value={String(summary?.total ?? 0)} icon={<Inbox className="h-4 w-4" />} />
        <StatCard loading={!summary && loading} label={t('today')} value={String(summary?.today ?? 0)} icon={<Clock className="h-4 w-4" />} />
        <StatCard
          loading={!summary && loading}
          label={t('statAwaiting')}
          value={String(summary?.awaiting ?? 0)}
          icon={<ShieldCheck className="h-4 w-4" />}
          tone="text-amber-600 bg-warning/15"
        />
        <StatCard
          loading={!summary && loading}
          label={t('statErrors')}
          value={String(summary?.errors ?? 0)}
          icon={<AlertTriangle className="h-4 w-4" />}
          tone="text-destructive bg-destructive/10"
        />
      </div>

      <Tabs value={tab} onValueChange={(v) => set({ tab: v === 'inbox' ? null : v, page: null })}>
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 sm:grid sm:w-full sm:grid-cols-5">
          <TabsTrigger value="inbox" className="gap-1.5 px-3">{t('tabInbox')}</TabsTrigger>
          <TabsTrigger value="review" className="gap-1.5 px-3">
            {t('tabReview')}
            {(summary?.awaiting ?? 0) > 0 && (
              <Badge className="h-4 rounded-full px-1.5 text-[10px] leading-none">{summary?.awaiting}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="errors" className="gap-1.5 px-3">
            {t('tabErrors')}
            {(summary?.errors ?? 0) > 0 && (
              <Badge variant="destructive" className="h-4 rounded-full px-1.5 text-[10px] leading-none">{summary?.errors}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="simulator" className="gap-1.5 px-3">{t('tabSimulator')}</TabsTrigger>
          <TabsTrigger value="whitelist" className="gap-1.5 px-3">{t('tabWhitelist')}</TabsTrigger>
        </TabsList>

        {isListTab && (
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <SearchInput paramKey="q" placeholder={t('search')} className="sm:w-72" />
            <Select
              value={deviceId || '__all'}
              onValueChange={(v) => set({ deviceId: v === '__all' ? null : v, page: null })}
            >
              <SelectTrigger className="h-9 w-full sm:w-52">
                <SelectValue placeholder={t('filterDevice')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">{t('filterDevice')}</SelectItem>
                {devices.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}

        <TabsContent value="inbox" className="mt-3">
          <Card><CardContent className="p-0">{renderList()}</CardContent></Card>
        </TabsContent>

        <TabsContent value="review" className="mt-3">
          <Card><CardContent className="p-0">{renderList()}</CardContent></Card>
        </TabsContent>

        <TabsContent value="errors" className="mt-3">
          <Card><CardContent className="p-0">{renderList()}</CardContent></Card>
        </TabsContent>

        <TabsContent value="simulator" className="mt-3">
          <Card>
            <CardContent className="space-y-4 p-5">
              <p className="text-xs leading-relaxed text-muted-foreground">{t('simulatorHint')}</p>
              {devices.length === 0 ? (
                <EmptyState icon={<WandSparkles className="h-10 w-10" />} title={t('simNeedsDevice')} hint={t('noDevicesHint')} />
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">{t('simDevice')}</Label>
                      <Select value={simDevice} onValueChange={setSimDevice}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {devices.map((d) => (
                            <SelectItem key={d.id} value={d.id}>{d.name} · {d.status}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">{t('sender')}</Label>
                      <Input value={simSender} onChange={(e) => setSimSender(e.target.value)} className="h-9 font-mono" />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">{t('simBody')}</Label>
                    <Textarea value={simBody} onChange={(e) => setSimBody(e.target.value)} rows={4} className="font-mono text-xs" />
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">{t('sample')}:</span>
                    {SAMPLE_SMS.map((s, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => { setSimSender(s.sender); setSimBody(s.body); setSimResult(null) }}
                        className="press rounded-full border bg-muted/40 px-2.5 py-1.5 text-[11px] font-medium text-foreground/70 hover:border-primary/40 hover:text-primary"
                      >
                        {SAMPLE_LABELS[i] ?? MFS_META[s.mfs]?.label ?? s.mfs}
                      </button>
                    ))}
                  </div>

                  <Button onClick={forward} disabled={simBusy || !simBody.trim()} className="press gap-1.5">
                    {simBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    {t('forwardToPanel')}
                  </Button>

                  {simResult && (
                    <div className="anim-scale-in rounded-xl border bg-muted/30 p-4">
                      <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                        {simResult.parsed
                          ? <CheckCircle2 className="h-4 w-4 text-success" />
                          : <XCircle className="h-4 w-4 text-destructive" />}
                        {t('simResult')}
                      </p>
                      <DetailRow label={t('parsed')} value={simResult.parsed ? t('simParsedYes') : t('simParsedNo')} />
                      {simResult.transactionId && <DetailRow label={t('simTransaction')} value={simResult.transactionId} mono />}
                      {simResult.parsed && (
                        <DetailRow label={t('simMatchedYes')} value={simResult.matched ? `${t('yes')} · ${simResult.matchedKind ?? ''}` : t('simMatchedNo')} />
                      )}
                      {simResult.note && <DetailRow label={t('simNote')} value={simResult.note} />}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="whitelist" className="mt-3">
          <Card>
            <CardContent className="p-5">
              <p className="mb-4 text-xs leading-relaxed text-muted-foreground">{t('whitelistHint')}</p>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 stagger">
                {WHITELIST.map((w) => (
                  <div key={w.mfs} className="hover-lift rounded-xl border bg-card p-4">
                    <div className="mb-2"><MfsBadge mfs={w.mfs} /></div>
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t('whitelistSenders')}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {w.senders.map((s) => (
                        <Badge key={s} variant="outline" className="font-mono text-[11px] font-normal">{s}</Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Full SMS body dialog */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-mono">{detail?.sender}</DialogTitle>
            <DialogDescription>
              {detail?.device?.name ?? '—'} · {detail ? formatDateTime(detail.receivedAt) : ''}
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="space-y-3">
              <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border bg-muted/40 p-3 font-mono text-xs leading-relaxed text-foreground">
                {detail.body}
              </pre>
              <div>
                <DetailRow label={t('reviewLabel')} value={detail.review} />
                <DetailRow label={t('simNumber')} value={detail.simNumber ?? '—'} mono />
                <DetailRow label={t('received')} value={formatDateTime(detail.receivedAt)} />
                {detail.note && <DetailRow label={t('simNote')} value={detail.note} />}
                {detail.transaction && (
                  <DetailRow
                    label={t('txLinked')}
                    value={
                      <span className="inline-flex items-center gap-1.5">
                        <MfsBadge mfs={detail.transaction.mfs} />
                        {formatBDT(detail.transaction.amount)} · {detail.transaction.trxId ?? detail.transaction.id}
                      </span>
                    }
                  />
                )}
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                {detail.review === 'AWAITING_REVIEW' && !detail.transaction && (
                  <Button size="sm" className="press gap-1" onClick={() => act(detail, 'approve')}>
                    <CheckCircle2 className="h-3.5 w-3.5" /> {t('approve')}
                  </Button>
                )}
                {detail.review === 'ERROR' && !detail.transaction && (
                  <Button size="sm" variant="outline" className="press gap-1" onClick={() => act(detail, 'retry')}>
                    <WandSparkles className="h-3.5 w-3.5" /> {t('retryParse')}
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
