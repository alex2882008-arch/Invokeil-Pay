'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  BadgeCheck, Plus, RefreshCw, FileText, UserRound, Building2, TriangleAlert, Clock,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { fetchApi } from '@/lib/api-client'
import { formatDateTime, timeAgo } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useUrlState } from '@/hooks/use-url-state'
import { useLang } from '@/lib/i18n'
import {
  PageHeader, StatCard, EmptyState, ErrorCard,
} from './ui-bits'

// ── Types ────────────────────────────────────────────────────────────────────

interface KycDoc {
  type: string
  name: string
  url: string
  ref: string
}

interface KycProfile {
  id: string
  entityType: string
  legalName: string
  contactEmail: string | null
  contactPhone: string | null
  documents: KycDoc[]
  status: string
  reviewerNote: string | null
  submittedAt: string | null
  reviewedAt: string | null
  expiresAt: string | null
  createdAt: string
  updatedAt: string
}

interface KycData {
  items: KycProfile[]
  counts: { pending: number; submitted: number; verified: number; rejected: number; expired: number }
  expiryReminders: Array<{
    id: string
    legalName: string
    contactEmail: string | null
    contactPhone: string | null
    expiresAt: string | null
  }>
}

const EMPTY_FORM = {
  entityType: 'INDIVIDUAL',
  legalName: '',
  contactEmail: '',
  contactPhone: '',
}
type KycForm = typeof EMPTY_FORM

interface DocRow {
  type: string
  name: string
  url: string
}

const STATUS_BADGE: Record<string, string> = {
  PENDING: 'bg-muted text-muted-foreground border-border',
  SUBMITTED: 'bg-warning/15 text-amber-700 dark:text-amber-400 border-warning/30',
  VERIFIED: 'bg-success/10 text-success border-success/20',
  REJECTED: 'bg-destructive/10 text-destructive border-destructive/25',
  EXPIRED: 'bg-muted text-muted-foreground/70 border-border',
}

const PIPELINE = ['PENDING', 'SUBMITTED', 'VERIFIED'] as const

// ── Component ────────────────────────────────────────────────────────────────

export function KycView() {
  const { t } = useLang()
  const { get, set } = useUrlState()
  const statusFilter = get('status', 'ALL')

  const [data, setData] = useState<KycData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState<KycForm>(EMPTY_FORM)
  const [docRows, setDocRows] = useState<DocRow[]>([])
  const [saving, setSaving] = useState(false)

  // Detail drawer
  const [detail, setDetail] = useState<KycProfile | null>(null)
  const [note, setNote] = useState('')
  const [actionBusy, setActionBusy] = useState<string | null>(null)

  const statusLabel = (s: string) =>
    s === 'PENDING' ? t('kycStatusPending')
      : s === 'SUBMITTED' ? t('kycStatusSubmitted')
      : s === 'VERIFIED' ? t('kycStatusVerified')
      : s === 'REJECTED' ? t('kycStatusRejected')
      : t('kycStatusExpired')

  // ── Data loading ──

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (statusFilter !== 'ALL') params.set('status', statusFilter)
      const res = await fetchApi<KycData>(`/api/admin/kyc?${params}`)
      setData(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => { void load() }, [load])

  const patch = async (p: KycProfile, action: 'submit' | 'verify' | 'reject' | 'expire', withNote = false) => {
    setActionBusy(action)
    try {
      const res = await fetchApi<{ profile: KycProfile }>(`/api/admin/kyc/${p.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...(withNote && note.trim() ? { reviewerNote: note.trim() } : {}) }),
      })
      const toasts: Record<string, string> = {
        submit: t('kycSubmittedToast'),
        verify: t('kycVerifiedToast'),
        reject: t('kycRejectedToast'),
        expire: t('kycExpiredToast'),
      }
      toast.success(toasts[action])
      if (withNote && note.trim()) toast.success(t('kycNoteSavedToast'))
      setDetail(res.profile)
      setNote(res.profile.reviewerNote ?? '')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setActionBusy(null)
    }
  }

  // The reviewer note is persisted together with the next state action (submit/verify/reject),
  // so editing the note never triggers an unintended transition by itself.

  // ── Create ──

  const openCreate = () => {
    setForm(EMPTY_FORM)
    setDocRows([])
    setCreateOpen(true)
  }

  const submitCreate = async () => {
    if (!form.legalName.trim()) { toast.error(t('kycNeedName')); return }
    setSaving(true)
    try {
      await fetchApi('/api/admin/kyc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityType: form.entityType,
          legalName: form.legalName.trim(),
          contactEmail: form.contactEmail.trim() || undefined,
          contactPhone: form.contactPhone.trim() || undefined,
          documents: docRows.filter((d) => d.type.trim() || d.name.trim() || d.url.trim()),
        }),
      })
      toast.success(t('kycCreatedToast'))
      setCreateOpen(false)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setSaving(false)
    }
  }

  const openDetail = (p: KycProfile) => {
    setDetail(p)
    setNote(p.reviewerNote ?? '')
  }

  const actionButtons = (p: KycProfile) => (
    <div className="flex flex-wrap items-center gap-2">
      {(p.status === 'PENDING' || p.status === 'REJECTED' || p.status === 'EXPIRED') && (
        <Button
          className="press gap-1.5 bg-primary text-white hover:bg-primary/90"
          disabled={actionBusy !== null}
          onClick={() => void patch(p, 'submit', true)}
        >
          <Clock className="h-4 w-4" /> {t('kycSubmitBtn')}
        </Button>
      )}
      {p.status === 'SUBMITTED' && (
        <>
          <Button
            className="press gap-1.5 bg-success text-white hover:bg-success/90"
            disabled={actionBusy !== null}
            onClick={() => void patch(p, 'verify', true)}
          >
            <BadgeCheck className="h-4 w-4" /> {t('kycVerifyBtn')}
          </Button>
          <Button
            variant="outline"
            className="press gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={actionBusy !== null}
            onClick={() => void patch(p, 'reject', true)}
          >
            <TriangleAlert className="h-4 w-4" /> {t('kycRejectBtn')}
          </Button>
        </>
      )}
      {p.status === 'VERIFIED' && (
        <Button
          variant="outline"
          className="press gap-1.5"
          disabled={actionBusy !== null}
          onClick={() => void patch(p, 'expire', false)}
        >
          <Clock className="h-4 w-4" /> {t('kycExpireBtn')}
        </Button>
      )}
    </div>
  )

  const statusBadge = (s: string) => (
    <Badge variant="outline" className={cn('font-bold', STATUS_BADGE[s] ?? STATUS_BADGE.PENDING)}>
      {statusLabel(s)}
    </Badge>
  )

  return (
    <div>
      <PageHeader
        title={t('kycTitle')}
        description={t('kycSubtitle')}
        icon={<BadgeCheck className="h-5 w-5" />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={openCreate} className="press gap-1.5">
              <Plus className="h-4 w-4" /> {t('kycNewProfile')}
            </Button>
            <Button variant="outline" size="icon" className="press h-9 w-9" onClick={() => void load()} aria-label={t('refresh')}>
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            </Button>
          </div>
        }
      />

      {/* Expiry reminder banner */}
      {data && data.expiryReminders.length > 0 && (
        <div className="anim-fade-up mb-4 rounded-xl border border-warning/30 bg-warning/5 p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-warning/15 p-2 text-amber-700 dark:text-amber-400">
              <TriangleAlert className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-foreground">
                {t('kycExpiryBanner')} · {data.expiryReminders.length}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">{t('kycExpiryBannerHint')}</p>
              <ul className="mt-2 space-y-1">
                {data.expiryReminders.slice(0, 5).map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-x-2 text-xs">
                    <span className="font-semibold text-foreground">{r.legalName}</span>
                    <span className="text-muted-foreground">
                      — {t('kycExpiresOn')} {r.expiresAt ? formatDateTime(r.expiresAt) : '—'}
                    </span>
                  </li>
                ))}
                {data.expiryReminders.length > 5 && (
                  <li className="text-[11px] text-muted-foreground">+{data.expiryReminders.length - 5}…</li>
                )}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t('kycStatPending')}
          value={data ? String(data.counts.pending) : '—'}
          icon={<Clock className="h-5 w-5" />}
          tone="text-muted-foreground bg-muted"
          loading={!data}
        />
        <StatCard
          label={t('kycStatSubmitted')}
          value={data ? String(data.counts.submitted) : '—'}
          icon={<FileText className="h-5 w-5" />}
          tone="text-warning bg-warning/10"
          loading={!data}
        />
        <StatCard
          label={t('kycStatVerified')}
          value={data ? String(data.counts.verified) : '—'}
          icon={<BadgeCheck className="h-5 w-5" />}
          tone="text-success bg-success/10"
          loading={!data}
        />
        <StatCard
          label={t('kycStatExpiring')}
          value={data ? String(data.expiryReminders.length) : '—'}
          icon={<TriangleAlert className="h-5 w-5" />}
          tone="text-destructive bg-destructive/10"
          loading={!data}
        />
      </div>

      {/* Pipeline chips */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t('kycPipeline')}</span>
        <div className="flex flex-wrap items-center gap-1.5">
          {PIPELINE.map((s, i) => (
            <div key={s} className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => set({ status: statusFilter === s ? null : s })}
                className={cn(
                  'press inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition-colors',
                  statusFilter === s ? 'border-primary/40 bg-primary/10 text-primary' : STATUS_BADGE[s],
                )}
              >
                <span className={cn('h-1.5 w-1.5 rounded-full', s === 'VERIFIED' ? 'bg-success' : s === 'SUBMITTED' ? 'bg-warning' : 'bg-muted-foreground/50')} />
                {statusLabel(s)}
              </button>
              {i < PIPELINE.length - 1 && <span className="text-muted-foreground/50">→</span>}
            </div>
          ))}
          {(['REJECTED', 'EXPIRED'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => set({ status: statusFilter === s ? null : s })}
              className={cn(
                'press inline-flex min-h-[36px] items-center rounded-lg border px-2.5 text-xs font-semibold transition-colors',
                statusFilter === s ? 'border-primary/40 bg-primary/10 text-primary' : STATUS_BADGE[s],
              )}
            >
              {statusLabel(s)}
            </button>
          ))}
          {statusFilter !== 'ALL' && (
            <Button variant="ghost" size="sm" className="press h-8" onClick={() => set({ status: null })}>
              {t('kycClearFilter')}
            </Button>
          )}
        </div>
      </div>

      {error && !data ? (
        <ErrorCard message={error} onRetry={() => void load()} />
      ) : loading && !data ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      ) : !data || data.items.length === 0 ? (
        <Card className="border-dashed p-2 shadow-brand">
          {statusFilter !== 'ALL' ? (
            <EmptyState
              icon={<BadgeCheck className="h-7 w-7" />}
              title={t('kycNoResults')}
              action={
                <Button variant="outline" size="sm" className="press" onClick={() => set({ status: null })}>
                  {t('kycClearFilter')}
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={<BadgeCheck className="h-7 w-7" />}
              title={t('kycEmpty')}
              hint={t('kycEmptyHint')}
              action={
                <Button onClick={openCreate} className="press gap-1.5">
                  <Plus className="h-4 w-4" /> {t('kycNewProfile')}
                </Button>
              }
            />
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
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('kycColEntity')}</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('kycColContact')}</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('kycColDocs')}</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('kycColStatus')}</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('kycColSubmitted')}</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('kycColActions')}</th>
                  </tr>
                </thead>
                <tbody className="stagger">
                  {data.items.map((p, i) => (
                    <tr key={p.id} className="border-b transition-colors last:border-0 hover:bg-muted/40" style={{ animationDelay: `${i * 40}ms` }}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {p.entityType === 'BUSINESS'
                            ? <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                            : <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" />}
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-foreground">{p.legalName}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {p.entityType === 'BUSINESS' ? t('kycEntityBusiness') : t('kycEntityIndividual')}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-foreground/80">
                        <p className="truncate">{p.contactEmail ?? '—'}</p>
                        <p className="truncate text-muted-foreground">{p.contactPhone ?? ''}</p>
                      </td>
                      <td className="tabular px-4 py-3 text-foreground/80">{p.documents.length}</td>
                      <td className="px-4 py-3">{statusBadge(p.status)}</td>
                      <td className="px-4 py-3 text-xs text-foreground/70" title={p.submittedAt ? formatDateTime(p.submittedAt) : undefined}>
                        {p.submittedAt ? timeAgo(p.submittedAt) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="outline" size="sm" className="press h-8" onClick={() => openDetail(p)}>
                          {t('kycViewDetails')}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Mobile cards */}
          <div className="stagger space-y-3 md:hidden">
            {data.items.map((p, i) => (
              <Card key={p.id} className="hover-lift p-4 shadow-brand" style={{ animationDelay: `${i * 40}ms` }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    {p.entityType === 'BUSINESS'
                      ? <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                      : <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" />}
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-foreground">{p.legalName}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{p.contactEmail ?? p.contactPhone ?? '—'}</p>
                    </div>
                  </div>
                  {statusBadge(p.status)}
                </div>
                <div className="mt-3 flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
                  <span>{p.documents.length} {t('kycColDocs').toLowerCase()}</span>
                  <span title={p.submittedAt ? formatDateTime(p.submittedAt) : undefined}>
                    {p.submittedAt ? timeAgo(p.submittedAt) : '—'}
                  </span>
                  <Button variant="outline" size="sm" className="press h-8" onClick={() => openDetail(p)}>
                    {t('kycViewDetails')}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="nice-scroll max-h-[92vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('kycCreateTitle')}</DialogTitle>
            <DialogDescription className="sr-only">{t('kycCreateDesc')}</DialogDescription>
          </DialogHeader>
          <p className="text-xs leading-relaxed text-muted-foreground">{t('kycCreateDesc')}</p>

          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label>{t('kycEntityType')}</Label>
              <Select value={form.entityType} onValueChange={(v) => setForm({ ...form, entityType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="INDIVIDUAL">{t('kycEntityIndividual')}</SelectItem>
                  <SelectItem value="BUSINESS">{t('kycEntityBusiness')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="kyc-legal-name">{t('kycLegalName')} *</Label>
              <Input
                id="kyc-legal-name"
                value={form.legalName}
                onChange={(e) => setForm({ ...form, legalName: e.target.value })}
                placeholder={t('kycLegalNamePh')}
                autoFocus
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="kyc-email">{t('kycContactEmail')}</Label>
                <Input
                  id="kyc-email" type="email"
                  value={form.contactEmail}
                  onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="kyc-phone">{t('kycContactPhone')}</Label>
                <Input
                  id="kyc-phone" inputMode="tel"
                  value={form.contactPhone}
                  onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
                />
              </div>
            </div>

            <Separator />

            <div className="grid gap-2">
              <Label>{t('kycDocuments')}</Label>
              {docRows.map((d, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                  <Input
                    value={d.type}
                    onChange={(e) => setDocRows(docRows.map((r, j) => j === i ? { ...r, type: e.target.value } : r))}
                    placeholder={t('kycDocTypePh')}
                    aria-label={t('kycDocType')}
                    className="h-9"
                  />
                  <Input
                    value={d.url}
                    onChange={(e) => setDocRows(docRows.map((r, j) => j === i ? { ...r, url: e.target.value } : r))}
                    placeholder={t('kycDocUrl')}
                    aria-label={t('kycDocUrl')}
                    className="h-9 font-mono text-xs"
                  />
                  <Button
                    variant="ghost" size="icon"
                    className="press h-9 w-9 text-destructive hover:text-destructive"
                    aria-label={t('delete')}
                    onClick={() => setDocRows(docRows.filter((_, j) => j !== i))}
                  >
                    ×
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" className="press h-9 w-fit gap-1.5" onClick={() => setDocRows([...docRows, { type: '', name: '', url: '' }])}>
                <Plus className="h-3.5 w-3.5" /> {t('kycAddDoc')}
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>{t('cancel')}</Button>
            <Button className="press" onClick={() => void submitCreate()} disabled={saving}>
              {t('create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail drawer */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="nice-scroll max-h-[92vh] overflow-y-auto sm:max-w-lg">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2">
                  {detail.legalName}
                  {statusBadge(detail.status)}
                </DialogTitle>
                <DialogDescription className="sr-only">{t('kycDetailsTitle')}</DialogDescription>
              </DialogHeader>

              <div className="grid gap-4">
                <div className="flex items-center gap-2 rounded-xl border bg-muted/40 p-3">
                  {detail.entityType === 'BUSINESS'
                    ? <Building2 className="h-4 w-4 text-muted-foreground" />
                    : <UserRound className="h-4 w-4 text-muted-foreground" />}
                  <div className="text-xs">
                    <p className="font-semibold text-foreground">
                      {detail.entityType === 'BUSINESS' ? t('kycEntityBusiness') : t('kycEntityIndividual')}
                    </p>
                    <p className="text-muted-foreground">{detail.contactEmail ?? '—'} · {detail.contactPhone ?? '—'}</p>
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('kycDocList')}</p>
                  {detail.documents.length === 0 ? (
                    <p className="rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">{t('kycNoDocs')}</p>
                  ) : (
                    <ul className="stagger space-y-2">
                      {detail.documents.map((d, i) => (
                        <li key={i} className="flex items-start justify-between gap-2 rounded-xl border p-3" style={{ animationDelay: `${i * 40}ms` }}>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-foreground">{d.type || d.name || '—'}</p>
                            {d.name && d.type && <p className="truncate text-xs text-muted-foreground">{d.name}</p>}
                            {d.url && (
                              <a href={d.url} target="_blank" rel="noopener noreferrer" className="mt-0.5 inline-flex items-center gap-1 truncate text-[11px] font-semibold text-primary hover:underline">
                                {d.url}
                              </a>
                            )}
                          </div>
                          {d.ref && <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{d.ref}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 rounded-xl border p-3 text-xs">
                  <div>
                    <p className="text-muted-foreground">{t('kycCreated')}</p>
                    <p className="font-semibold text-foreground">{formatDateTime(detail.createdAt)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">{t('kycSubmittedAt')}</p>
                    <p className="font-semibold text-foreground">{detail.submittedAt ? formatDateTime(detail.submittedAt) : '—'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">{t('kycReviewedAt')}</p>
                    <p className="font-semibold text-foreground">{detail.reviewedAt ? formatDateTime(detail.reviewedAt) : '—'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">{t('kycExpiresAt')}</p>
                    <p className="font-semibold text-foreground">{detail.expiresAt ? formatDateTime(detail.expiresAt) : '—'}</p>
                  </div>
                </div>

                <div className="grid gap-1.5">
                  <Label htmlFor="kyc-note">{t('kycReviewerNote')}</Label>
                  <Textarea
                    id="kyc-note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={t('kycReviewerNotePh')}
                    rows={3}
                    disabled={detail.status === 'VERIFIED' || detail.status === 'EXPIRED'}
                  />
                  {detail.status !== 'VERIFIED' && detail.status !== 'EXPIRED' && (
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      {detail.status === 'SUBMITTED' ? t('kycVerifyHint') : t('kycReviewerNotePh')}
                    </p>
                  )}
                </div>

                <div className="border-t pt-3">
                  {actionButtons(detail)}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
