'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, BadgeCheck, Ban, FileText, Gavel, History, Mail, MessageSquare,
  Plus, RefreshCw, Repeat, ShieldAlert, Tag, User, Wallet, X, Zap, ExternalLink,
} from 'lucide-react'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  CopyButton, EmptyState, ErrorCard, MfsBadge, StatCard, StatusBadge,
} from '@/components/panel/ui-bits'
import { useLang } from '@/lib/i18n'
import { fetchApi } from '@/lib/api-client'
import { formatBDT, formatDateTime, timeAgo } from '@/lib/format'
import { cn } from '@/lib/utils'

// ── Types ────────────────────────────────────────────────────────────────────
type Customer = {
  id: string
  name: string
  email: string | null
  phone: string | null
  suspended: boolean
  suspendReason: string | null
  notes: string | null
  tags: string | null
  createdAt: string
}

type TimelineItem = {
  type: 'transaction' | 'invoice' | 'refund' | 'dispute' | 'subscription' | 'email' | 'sms' | 'activity' | 'event'
  at: string
  title: string
  detail?: string
  amount?: number
  status?: string
  ref?: string
}

type RiskCase = {
  id: string
  subjectRef: string | null
  score: number
  reason: string
  status: string
  createdAt: string
}

const TIMELINE_META: Record<TimelineItem['type'], { icon: React.ElementType; cls: string }> = {
  transaction: { icon: Wallet, cls: 'bg-success/10 text-success' },
  invoice: { icon: FileText, cls: 'bg-primary/10 text-primary' },
  refund: { icon: RefreshCw, cls: 'bg-warning/15 text-amber-600 dark:text-amber-400' },
  dispute: { icon: Gavel, cls: 'bg-destructive/10 text-destructive' },
  subscription: { icon: Repeat, cls: 'bg-primary/10 text-primary' },
  email: { icon: Mail, cls: 'bg-muted text-muted-foreground' },
  sms: { icon: MessageSquare, cls: 'bg-muted text-muted-foreground' },
  activity: { icon: History, cls: 'bg-muted text-muted-foreground' },
  event: { icon: Zap, cls: 'bg-primary/10 text-primary' },
}

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '?'
}

function parseTags(json: string | null): string[] {
  if (!json) return []
  try {
    const arr: unknown = JSON.parse(json)
    return Array.isArray(arr) ? arr.filter((t): t is string => typeof t === 'string') : []
  } catch {
    return []
  }
}

// ── View ─────────────────────────────────────────────────────────────────────
export function Customer360View({ customerId }: { customerId: string }) {
  const { t } = useLang()

  const [customer, setCustomer] = useState<Customer | null>(null)
  const [timeline, setTimeline] = useState<TimelineItem[]>([])
  const [riskCases, setRiskCases] = useState<RiskCase[]>([])
  const [portalPath, setPortalPath] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tick, setTick] = useState(0) // bump to refetch after mutations

  const [newTag, setNewTag] = useState('')
  const [tagBusy, setTagBusy] = useState(false)
  const [note, setNote] = useState('')
  const [noteBusy, setNoteBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [cust, tl] = await Promise.all([
        fetchApi<{ customer: Customer }>(`/api/admin/customers/${customerId}`),
        fetchApi<{ items: TimelineItem[] }>(`/api/admin/customers/${customerId}/timeline`),
      ])
      setCustomer(cust.customer)
      setTimeline(tl.items ?? [])

      // Portal link (deterministic HMAC token)
      const pl = await fetchApi<{ path: string }>(`/api/admin/customers/${customerId}/portal-link`)
      setPortalPath(pl.path)

      // Risk cases by phone
      if (cust.customer?.phone) {
        try {
          const risk = await fetchApi<{ items: RiskCase[] }>(
            `/api/admin/risk/cases?q=${encodeURIComponent(cust.customer.phone)}&status=OPEN`,
          )
          setRiskCases(risk.items ?? [])
        } catch { /* risk tab degrades to "none" */ }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [customerId])

  useEffect(() => { void load() }, [load, tick])

  const tags = useMemo(() => parseTags(customer?.tags ?? null), [customer])

  const txItems = useMemo(() => timeline.filter((i) => i.type === 'transaction'), [timeline])
  const invItems = useMemo(() => timeline.filter((i) => i.type === 'invoice'), [timeline])
  const emailItems = useMemo(() => timeline.filter((i) => i.type === 'email'), [timeline])
  const smsItems = useMemo(() => timeline.filter((i) => i.type === 'sms'), [timeline])
  const noteLines = useMemo(() => (customer?.notes ? customer.notes.split('\n').filter(Boolean) : []), [customer])

  const ltv = useMemo(
    () => txItems.filter((i) => i.status === 'PAID' || i.status === 'MATCHED').reduce((s, i) => s + (i.amount ?? 0), 0),
    [txItems],
  )

  // ── Mutations ──
  const addTag = async () => {
    const tag = newTag.trim()
    if (!tag) return
    if (tag.length > 24) { toast.error(t('c360TagTooLong')); return }
    setTagBusy(true)
    try {
      await fetchApi(`/api/admin/customers/${customerId}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag }),
      })
      toast.success(t('c360TagAdded'))
      setNewTag('')
      setTick((n) => n + 1)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setTagBusy(false)
    }
  }

  const removeTag = async (tag: string) => {
    setTagBusy(true)
    try {
      await fetchApi(`/api/admin/customers/${customerId}/tags`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: tags.filter((x) => x !== tag) }),
      })
      toast.success(t('c360TagsSaved'))
      setTick((n) => n + 1)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setTagBusy(false)
    }
  }

  const addNote = async () => {
    const body = note.trim()
    if (!body) { toast.error(t('c360NoteRequired')); return }
    setNoteBusy(true)
    try {
      await fetchApi(`/api/admin/customers/${customerId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: body }),
      })
      toast.success(t('c360NoteAdded'))
      setNote('')
      setTick((n) => n + 1)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setNoteBusy(false)
    }
  }

  // ── Loading / error / 404 states ──
  if (loading && !customer) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    )
  }
  if (error && !customer) {
    return <ErrorCard message={error} onRetry={() => void load()} />
  }
  if (!customer) {
    return <EmptyState icon={<User className="h-7 w-7" />} title={t('c360NotFound')} />
  }

  const portalUrl = typeof window !== 'undefined' && portalPath ? `${window.location.origin}${portalPath}` : portalPath

  return (
    <div className="space-y-5">
      {/* Back + title */}
      <div className="anim-fade-up flex items-center gap-3">
        <Button asChild variant="ghost" size="sm" className="press h-8 gap-1.5">
          <Link href="/admin/customers"><ArrowLeft className="h-4 w-4" /> {t('c360Back')}</Link>
        </Button>
      </div>

      {/* Header card */}
      <Card className="anim-fade-up p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-lg font-bold text-primary">
              {initials(customer.name)}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-lg font-bold text-foreground sm:text-xl">{customer.name}</h1>
                {customer.suspended ? (
                  <Badge variant="outline" className="gap-1 border-destructive/30 bg-destructive/10 text-destructive">
                    <Ban className="h-3 w-3" /> {t('c360Suspended')}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="gap-1 border-success/25 bg-success/10 text-success">
                    <BadgeCheck className="h-3 w-3" /> {t('c360Active')}
                  </Badge>
                )}
              </div>
              {customer.suspended && customer.suspendReason && (
                <p className="mt-0.5 text-xs text-destructive">{t('c360SuspendReason')}: {customer.suspendReason}</p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                {customer.phone || customer.email
                  ? [customer.phone, customer.email].filter(Boolean).join(' · ')
                  : t('c360NoContact')}
                <span className="mx-1.5 opacity-40">|</span>
                {t('c360Since')} {formatDateTime(customer.createdAt)}
              </p>

              {/* Tags */}
              <div className="mt-3">
                <p className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <Tag className="h-3 w-3" /> {t('c360Tags')}
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {tags.length === 0 && <span className="text-xs text-muted-foreground/70">{t('c360NoTags')}</span>}
                  {tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="gap-1 pr-1">
                      {tag}
                      <button
                        type="button"
                        aria-label={`${t('c360Tags')}: remove ${tag}`}
                        disabled={tagBusy}
                        onClick={() => void removeTag(tag)}
                        className="rounded-full p-0.5 hover:bg-destructive/15 hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                  <span className="inline-flex items-center gap-1">
                    <Input
                      value={newTag}
                      onChange={(e) => setNewTag(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void addTag() } }}
                      placeholder={t('c360TagPlaceholder')}
                      className="h-7 w-32 text-xs"
                      aria-label={t('c360AddTag')}
                    />
                    <Button type="button" size="sm" variant="outline" className="press h-7 gap-1 px-2 text-xs" disabled={tagBusy} onClick={() => void addTag()}>
                      <Plus className="h-3 w-3" /> {t('c360AddTag')}
                    </Button>
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Portal link */}
          <div className="shrink-0 rounded-xl border bg-muted/40 p-3 lg:w-80">
            <p className="text-xs font-semibold text-foreground">{t('c360Portal')}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{t('c360PortalHint')}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <CopyButton value={portalUrl} label={t('c360CopyPortal')} className="h-8" />
              {portalPath && (
                <Button asChild size="sm" variant="ghost" className="press h-8 gap-1 text-xs">
                  <a href={portalPath} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" /> {t('c360OpenPortal')}</a>
                </Button>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label={t('c360StatLtv')} value={formatBDT(ltv)} icon={<Wallet className="h-4 w-4" />} loading={loading} />
        <StatCard label={t('c360StatTx')} value={String(txItems.length)} icon={<Wallet className="h-4 w-4" />} tone="bg-success/10 text-success" loading={loading} />
        <StatCard label={t('c360StatInv')} value={String(invItems.length)} icon={<FileText className="h-4 w-4" />} tone="bg-warning/15 text-amber-600 dark:text-amber-400" loading={loading} />
        <StatCard
          label={t('c360StatSubs')}
          value={String(timeline.filter((i) => i.type === 'subscription').length)}
          icon={<Repeat className="h-4 w-4" />}
          tone="bg-primary/10 text-primary"
          loading={loading}
        />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="timeline">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 sm:w-auto">
          <TabsTrigger value="timeline" className="gap-1.5"><History className="h-3.5 w-3.5" /> {t('c360TabTimeline')}</TabsTrigger>
          <TabsTrigger value="money" className="gap-1.5"><Wallet className="h-3.5 w-3.5" /> {t('c360TabMoney')}</TabsTrigger>
          <TabsTrigger value="comms" className="gap-1.5"><Mail className="h-3.5 w-3.5" /> {t('c360TabComms')}</TabsTrigger>
          <TabsTrigger value="notes" className="gap-1.5"><FileText className="h-3.5 w-3.5" /> {t('c360TabNotes')}</TabsTrigger>
          <TabsTrigger value="risk" className="gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5" /> {t('c360TabRisk')}
            {riskCases.length > 0 && <Badge variant="destructive" className="ml-1 h-4 px-1 text-[10px]">{riskCases.length}</Badge>}
          </TabsTrigger>
        </TabsList>

        {/* ── Timeline ── */}
        <TabsContent value="timeline">
          <Card className="p-4 sm:p-6">
            {timeline.length === 0 ? (
              <EmptyState icon={<History className="h-7 w-7" />} title={t('c360TimelineEmpty')} hint={t('c360TimelineHint')} />
            ) : (
              <div className="relative max-h-[32rem] space-y-0 overflow-y-auto pl-1 nice-scroll">
                {timeline.map((item, i) => {
                  const meta = TIMELINE_META[item.type] ?? TIMELINE_META.activity
                  const Icon = meta.icon
                  return (
                    <div key={`${item.type}-${item.ref ?? i}-${item.at}`} className="relative flex gap-3 pb-4 last:pb-0" style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}>
                      {/* rail */}
                      <div className="flex flex-col items-center">
                        <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full', meta.cls)}>
                          <Icon className="h-4 w-4" />
                        </span>
                        {i < timeline.length - 1 && <span className="mt-1 w-px flex-1 bg-border" />}
                      </div>
                      {/* content */}
                      <div className="min-w-0 flex-1 rounded-lg border bg-card/60 p-3 transition-colors hover:bg-muted/30">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="min-w-0 break-all text-sm font-semibold text-foreground">{item.title}</p>
                          <div className="flex shrink-0 items-center gap-2">
                            {item.amount != null && <span className="text-sm font-bold tabular text-foreground">{formatBDT(item.amount)}</span>}
                            {item.status && <StatusBadge status={item.status} />}
                          </div>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                          <span className="font-medium uppercase tracking-wide">{t(`c360T${item.type.charAt(0)}${item.type.slice(1)}`)}</span>
                          <span title={item.at}>{timeAgo(item.at)}</span>
                          {item.detail && <span className="truncate">{item.detail}</span>}
                          {item.ref && item.ref !== item.title && <span className="font-mono">{item.ref}</span>}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>
        </TabsContent>

        {/* ── Money ── */}
        <TabsContent value="money" className="space-y-4">
          <Card className="p-4 sm:p-6">
            <h3 className="mb-3 text-sm font-bold text-foreground">{t('c360MoneyTx')}</h3>
            {txItems.length === 0 ? (
              <EmptyState icon={<Wallet className="h-6 w-6" />} title={t('c360NoTx')} />
            ) : (
              <div className="max-h-72 overflow-x-auto nice-scroll">
                <table className="w-full min-w-[560px] text-left text-xs">
                  <thead>
                    <tr className="border-b text-[11px] uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pr-3 font-semibold">{t('c360ColTrxId')}</th>
                      <th className="py-2 pr-3 font-semibold">{t('c360ColMethod')}</th>
                      <th className="py-2 pr-3 text-right font-semibold">{t('c360ColAmount')}</th>
                      <th className="py-2 pr-3 font-semibold">{t('c360ColStatus')}</th>
                      <th className="py-2 font-semibold">{t('c360ColDate')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {txItems.map((i, idx) => (
                      <tr key={`${i.ref}-${idx}`} className="border-b last:border-0">
                        <td className="py-2.5 pr-3 font-mono">{i.ref}</td>
                        <td className="py-2.5 pr-3">{i.title.split(' ')[0] && <MfsBadge mfs={i.title.split(' ')[0]} />}</td>
                        <td className="py-2.5 pr-3 text-right font-bold tabular">{formatBDT(i.amount ?? 0)}</td>
                        <td className="py-2.5 pr-3">{i.status && <StatusBadge status={i.status} />}</td>
                        <td className="py-2.5 text-muted-foreground">{formatDateTime(i.at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card className="p-4 sm:p-6">
            <h3 className="mb-3 text-sm font-bold text-foreground">{t('c360MoneyInv')}</h3>
            {invItems.length === 0 ? (
              <EmptyState icon={<FileText className="h-6 w-6" />} title={t('c360NoInv')} />
            ) : (
              <div className="max-h-72 overflow-x-auto nice-scroll">
                <table className="w-full min-w-[560px] text-left text-xs">
                  <thead>
                    <tr className="border-b text-[11px] uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pr-3 font-semibold">{t('c360ColNumber')}</th>
                      <th className="py-2 pr-3 font-semibold">{t('c360ColTitle')}</th>
                      <th className="py-2 pr-3 text-right font-semibold">{t('c360ColAmount')}</th>
                      <th className="py-2 pr-3 font-semibold">{t('c360ColStatus')}</th>
                      <th className="py-2 font-semibold">{t('c360ColDate')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invItems.map((i, idx) => (
                      <tr key={`${i.ref}-${idx}`} className="border-b last:border-0">
                        <td className="py-2.5 pr-3 font-mono font-semibold">{i.ref}</td>
                        <td className="max-w-[16rem] truncate py-2.5 pr-3">{i.title.split(' — ').slice(1).join(' — ') || i.title}</td>
                        <td className="py-2.5 pr-3 text-right font-bold tabular">{formatBDT(i.amount ?? 0)}</td>
                        <td className="py-2.5 pr-3">{i.status && <StatusBadge status={i.status} />}</td>
                        <td className="py-2.5 text-muted-foreground">{formatDateTime(i.at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* ── Comms ── */}
        <TabsContent value="comms" className="space-y-4">
          <Card className="p-4 sm:p-6">
            <h3 className="mb-3 text-sm font-bold text-foreground">{t('c360Emails')}</h3>
            {emailItems.length === 0 ? (
              <EmptyState icon={<Mail className="h-6 w-6" />} title={t('c360NoEmails')} />
            ) : (
              <div className="max-h-72 space-y-2 overflow-y-auto nice-scroll">
                {emailItems.map((i, idx) => (
                  <div key={`${i.ref}-${idx}`} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="min-w-0 break-all text-sm font-semibold text-foreground">{i.title}</p>
                      {i.status && <StatusBadge status={i.status} />}
                    </div>
                    <p className="mt-1 break-all text-[11px] text-muted-foreground">{i.detail} · {formatDateTime(i.at)}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-4 sm:p-6">
            <h3 className="mb-3 text-sm font-bold text-foreground">{t('c360Sms')}</h3>
            {smsItems.length === 0 ? (
              <EmptyState icon={<MessageSquare className="h-6 w-6" />} title={t('c360NoSms')} />
            ) : (
              <div className="max-h-72 space-y-2 overflow-y-auto nice-scroll">
                {smsItems.map((i, idx) => (
                  <div key={`${i.ref}-${idx}`} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-foreground">{i.title}</p>
                      {i.status && <StatusBadge status={i.status} />}
                    </div>
                    <p className="mt-1 break-words text-xs text-muted-foreground">{i.detail}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground/70">{formatDateTime(i.at)}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>

        {/* ── Notes ── */}
        <TabsContent value="notes">
          <Card className="p-4 sm:p-6">
            <h3 className="text-sm font-bold text-foreground">{t('c360NotesTitle')}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">{t('c360NotesHint')}</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t('c360NotePlaceholder')}
                rows={3}
                className="flex-1"
                aria-label={t('c360AddNote')}
              />
              <Button type="button" className="press h-10 gap-1.5 self-end sm:self-auto" disabled={noteBusy} onClick={() => void addNote()}>
                <Plus className="h-4 w-4" /> {t('c360AddNote')}
              </Button>
            </div>
            <div className="mt-4 max-h-80 space-y-2 overflow-y-auto nice-scroll">
              {noteLines.length === 0 ? (
                <EmptyState icon={<FileText className="h-6 w-6" />} title={t('c360NoNotes')} />
              ) : (
                noteLines.map((line, i) => (
                  <div key={i} className="rounded-lg border bg-muted/30 p-3 text-xs leading-relaxed text-foreground">
                    {line}
                  </div>
                ))
              )}
            </div>
          </Card>
        </TabsContent>

        {/* ── Risk ── */}
        <TabsContent value="risk">
          <Card className="p-4 sm:p-6">
            <h3 className="mb-3 text-sm font-bold text-foreground">{t('c360RiskTitle')}</h3>
            {riskCases.length === 0 ? (
              <EmptyState
                icon={<ShieldAlert className="h-6 w-6" />}
                title={t('c360RiskNone')}
                action={(
                  <Button asChild variant="outline" size="sm" className="press gap-1.5">
                    <Link href="/admin/risk">{t('c360OpenRisk')}</Link>
                  </Button>
                )}
              />
            ) : (
              <div className="max-h-80 space-y-2 overflow-y-auto nice-scroll">
                {riskCases.map((c) => (
                  <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                    <div className="min-w-0">
                      <p className="break-all text-xs text-foreground">{c.reason}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{t('c360RiskScore')} {c.score} · {timeAgo(c.createdAt)}</p>
                    </div>
                    <StatusBadge status={c.status} />
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
