'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader, EmptyState, ErrorCard, SearchInput } from './ui-bits'
import { useLang } from '@/lib/i18n'
import { BRD_EN, BRD_BN } from '@/lib/i18n/brands'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { formatBDT } from '@/lib/format'
import {
  Palette, Plus, Pencil, Trash2, Globe, Mail, Phone, Wallet, Search, Save,
  Landmark, Users, ReceiptText, ShoppingCart,
} from 'lucide-react'

// ── i18n helper ──────────────────────────────────────────────────────────────

function useBrdT() {
  const { t, lang } = useLang()
  return useCallback((k: string) => {
    const v = t(k)
    if (v && v !== k) return v
    return (lang === 'bn' ? BRD_BN[k] : BRD_EN[k]) ?? BRD_EN[k] ?? k
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

// ── types ────────────────────────────────────────────────────────────────────

type BrandGateway = {
  gatewayCode: string
  enabled: boolean
  accountNumber: string | null
  instructions: string | null
  chargeFixed: number
  chargePercent: number
}

type Brand = {
  id: string
  name: string
  slug: string
  color: string
  domain: string | null
  supportEmail: string | null
  supportPhone: string | null
  emailFromName: string | null
  currency: string
  locale: string
  active: boolean
  gatewayConfigs: BrandGateway[]
  counts: { customers: number; checkouts: number; invoices: number }
}

type Gateway = {
  id: string
  code: string
  name: string
  mfs: string
  category: string
  accountType: string
  color: string
  enabled: boolean
  accountNumber: string | null
  instructions: string | null
  chargeFixed: number
  chargePercent: number
}

type BrandForm = {
  name: string
  color: string
  domain: string
  supportEmail: string
  supportPhone: string
  currency: string
  active: boolean
}

type GatewayDraft = { enabled: boolean; accountNumber: string; instructions: string; chargeFixed: string; chargePercent: string }

const EMPTY_FORM: BrandForm = { name: '', color: '#2563EB', domain: '', supportEmail: '', supportPhone: '', currency: 'BDT', active: true }

// ── main view ────────────────────────────────────────────────────────────────

export function BrandsView() {
  const t = useBrdT()
  const [brands, setBrands] = useState<Brand[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // brand dialog
  const [brandDialog, setBrandDialog] = useState(false)
  const [editing, setEditing] = useState<Brand | null>(null)
  const [form, setForm] = useState<BrandForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  // gateway manager
  const [gwBrand, setGwBrand] = useState<Brand | null>(null)
  const [gateways, setGateways] = useState<Gateway[] | null>(null)
  const [gwLoading, setGwLoading] = useState(false)
  const [gwError, setGwError] = useState<string | null>(null)
  const [gwDrafts, setGwDrafts] = useState<Record<string, GatewayDraft>>({})
  const [gwSavingCode, setGwSavingCode] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setError(null)
      const d = await getJSON<{ items: Brand[] }>('/api/admin/brands')
      setBrands(d.items)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setBrandDialog(true)
  }

  function openEdit(b: Brand) {
    setEditing(b)
    setForm({
      name: b.name,
      color: b.color,
      domain: b.domain ?? '',
      supportEmail: b.supportEmail ?? '',
      supportPhone: b.supportPhone ?? '',
      currency: b.currency,
      active: b.active,
    })
    setBrandDialog(true)
  }

  async function saveBrand() {
    if (!form.name.trim()) {
      toast.error(t('brdNameRequired'))
      return
    }
    setSaving(true)
    try {
      if (editing) {
        await sendJSON(`/api/admin/brands/${editing.id}`, form, 'PATCH')
        toast.success(t('brdSaved'))
      } else {
        await sendJSON('/api/admin/brands', form)
        toast.success(t('brdCreated'))
      }
      setBrandDialog(false)
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('brdSaveFail'))
    } finally {
      setSaving(false)
    }
  }

  async function deleteBrand(id: string) {
    try {
      await sendJSON(`/api/admin/brands/${id}`, undefined, 'DELETE')
      toast.success(t('brdDeleted'))
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('brdSaveFail'))
    }
  }

  // ── gateway manager ──
  async function openGatewayManager(b: Brand) {
    setGwBrand(b)
    setGwLoading(true)
    setGwError(null)
    setGateways(null)
    try {
      const res = await fetch('/api/admin/gateways', { cache: 'no-store' })
      const j = (await res.json().catch(() => ({}))) as { gateways?: Gateway[]; error?: string }
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      const list = j.gateways ?? []
      setGateways(list)
      // Seed drafts from brand overrides falling back to global gateway defaults
      const drafts: Record<string, GatewayDraft> = {}
      for (const g of list) {
        const override = b.gatewayConfigs.find((c) => c.gatewayCode === g.code)
        drafts[g.code] = {
          enabled: override ? override.enabled : g.enabled,
          accountNumber: override?.accountNumber ?? g.accountNumber ?? '',
          instructions: override?.instructions ?? g.instructions ?? '',
          chargeFixed: String(override ? override.chargeFixed : g.chargeFixed ?? 0),
          chargePercent: String(override ? override.chargePercent : g.chargePercent ?? 0),
        }
      }
      setGwDrafts(drafts)
    } catch (e) {
      setGwError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setGwLoading(false)
    }
  }

  async function saveGateway(code: string) {
    if (!gwBrand) return
    const d = gwDrafts[code]
    if (!d) return
    setGwSavingCode(code)
    try {
      await sendJSON(`/api/admin/brands/${gwBrand.id}/gateways`, {
        gatewayCode: code,
        enabled: d.enabled,
        accountNumber: d.accountNumber,
        instructions: d.instructions,
        chargeFixed: Number(d.chargeFixed) || 0,
        chargePercent: Number(d.chargePercent) || 0,
      }, 'PUT')
      toast.success(t('brdGatewaySaved'))
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('brdGatewaySaveFail'))
    } finally {
      setGwSavingCode(null)
    }
  }

  const enabledCount = (b: Brand) => b.gatewayConfigs.filter((g) => g.enabled).length

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title={t('brdTitle')}
        description={t('brdSub')}
        icon={<Palette className="h-5 w-5" />}
        actions={
          <Button size="sm" className="press h-9 gap-1.5" onClick={openCreate}>
            <Plus className="h-4 w-4" /> {t('brdCreate')}
          </Button>
        }
      />

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-56 rounded-xl" />)}
        </div>
      ) : error ? (
        <ErrorCard message={error} onRetry={load} />
      ) : (brands ?? []).length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={<Palette className="h-6 w-6" />}
              title={t('brdNoBrands')}
              hint={t('brdNoBrandsHint')}
              action={<Button size="sm" className="press gap-1.5" onClick={openCreate}><Plus className="h-3.5 w-3.5" /> {t('brdCreate')}</Button>}
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">{t('brdCount').replace('{n}', String(brands?.length ?? 0))} · {t('brdDefaultNote')}</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {(brands ?? []).map((b, i) => (
              <Card key={b.id} className="ilp-fade-up relative overflow-hidden" style={{ animationDelay: `${i * 50}ms` }}>
                <span className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: b.color }} aria-hidden="true" />
                <CardContent className="flex h-full flex-col gap-3 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="h-9 w-9 shrink-0 rounded-xl border border-black/10 shadow-sm" style={{ backgroundColor: b.color }} aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-foreground">{b.name}</p>
                        <p className="truncate text-[11px] text-muted-foreground">/{b.slug}</p>
                      </div>
                    </div>
                    <Badge variant="outline" className={cn('shrink-0 text-[9px] font-bold', b.active ? 'border-success/30 bg-success/10 text-success' : 'border-border bg-muted text-muted-foreground')}>
                      {b.active ? t('brdActive') : '—'}
                    </Badge>
                  </div>

                  <div className="space-y-1 text-[11px] text-muted-foreground">
                    {b.domain && <p className="flex items-center gap-1.5 truncate"><Globe className="h-3 w-3 shrink-0" /> {b.domain}</p>}
                    {b.supportEmail && <p className="flex items-center gap-1.5 truncate"><Mail className="h-3 w-3 shrink-0" /> {b.supportEmail}</p>}
                    {b.supportPhone && <p className="flex items-center gap-1.5 truncate"><Phone className="h-3 w-3 shrink-0" /> {b.supportPhone}</p>}
                    <p className="flex items-center gap-1.5"><Wallet className="h-3 w-3 shrink-0" /> {b.currency}</p>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-lg border px-2 py-1.5 text-center">
                      <p className="text-xs font-bold tabular text-foreground">{b.counts.customers}</p>
                      <p className="text-[9px] text-muted-foreground"><Users className="mr-0.5 inline h-2.5 w-2.5" />{t('impTypeCustomers')}</p>
                    </div>
                    <div className="rounded-lg border px-2 py-1.5 text-center">
                      <p className="text-xs font-bold tabular text-foreground">{b.counts.checkouts}</p>
                      <p className="text-[9px] text-muted-foreground"><ShoppingCart className="mr-0.5 inline h-2.5 w-2.5" />{t('brdGateways')}</p>
                    </div>
                    <div className="rounded-lg border px-2 py-1.5 text-center">
                      <p className="text-xs font-bold tabular text-foreground">{b.counts.invoices}</p>
                      <p className="text-[9px] text-muted-foreground"><ReceiptText className="mr-0.5 inline h-2.5 w-2.5" />{t('impTypeInvoices')}</p>
                    </div>
                  </div>

                  <div className="mt-auto flex items-center justify-between gap-2 border-t pt-3">
                    <Button variant="outline" size="sm" className="press h-8 gap-1.5" onClick={() => openGatewayManager(b)}>
                      <Landmark className="h-3.5 w-3.5" /> {t('brdOpenManager')}
                      {enabledCount(b) > 0 && <Badge variant="outline" className="ml-1 border-primary/25 bg-primary/10 px-1.5 text-[9px] font-bold text-primary">{enabledCount(b)}</Badge>}
                    </Button>
                    <div className="flex items-center gap-0.5">
                      <Button size="icon" variant="ghost" className="press h-8 w-8 text-muted-foreground" onClick={() => openEdit(b)} aria-label={t('brdEdit')}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="icon" variant="ghost" className="press h-8 w-8 text-muted-foreground hover:text-destructive" aria-label={t('brdDelete')}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{t('brdDeleteMsg')}</AlertDialogTitle>
                            <AlertDialogDescription>{b.name}</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel className="press">{t('impClose')}</AlertDialogCancel>
                            <AlertDialogAction className="press bg-destructive text-white hover:bg-destructive/90" onClick={() => deleteBrand(b.id)}>{t('brdDelete')}</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Create / edit brand dialog */}
      <Dialog open={brandDialog} onOpenChange={setBrandDialog}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? t('brdEditTitle') : t('brdCreateTitle')}</DialogTitle>
            <DialogDescription>{t('brdSub')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3.5">
            <div className="space-y-1.5">
              <Label htmlFor="brd-name">{t('brdName')}</Label>
              <Input id="brd-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder={t('brdNamePh')} autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="brd-color">{t('brdColor')}</Label>
              <div className="flex items-center gap-2">
                <input
                  id="brd-color"
                  type="color"
                  value={form.color}
                  onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                  className="h-10 w-14 cursor-pointer rounded-lg border bg-card p-1"
                  aria-label={t('brdColor')}
                />
                <Input value={form.color} onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))} className="font-mono text-xs" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="brd-domain">{t('brdDomain')}</Label>
              <Input id="brd-domain" value={form.domain} onChange={(e) => setForm((f) => ({ ...f, domain: e.target.value }))} placeholder={t('brdDomainPh')} />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="brd-email">{t('brdSupportEmail')}</Label>
                <Input id="brd-email" type="email" value={form.supportEmail} onChange={(e) => setForm((f) => ({ ...f, supportEmail: e.target.value }))} placeholder="support@brand.com" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="brd-phone">{t('brdSupportPhone')}</Label>
                <Input id="brd-phone" value={form.supportPhone} onChange={(e) => setForm((f) => ({ ...f, supportPhone: e.target.value }))} placeholder="01XXXXXXXXX" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="brd-currency">{t('brdCurrency')}</Label>
                <Input id="brd-currency" value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value.toUpperCase() }))} className="font-mono" />
              </div>
              <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
                <div>
                  <Label htmlFor="brd-active" className="cursor-pointer">{t('brdActive')}</Label>
                  <p className="text-[10px] text-muted-foreground">{t('brdActiveHint')}</p>
                </div>
                <Switch id="brd-active" checked={form.active} onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="press" onClick={() => setBrandDialog(false)}>{t('impClose')}</Button>
            <Button className="press gap-1.5" onClick={saveBrand} disabled={saving}>
              <Plus className="h-3.5 w-3.5" /> {saving ? t('brdGatewaySaving') : t('brdGatewaySave')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Per-brand gateway manager dialog */}
      <Dialog open={!!gwBrand} onOpenChange={(v) => { if (!v) setGwBrand(null) }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="h-5 w-5 rounded-md border border-black/10" style={{ backgroundColor: gwBrand?.color }} aria-hidden="true" />
              {t('brdGatewayManager')} — {gwBrand?.name}
            </DialogTitle>
            <DialogDescription>{t('brdGatewayHint')}</DialogDescription>
          </DialogHeader>

          {gwLoading ? (
            <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>
          ) : gwError ? (
            <ErrorCard message={gwError} onRetry={() => gwBrand && openGatewayManager(gwBrand)} />
          ) : !gateways || gateways.length === 0 ? (
            <EmptyState icon={<Landmark className="h-6 w-6" />} title={t('brdGatewayNone')} />
          ) : (
            <GatewayManagerBody
              gateways={gateways}
              drafts={gwDrafts}
              setDrafts={setGwDrafts}
              saveGateway={saveGateway}
              savingCode={gwSavingCode}
              t={t}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── gateway manager body (search + rows) ─────────────────────────────────────

function GatewayManagerBody({
  gateways, drafts, setDrafts, saveGateway, savingCode, t,
}: {
  gateways: Gateway[]
  drafts: Record<string, { enabled: boolean; accountNumber: string; instructions: string; chargeFixed: string; chargePercent: string }>
  setDrafts: React.Dispatch<React.SetStateAction<Record<string, { enabled: boolean; accountNumber: string; instructions: string; chargeFixed: string; chargePercent: string }>>>
  saveGateway: (code: string) => void
  savingCode: string | null
  t: (k: string) => string
}) {
  const [q, setQ] = useState('')
  const filtered = useMemo(() => {
    if (!q.trim()) return gateways
    const needle = q.trim().toLowerCase()
    return gateways.filter((g) => g.name.toLowerCase().includes(needle) || g.code.toLowerCase().includes(needle) || g.mfs.toLowerCase().includes(needle))
  }, [gateways, q])

  const enabledTotal = useMemo(() => Object.values(drafts).filter((d) => d.enabled).length, [drafts])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('brdGatewaySearch')} className="h-9 pl-9" aria-label={t('brdGatewaySearch')} />
        </div>
        <Badge variant="outline" className="border-primary/25 bg-primary/10 text-xs font-bold text-primary">
          {t('brdGatewayEnabledCount').replace('{n}', String(enabledTotal))}
        </Badge>
      </div>

      <div className="nice-scroll max-h-[55vh] space-y-2.5 overflow-y-auto pr-1">
        {filtered.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">{t('brdNoGatewaysMatch')}</p>
        ) : filtered.map((g) => {
          const d = drafts[g.code]
          if (!d) return null
          return (
            <div key={g.code} className={cn('rounded-lg border bg-background/50 p-3 transition-opacity', !d.enabled && 'opacity-60')}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: g.color }} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{g.name}</p>
                  <p className="truncate text-[10px] text-muted-foreground">{g.code} · {g.mfs} · {g.accountType}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn('text-[10px] font-bold uppercase', d.enabled ? 'text-success' : 'text-muted-foreground')}>
                    {d.enabled ? t('brdGatewayEnabled') : '—'}
                  </span>
                  <Switch
                    checked={d.enabled}
                    onCheckedChange={(v) => setDrafts((prev) => ({ ...prev, [g.code]: { ...d, enabled: v } }))}
                    aria-label={`${g.name} ${t('brdGatewayEnabled')}`}
                  />
                </div>
              </div>

              <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-4">
                <div className="sm:col-span-2">
                  <Label htmlFor={`acc-${g.code}`} className="text-[10px] text-muted-foreground">{t('brdGatewayAccount')}</Label>
                  <Input
                    id={`acc-${g.code}`}
                    value={d.accountNumber}
                    onChange={(e) => setDrafts((prev) => ({ ...prev, [g.code]: { ...d, accountNumber: e.target.value } }))}
                    placeholder={t('brdGatewayAccountPh')}
                    className="h-9 text-xs"
                  />
                </div>
                <div>
                  <Label htmlFor={`cf-${g.code}`} className="text-[10px] text-muted-foreground">{t('brdGatewayChargeFixed')}</Label>
                  <Input
                    id={`cf-${g.code}`}
                    type="number" min="0" step="0.01"
                    value={d.chargeFixed}
                    onChange={(e) => setDrafts((prev) => ({ ...prev, [g.code]: { ...d, chargeFixed: e.target.value } }))}
                    className="h-9 text-xs tabular"
                  />
                </div>
                <div>
                  <Label htmlFor={`cp-${g.code}`} className="text-[10px] text-muted-foreground">{t('brdGatewayChargePercent')}</Label>
                  <Input
                    id={`cp-${g.code}`}
                    type="number" min="0" max="100" step="0.1"
                    value={d.chargePercent}
                    onChange={(e) => setDrafts((prev) => ({ ...prev, [g.code]: { ...d, chargePercent: e.target.value } }))}
                    className="h-9 text-xs tabular"
                  />
                </div>
                <div className="sm:col-span-4">
                  <Label htmlFor={`ins-${g.code}`} className="text-[10px] text-muted-foreground">{t('brdGatewayInstructions')}</Label>
                  <Input
                    id={`ins-${g.code}`}
                    value={d.instructions}
                    onChange={(e) => setDrafts((prev) => ({ ...prev, [g.code]: { ...d, instructions: e.target.value } }))}
                    placeholder={t('brdGatewayInstructionsPh')}
                    className="h-9 text-xs"
                  />
                </div>
              </div>

              <div className="mt-2.5 flex justify-end">
                <Button
                  size="sm"
                  className="press h-8 gap-1.5"
                  disabled={savingCode === g.code}
                  onClick={() => saveGateway(g.code)}
                >
                  <Save className="h-3.5 w-3.5" />
                  {savingCode === g.code ? t('brdGatewaySaving') : t('brdGatewaySave')}
                </Button>
              </div>

              {(Number(d.chargeFixed) > 0 || Number(d.chargePercent) > 0) && d.enabled && (
                <p className="mt-1 text-right text-[10px] text-muted-foreground">
                  ≈ +{formatBDT(Number(d.chargeFixed) || 0)}{Number(d.chargePercent) > 0 ? ` + ${Number(d.chargePercent)}%` : ''}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
