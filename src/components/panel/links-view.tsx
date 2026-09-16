'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Link2, Plus, Copy, ExternalLink, Power, Pencil, Trash2, Infinity as InfinityIcon, CalendarClock,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { Card } from '@/components/ui/card'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { fetchApi } from '@/lib/api-client'
import { formatBDT, formatDateTime } from '@/lib/format'
import { GATEWAY_CATALOG } from '@/lib/gateways'
import { cn } from '@/lib/utils'
import { useUrlState } from '@/hooks/use-url-state'
import { useLang } from '@/lib/i18n'
import {
  PageHeader, StatCard, EmptyState, ErrorCard, Pagination, SearchInput, CopyButton,
} from './ui-bits'

// ── Types ────────────────────────────────────────────────────────────────────

interface LinkRow {
  id: string
  slug: string
  title: string
  description: string | null
  amountType: string
  amount: number
  minAmount: number | null
  maxAmount: number | null
  currency: string
  gatewayCode: string | null
  customFields: string | null
  usageLimit: number | null
  usedCount: number
  expiresAt: string | null
  successUrl: string | null
  cancelUrl: string | null
  status: string
  createdAt: string
  updatedAt: string
}

interface ListData {
  links: LinkRow[]
  total: number
  page: number
  pages: number
}

interface SummaryData {
  summary: { active: number; collected: number; uses: number }
}

interface FieldRow {
  name: string
  label: string
  required: boolean
}

interface LinkForm {
  title: string
  slug: string
  description: string
  amountType: 'FIXED' | 'VARIABLE'
  amount: string
  minAmount: string
  maxAmount: string
  gatewayCode: string
  fields: FieldRow[]
  usageLimit: string
  expiresAt: string
  successUrl: string
  cancelUrl: string
  active: boolean
}

function isListData(d: unknown): d is ListData {
  if (!d || typeof d !== 'object') return false
  const o = d as Partial<ListData>
  return Array.isArray(o.links) && typeof o.total === 'number' && typeof o.page === 'number' && typeof o.pages === 'number'
}

function isSummaryData(d: unknown): d is SummaryData {
  if (!d || typeof d !== 'object') return false
  const s = (d as Partial<SummaryData>).summary
  return !!s && typeof s.active === 'number' && typeof s.collected === 'number' && typeof s.uses === 'number'
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function slugifyClient(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '')
}

function toLocalInput(d: Date | null): string {
  if (!d || isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

function isHttpUrl(v: string): boolean {
  try {
    return new URL(v).protocol.startsWith('http')
  } catch {
    return false
  }
}

const EMPTY_FORM: LinkForm = {
  title: '',
  slug: '',
  description: '',
  amountType: 'FIXED',
  amount: '',
  minAmount: '',
  maxAmount: '',
  gatewayCode: '',
  fields: [],
  usageLimit: '',
  expiresAt: '',
  successUrl: '',
  cancelUrl: '',
  active: true,
}

// ── View ─────────────────────────────────────────────────────────────────────

export function LinksView() {
  const { t } = useLang()
  const { get, getNum, set } = useUrlState()

  const q = get('q')
  const status = get('status', 'ALL')
  const page = getNum('page', 1)

  const [data, setData] = useState<ListData | null>(null)
  const [summary, setSummary] = useState<SummaryData['summary'] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<LinkRow | null>(null)
  const [form, setForm] = useState<LinkForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const slugTouched = useRef(false)

  // delete state
  const [deleting, setDeleting] = useState<LinkRow | null>(null)
  const [deletingBusy, setDeletingBusy] = useState(false)

  const loadList = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(page) })
      if (q) params.set('q', q)
      if (status && status !== 'ALL') params.set('status', status)
      const d = await fetchApi<unknown>(`/api/admin/links?${params.toString()}`)
      if (!isListData(d)) throw new Error('Unexpected response from server')
      setError(null)
      setData(d)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [page, q, status])

  const loadSummary = useCallback(async () => {
    try {
      const d = await fetchApi<unknown>('/api/admin/links?summary=1')
      if (isSummaryData(d)) setSummary(d.summary)
    } catch { /* stat cards stay stale — non-fatal */ }
  }, [])

  useEffect(() => {
    loadList()
  }, [loadList])

  useEffect(() => {
    loadSummary()
  }, [loadSummary])

  // ── Form helpers ──

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    slugTouched.current = false
    setDialogOpen(true)
  }

  const openEdit = (link: LinkRow) => {
    setEditing(link)
    setForm({
      title: link.title,
      slug: link.slug,
      description: link.description ?? '',
      amountType: link.amountType === 'VARIABLE' ? 'VARIABLE' : 'FIXED',
      amount: link.amount ? String(link.amount) : '',
      minAmount: link.minAmount != null ? String(link.minAmount) : '',
      maxAmount: link.maxAmount != null ? String(link.maxAmount) : '',
      gatewayCode: link.gatewayCode ?? '',
      fields: (() => {
        try {
          const parsed = link.customFields ? (JSON.parse(link.customFields) as FieldRow[]) : []
          return Array.isArray(parsed)
            ? parsed.map((f) => ({ name: String(f.name ?? ''), label: String(f.label ?? ''), required: !!f.required }))
            : []
        } catch {
          return []
        }
      })(),
      usageLimit: link.usageLimit != null ? String(link.usageLimit) : '',
      expiresAt: toLocalInput(link.expiresAt ? new Date(link.expiresAt) : null),
      successUrl: link.successUrl ?? '',
      cancelUrl: link.cancelUrl ?? '',
      active: link.status === 'ACTIVE',
    })
    slugTouched.current = true
    setDialogOpen(true)
  }

  const patchForm = (patch: Partial<LinkForm>) => setForm((f) => ({ ...f, ...patch }))

  const onTitleChange = (title: string) => {
    if (!slugTouched.current) {
      setForm((f) => ({ ...f, title, slug: slugifyClient(title) }))
    } else {
      patchForm({ title })
    }
  }

  const onSlugChange = (slug: string) => {
    slugTouched.current = true
    patchForm({ slug })
  }

  const validate = (): string | null => {
    if (!form.title.trim()) return t('errTitleRequired')
    if (!form.slug.trim()) return t('errSlugRequired')
    if (form.amountType === 'FIXED') {
      const a = Number(form.amount)
      if (!Number.isFinite(a) || a <= 0) return t('errAmountInvalid')
    } else {
      const min = Number(form.minAmount)
      const max = Number(form.maxAmount)
      if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max < min) return t('errMinMax')
    }
    if (form.successUrl.trim() && !isHttpUrl(form.successUrl.trim())) return t('errUrlInvalid')
    if (form.cancelUrl.trim() && !isHttpUrl(form.cancelUrl.trim())) return t('errUrlInvalid')
    if (form.usageLimit) {
      const n = Number(form.usageLimit)
      if (!Number.isFinite(n) || n < 1) return t('errUsageLimit')
    }
    return null
  }

  const submit = async () => {
    const err = validate()
    if (err) {
      toast.error(err)
      return
    }
    setSaving(true)
    const payload = {
      title: form.title.trim(),
      slug: form.slug.trim(),
      description: form.description.trim() || null,
      amountType: form.amountType,
      amount: form.amountType === 'FIXED' ? Number(form.amount) : 0,
      minAmount: form.amountType === 'VARIABLE' ? Number(form.minAmount) : null,
      maxAmount: form.amountType === 'VARIABLE' ? Number(form.maxAmount) : null,
      gatewayCode: form.gatewayCode || null,
      customFields: form.fields
        .filter((f) => f.name.trim() && f.label.trim())
        .map((f) => ({ name: f.name.trim(), label: f.label.trim(), required: f.required })),
      usageLimit: form.usageLimit ? Number(form.usageLimit) : null,
      expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
      successUrl: form.successUrl.trim() || null,
      cancelUrl: form.cancelUrl.trim() || null,
      status: form.active ? 'ACTIVE' : 'DISABLED',
    }
    try {
      if (editing) {
        await fetchApi(`/api/admin/links/${editing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        toast.success(t('linkUpdated'))
      } else {
        await fetchApi('/api/admin/links', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        toast.success(t('linkCreated'))
      }
      setDialogOpen(false)
      await Promise.all([loadList(), loadSummary()])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setSaving(false)
    }
  }

  const toggleStatus = async (link: LinkRow) => {
    const next = link.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE'
    try {
      await fetchApi(`/api/admin/links/${link.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      })
      toast.success(next === 'ACTIVE' ? t('linkEnabledToast') : t('linkDisabledToast'))
      await Promise.all([loadList(), loadSummary()])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Request failed')
    }
  }

  const remove = async () => {
    if (!deleting) return
    setDeletingBusy(true)
    try {
      await fetchApi(`/api/admin/links/${deleting.id}`, { method: 'DELETE' })
      toast.success(t('linkDeleted'))
      setDeleting(null)
      const lastPage = data && data.pages > 1 && data.links.length === 1 ? data.pages - 1 : page
      if (lastPage !== page) set({ page: lastPage })
      else await Promise.all([loadList(), loadSummary()])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setDeletingBusy(false)
    }
  }

  const publicUrl = (slug: string) => `${typeof window !== 'undefined' ? window.location.origin : ''}/link/${slug}`

  const amountText = (link: LinkRow): string => {
    if (link.amountType === 'FIXED') return formatBDT(link.amount)
    const min = formatBDT(link.minAmount ?? 0)
    return link.maxAmount != null ? `${min} – ${formatBDT(link.maxAmount)}` : `≥ ${min}`
  }

  const gatewayName = useMemo(() => {
    const map = new Map(GATEWAY_CATALOG.map((g) => [g.code, g.name]))
    return (code?: string | null) => (code ? map.get(code) ?? code : null)
  }, [])

  const groupedGateways = useMemo(() => {
    const pick = (cat: string) => GATEWAY_CATALOG.filter((g) => g.category === cat)
    return [
      { label: 'Mobile Financial Services', items: pick('MFS') },
      { label: 'Bank', items: pick('BANK') },
      { label: 'Global', items: pick('GLOBAL') },
    ].filter((g) => g.items.length > 0)
  }, [])

  const statusBadge = (s: string) => {
    const active = s === 'ACTIVE'
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-semibold',
          active ? 'border-success/20 bg-success/10 text-success' : 'border-border bg-muted text-muted-foreground'
        )}
      >
        <span className={cn('h-1.5 w-1.5 rounded-full', active ? 'live-dot bg-success' : 'bg-muted-foreground/50')} />
        {active ? 'Active' : 'Disabled'}
      </span>
    )
  }

  const expiryText = (link: LinkRow) => {
    if (!link.expiresAt) return <span className="text-muted-foreground/60">{t('neverExpiresShort')}</span>
    const expired = new Date(link.expiresAt) < new Date()
    return (
      <span className={cn('inline-flex items-center gap-1', expired && link.status === 'ACTIVE' ? 'font-semibold text-destructive' : '')}>
        <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
        {formatDateTime(link.expiresAt)}
      </span>
    )
  }

  const actionButtons = (link: LinkRow) => (
    <div className="flex items-center gap-1">
      <CopyButton value={publicUrl(link.slug)} compact className="px-1.5" />
      <Button
        variant="ghost" size="icon" className="press h-7 w-7"
        title={t('openPublicPage')} aria-label={t('openPublicPage')}
        onClick={() => window.open(`/link/${link.slug}`, '_blank', 'noopener')}
      >
        <ExternalLink className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost" size="icon" className="press h-7 w-7"
        title={link.status === 'ACTIVE' ? t('disableLink') : t('enableLink')}
        aria-label={link.status === 'ACTIVE' ? t('disableLink') : t('enableLink')}
        onClick={() => toggleStatus(link)}
      >
        <Power className={cn('h-3.5 w-3.5', link.status === 'ACTIVE' ? 'text-success' : 'text-muted-foreground')} />
      </Button>
      <Button variant="ghost" size="icon" className="press h-7 w-7" title={t('edit')} aria-label={t('edit')} onClick={() => openEdit(link)}>
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost" size="icon" className="press h-7 w-7 text-destructive hover:text-destructive"
        title={t('delete')} aria-label={t('delete')} onClick={() => setDeleting(link)}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  )

  // ── Render ──

  return (
    <div>
      <PageHeader
        title={t('paymentLinks')}
        description={t('linksDescription')}
        icon={<Link2 className="h-5 w-5" />}
        actions={
          <Button onClick={openCreate} className="press gap-1.5">
            <Plus className="h-4 w-4" /> {t('newLink')}
          </Button>
        }
      />

      {/* Stat cards */}
      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label={t('activeLinks')}
          value={summary ? String(summary.active) : '—'}
          icon={<Link2 className="h-5 w-5" />}
          tone="text-primary bg-primary/10"
          loading={!summary}
        />
        <StatCard
          label={t('collectedViaLinks')}
          value={summary ? formatBDT(summary.collected) : '—'}
          icon={<Power className="h-5 w-5" />}
          tone="text-success bg-success/10"
          loading={!summary}
        />
        <StatCard
          label={t('totalUses')}
          value={summary ? String(summary.uses) : '—'}
          icon={<InfinityIcon className="h-5 w-5" />}
          tone="text-warning bg-warning/10"
          loading={!summary}
        />
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchInput paramKey="q" placeholder={t('searchLinks')} className="sm:max-w-xs" />
        <Select
          value={status}
          onValueChange={(v) => set({ status: v === 'ALL' ? null : v, page: 1 })}
        >
          <SelectTrigger className="h-9 w-full sm:w-44" aria-label={t('status')}>
            <SelectValue placeholder={t('status')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('all')}</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="DISABLED">Disabled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Content */}
      {error && !data ? (
        <ErrorCard message={error} onRetry={() => { setLoading(true); loadList() }} />
      ) : loading && !data ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      ) : !data || data.links.length === 0 ? (
        <Card className="border-dashed p-2 shadow-brand">
          {q || status !== 'ALL' ? (
            <EmptyState
              icon={<Link2 className="h-7 w-7" />}
              title={t('noResults')}
              action={
                <Button variant="outline" size="sm" className="press" onClick={() => set({ q: null, status: null, page: 1 })}>
                  {t('clearFilters')}
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={<Link2 className="h-7 w-7" />}
              title={t('noLinksTitle')}
              hint={t('noLinksHint')}
              action={
                <Button onClick={openCreate} className="press gap-1.5">
                  <Plus className="h-4 w-4" /> {t('noLinksCta')}
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
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('linkCol')}</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('amountCol')}</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('usesCol')}</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('status')}</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('expiresAtLabel')}</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('actions')}</th>
                  </tr>
                </thead>
                <tbody className="stagger">
                  {data.links.map((link) => (
                    <tr key={link.id} className="border-b transition-colors last:border-0 hover:bg-muted/40">
                      <td className="max-w-xs px-4 py-3">
                        <p className="truncate font-semibold text-foreground">{link.title}</p>
                        <p className="truncate font-mono text-xs text-muted-foreground">/link/{link.slug}</p>
                        {gatewayName(link.gatewayCode) && (
                          <p className="mt-0.5 text-[11px] text-muted-foreground/70">{gatewayName(link.gatewayCode)}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="tabular font-semibold text-foreground">{amountText(link)}</p>
                        {link.amountType === 'VARIABLE' && (
                          <p className="text-[11px] text-muted-foreground">{t('variableLabel')}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 tabular text-foreground">
                        {link.usedCount}
                        <span className="text-muted-foreground">
                          {' / '}
                          {link.usageLimit ?? '∞'}
                        </span>
                      </td>
                      <td className="px-4 py-3">{statusBadge(link.status)}</td>
                      <td className="px-4 py-3 text-xs text-foreground/80">{expiryText(link)}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end">{actionButtons(link)}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Mobile cards */}
          <div className="stagger space-y-3 md:hidden">
            {data.links.map((link) => (
              <Card key={link.id} className="hover-lift p-4 shadow-brand">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-foreground">{link.title}</p>
                    <p className="truncate font-mono text-xs text-muted-foreground">/link/{link.slug}</p>
                  </div>
                  {statusBadge(link.status)}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-muted-foreground">{t('amountCol')}</p>
                    <p className="tabular font-semibold text-foreground">{amountText(link)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">{t('usesCol')}</p>
                    <p className="tabular font-semibold text-foreground">
                      {link.usedCount} / {link.usageLimit ?? '∞'}
                    </p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-muted-foreground">{t('expiresAtLabel')}</p>
                    <p className="text-foreground/80">{expiryText(link)}</p>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between border-t pt-3">
                  <CopyButton value={publicUrl(link.slug)} compact label={t('copyPublicUrl')} />
                  {actionButtons(link)}
                </div>
              </Card>
            ))}
          </div>

          <Pagination page={data.page} pages={data.pages} total={data.total} />
        </>
      )}

      {/* Create / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="nice-scroll max-h-[92vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? t('editLinkTitle') : t('createLinkTitle')}</DialogTitle>
            <DialogDescription className="sr-only">{t('linksDescription')}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="link-title">{t('linkTitle')} *</Label>
              <Input
                id="link-title"
                value={form.title}
                onChange={(e) => onTitleChange(e.target.value)}
                placeholder={t('linkTitlePh')}
                autoFocus
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="link-slug">{t('slugLabel')}</Label>
              <div className="flex items-center gap-2">
                <span className="shrink-0 font-mono text-xs text-muted-foreground">/link/</span>
                <Input
                  id="link-slug"
                  value={form.slug}
                  onChange={(e) => onSlugChange(e.target.value)}
                  className="font-mono"
                  placeholder="my-awesome-link"
                />
              </div>
              <p className="text-[11px] text-muted-foreground">{t('slugHint').replace('{slug}', form.slug || '…')}</p>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="link-desc">{t('linkDescription')}</Label>
              <Textarea
                id="link-desc"
                value={form.description}
                onChange={(e) => patchForm({ description: e.target.value })}
                placeholder={t('linkDescriptionPh')}
                rows={2}
              />
            </div>

            <div className="grid gap-1.5">
              <Label>{t('amountType')}</Label>
              <RadioGroup
                value={form.amountType}
                onValueChange={(v) => patchForm({ amountType: v as LinkForm['amountType'] })}
                className="grid grid-cols-2 gap-2"
              >
                {(['FIXED', 'VARIABLE'] as const).map((mode) => (
                  <Label
                    key={mode}
                    htmlFor={`amt-${mode}`}
                    className={cn(
                      'press flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition-colors',
                      form.amountType === mode ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                    )}
                  >
                    <RadioGroupItem id={`amt-${mode}`} value={mode} className="mt-0.5" />
                    <span className="block">
                      <span className="block text-sm font-semibold text-foreground">
                        {mode === 'FIXED' ? t('fixedAmount') : t('variableAmount')}
                      </span>
                      <span className="mt-0.5 block text-[11px] font-normal leading-snug text-muted-foreground">
                        {mode === 'FIXED' ? t('fixedAmountHint') : t('variableAmountHint')}
                      </span>
                    </span>
                  </Label>
                ))}
              </RadioGroup>
            </div>

            {form.amountType === 'FIXED' ? (
              <div className="grid gap-1.5">
                <Label htmlFor="link-amount">{t('amountLabel')} *</Label>
                <Input
                  id="link-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={form.amount}
                  onChange={(e) => patchForm({ amount: e.target.value })}
                  placeholder="500.00"
                  className="tabular"
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="link-min">{t('minAmount')} *</Label>
                  <Input
                    id="link-min"
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={form.minAmount}
                    onChange={(e) => patchForm({ minAmount: e.target.value })}
                    placeholder="50"
                    className="tabular"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="link-max">{t('maxAmount')} *</Label>
                  <Input
                    id="link-max"
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={form.maxAmount}
                    onChange={(e) => patchForm({ maxAmount: e.target.value })}
                    placeholder="1000"
                    className="tabular"
                  />
                </div>
              </div>
            )}

            <div className="grid gap-1.5">
              <Label>{t('preferredGateway')}</Label>
              <Select value={form.gatewayCode || 'ANY'} onValueChange={(v) => patchForm({ gatewayCode: v === 'ANY' ? '' : v })}>
                <SelectTrigger aria-label={t('preferredGateway')}>
                  <SelectValue placeholder={t('anyGateway')} />
                </SelectTrigger>
                <SelectContent className="nice-scroll max-h-72">
                  <SelectItem value="ANY">{t('anyGateway')}</SelectItem>
                  {groupedGateways.map((group) => (
                    <SelectGroup key={group.label}>
                      <SelectLabel>{group.label}</SelectLabel>
                      {group.items.map((g) => (
                        <SelectItem key={g.code} value={g.code}>
                          {g.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Custom fields builder */}
            <div className="grid gap-1.5">
              <div className="flex items-center justify-between">
                <Label>{t('customFieldsLabel')}</Label>
                <Button
                  type="button" variant="outline" size="sm"
                  className="press h-7 gap-1 text-xs"
                  onClick={() => patchForm({ fields: [...form.fields, { name: '', label: '', required: false }] })}
                  disabled={form.fields.length >= 10}
                >
                  <Plus className="h-3 w-3" /> {t('addField')}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">{t('customFieldsHint')}</p>
              {form.fields.length === 0 ? (
                <p className="rounded-lg border border-dashed px-3 py-2 text-center text-xs text-muted-foreground/60">
                  {t('noCustomFields')}
                </p>
              ) : (
                <div className="space-y-2">
                  {form.fields.map((f, i) => (
                    <div key={i} className="rounded-lg border p-2.5">
                      <div className="flex items-center gap-2">
                        <Input
                          value={f.name}
                          onChange={(e) => {
                            const fields = [...form.fields]
                            fields[i] = { ...f, name: e.target.value }
                            patchForm({ fields })
                          }}
                          placeholder={t('fieldName')}
                          className="h-8 font-mono text-xs"
                          aria-label={t('fieldName')}
                        />
                        <Input
                          value={f.label}
                          onChange={(e) => {
                            const fields = [...form.fields]
                            fields[i] = { ...f, label: e.target.value }
                            patchForm({ fields })
                          }}
                          placeholder={t('fieldDisplayLabel')}
                          className="h-8 text-xs"
                          aria-label={t('fieldDisplayLabel')}
                        />
                        <Button
                          type="button" variant="ghost" size="icon"
                          className="press h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                          aria-label={t('delete')}
                          onClick={() => patchForm({ fields: form.fields.filter((_, j) => j !== i) })}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <Checkbox
                          id={`field-req-${i}`}
                          checked={f.required}
                          onCheckedChange={(v) => {
                            const fields = [...form.fields]
                            fields[i] = { ...f, required: v === true }
                            patchForm({ fields })
                          }}
                        />
                        <Label htmlFor={`field-req-${i}`} className="cursor-pointer text-xs font-normal text-muted-foreground">
                          {t('fieldRequiredCk')}
                        </Label>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="link-limit">{t('usageLimitLabel')}</Label>
                <Input
                  id="link-limit"
                  type="number"
                  min="1"
                  inputMode="numeric"
                  value={form.usageLimit}
                  onChange={(e) => patchForm({ usageLimit: e.target.value })}
                  placeholder={t('unlimitedShort')}
                  className="tabular"
                />
                <p className="text-[11px] text-muted-foreground">{t('usageLimitHint')}</p>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="link-expiry">{t('expiresAtLabel')}</Label>
                <Input
                  id="link-expiry"
                  type="datetime-local"
                  value={form.expiresAt}
                  onChange={(e) => patchForm({ expiresAt: e.target.value })}
                />
                <p className="text-[11px] text-muted-foreground">{t('neverExpires')}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="link-success">{t('successUrlLabel')}</Label>
                <Input
                  id="link-success"
                  value={form.successUrl}
                  onChange={(e) => patchForm({ successUrl: e.target.value })}
                  placeholder={t('urlPh')}
                  className="text-xs"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="link-cancel">{t('cancelUrlLabel')}</Label>
                <Input
                  id="link-cancel"
                  value={form.cancelUrl}
                  onChange={(e) => patchForm({ cancelUrl: e.target.value })}
                  placeholder={t('urlPh')}
                  className="text-xs"
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl border p-3">
              <div>
                <p className="text-sm font-semibold text-foreground">{t('linkActiveLabel')}</p>
                <p className="text-[11px] text-muted-foreground">
                  {form.active ? t('enabled') : t('disabled')}
                </p>
              </div>
              <Switch checked={form.active} onCheckedChange={(v) => patchForm({ active: v })} aria-label={t('linkActiveLabel')} />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" className="press" onClick={() => setDialogOpen(false)} disabled={saving}>
              {t('cancel')}
            </Button>
            <Button className="press" onClick={submit} disabled={saving}>
              {saving ? t('saving') : editing ? t('saveChanges') : t('create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteLinkTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting ? `“${deleting.title}” — /link/${deleting.slug}` : ''}. {t('deleteLinkHint')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="press">{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="press bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); remove() }}
              disabled={deletingBusy}
            >
              {deletingBusy ? t('loading') : t('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
