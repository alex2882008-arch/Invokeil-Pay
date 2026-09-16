'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { Network, Power, Smartphone, Landmark, Globe2, Settings2, RefreshCw, Search } from 'lucide-react'
import { fetchApi } from '@/lib/api-client'
import { PageHeader, StatCard, EmptyState, ErrorCard } from './ui-bits'
import { GatewayLogo } from './gateway-logo'
import { useLang } from '@/lib/i18n'
import { useUrlState } from '@/hooks/use-url-state'

// ── Types & helpers ──────────────────────────────────────────────────────────

interface GatewayRow {
  id: string
  code: string
  name: string
  mfs: string
  category: string
  type: string
  accountType: string
  enabled: boolean
  color: string
  textColor: string
  icon: string | null
  accountNumber: string | null
  instructions: string | null
  minAmount: number | null
  maxAmount: number | null
  chargeFixed: number
  chargePercent: number
  discountFixed: number
  discountPercent: number
  sortOrder: number
}

interface GatewayForm {
  name: string
  accountNumber: string
  instructions: string
  minAmount: string
  maxAmount: string
  chargeFixed: string
  chargePercent: string
  discountFixed: string
  discountPercent: string
  color: string
  textColor: string
  accountType: string
}

type Category = 'ALL' | 'MFS' | 'BANK' | 'GLOBAL'

/** Native <input type="color"> needs a strict #rrggbb value. */
function safeHex(v: string | null | undefined, fallback: string): string {
  return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : fallback
}

/** "10" stays "10", "1.5" stays "1.5" — for ৳10 + 1.5% style summaries. */
function trimNum(n: number): string {
  return Number.isFinite(n) ? String(n) : '0'
}

function toNumOr0(s: string): number {
  const n = Number(s.trim() || '0')
  return Number.isFinite(n) ? Math.max(0, n) : 0
}

function toNumOrNull(s: string): number | null {
  const t = s.trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

function chargeSummary(g: { chargeFixed: number; chargePercent: number }): string {
  const parts: string[] = []
  if (g.chargeFixed > 0) parts.push(`৳${trimNum(g.chargeFixed)}`)
  if (g.chargePercent > 0) parts.push(`${trimNum(g.chargePercent)}%`)
  return parts.join(' + ')
}

function discountSummary(g: { discountFixed: number; discountPercent: number }): string {
  const parts: string[] = []
  if (g.discountFixed > 0) parts.push(`৳${trimNum(g.discountFixed)}`)
  if (g.discountPercent > 0) parts.push(`${trimNum(g.discountPercent)}%`)
  return parts.join(' + ')
}

function formFromGateway(g: GatewayRow): GatewayForm {
  return {
    name: g.name,
    accountNumber: g.accountNumber ?? '',
    instructions: g.instructions ?? '',
    minAmount: g.minAmount != null ? String(g.minAmount) : '',
    maxAmount: g.maxAmount != null ? String(g.maxAmount) : '',
    chargeFixed: String(g.chargeFixed ?? 0),
    chargePercent: String(g.chargePercent ?? 0),
    discountFixed: String(g.discountFixed ?? 0),
    discountPercent: String(g.discountPercent ?? 0),
    color: safeHex(g.color, '#2563EB'),
    textColor: safeHex(g.textColor, '#FFFFFF'),
    accountType: g.accountType || 'PERSONAL',
  }
}

// ── Main view ────────────────────────────────────────────────────────────────

export function GatewaysView() {
  const { t } = useLang()
  const sp = useUrlState()
  const [localQ, setLocalQ] = useState('')

  const cat = (sp.get('cat') as Category) || 'ALL'

  const [gateways, setGateways] = useState<GatewayRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [savingId, setSavingId] = useState<string | null>(null)
  const [editing, setEditing] = useState<GatewayRow | null>(null)
  const [form, setForm] = useState<GatewayForm | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const d = await fetchApi<{ gateways?: GatewayRow[] }>('/api/admin/gateways')
      setGateways(Array.isArray(d.gateways) ? d.gateways : [])
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Category counts (always over the FULL list, not the filtered one)
  const counts = useMemo(() => {
    const list = gateways ?? []
    return {
      ALL: list.length,
      MFS: list.filter((g) => g.category === 'MFS').length,
      BANK: list.filter((g) => g.category === 'BANK').length,
      GLOBAL: list.filter((g) => g.category === 'GLOBAL').length,
      enabled: list.filter((g) => g.enabled).length,
    }
  }, [gateways])

  const filtered = useMemo(() => {
    const list = gateways ?? []
    const needle = localQ.trim().toLowerCase()
    return list.filter((g) => {
      if (cat !== 'ALL' && g.category !== cat) return false
      if (!needle) return true
      return (
        g.name.toLowerCase().includes(needle) ||
        g.code.toLowerCase().includes(needle) ||
        g.mfs.toLowerCase().includes(needle)
      )
    })
  }, [gateways, cat, localQ])

  /** Optimistic enable/disable with rollback on failure. */
  async function toggleEnabled(g: GatewayRow, next: boolean) {
    setSavingId(g.id)
    setGateways((prev) => (prev ?? []).map((x) => (x.id === g.id ? { ...x, enabled: next } : x)))
    try {
      await fetchApi(`/api/admin/gateways/${g.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      })
      toast.success(next ? t('gwEnabledMsg') : t('gwDisabledMsg'), { description: g.name })
    } catch (e) {
      setGateways((prev) => (prev ?? []).map((x) => (x.id === g.id ? { ...x, enabled: !next } : x)))
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setSavingId(null)
    }
  }

  function openEdit(g: GatewayRow) {
    setEditing(g)
    setForm(formFromGateway(g))
  }

  async function saveEdit() {
    if (!editing || !form) return
    setBusy(true)
    try {
      const body = JSON.stringify({
        name: form.name.trim(),
        accountNumber: form.accountNumber.trim() || null,
        instructions: form.instructions.trim() || null,
        minAmount: toNumOrNull(form.minAmount),
        maxAmount: toNumOrNull(form.maxAmount),
        chargeFixed: toNumOr0(form.chargeFixed),
        chargePercent: Math.min(100, toNumOr0(form.chargePercent)),
        discountFixed: toNumOr0(form.discountFixed),
        discountPercent: Math.min(100, toNumOr0(form.discountPercent)),
        color: safeHex(form.color, '#2563EB'),
        textColor: safeHex(form.textColor, '#FFFFFF'),
        accountType: form.accountType,
      })
      const d = await fetchApi<{ gateway?: GatewayRow }>(`/api/admin/gateways/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body,
      })
      const updated = d.gateway
      if (updated) {
        setGateways((prev) => (prev ?? []).map((x) => (x.id === updated.id ? updated : x)))
      }
      toast.success(t('gwUpdatedMsg'), { description: editing.code })
      setEditing(null)
      setForm(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  const accountTypeLabel: Record<string, string> = {
    PERSONAL: t('gwPersonal'),
    AGENT: t('gwAgent'),
    MERCHANT: t('gwMerchant'),
  }
  const typeLabel: Record<string, string> = {
    AUTOMATION: t('gwTypeAutomation'),
    MANUAL: t('gwTypeManual'),
    API: t('gwTypeApi'),
  }

  const chips: Array<{ key: Category; label: string; count: number }> = [
    { key: 'ALL', label: t('gwCatAll'), count: counts.ALL },
    { key: 'MFS', label: t('gwCatMfs'), count: counts.MFS },
    { key: 'BANK', label: t('gwCatBank'), count: counts.BANK },
    { key: 'GLOBAL', label: t('gwCatGlobal'), count: counts.GLOBAL },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        icon={<Network className="h-5 w-5" />}
        title={t('gwTitle')}
        description={t('gwDesc')}
        actions={
          <Button variant="outline" className="press min-h-10 gap-1.5" onClick={load}>
            <RefreshCw className="h-4 w-4" /> {t('refresh')}
          </Button>
        }
      />

      {/* Stats */}
      <div className="stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          loading={loading && !gateways}
          label={t('gwStatTotal')}
          value={String(counts.ALL)}
          icon={<Network className="h-5 w-5" />}
        />
        <StatCard
          loading={loading && !gateways}
          label={t('gwStatEnabled')}
          value={String(counts.enabled)}
          icon={<Power className="h-5 w-5" />}
          tone="text-success bg-success/10"
        />
        <StatCard
          loading={loading && !gateways}
          label={t('gwStatMfs')}
          value={String(counts.MFS)}
          icon={<Smartphone className="h-5 w-5" />}
          tone="text-pink-600 bg-pink-500/10"
        />
        <StatCard
          loading={loading && !gateways}
          label={t('gwStatBank')}
          value={String(counts.BANK)}
          icon={<Landmark className="h-5 w-5" />}
          tone="text-amber-600 bg-amber-500/10"
        />
        <StatCard
          loading={loading && !gateways}
          label={t('gwStatGlobal')}
          value={String(counts.GLOBAL)}
          icon={<Globe2 className="h-5 w-5" />}
          tone="text-violet-600 bg-violet-500/10"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={localQ}
            onChange={(e) => setLocalQ(e.target.value)}
            placeholder={t('gwSearchPh')}
            className="h-9 pl-9"
            aria-label={t('gwSearchPh')}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('gwTitle')}>
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              className={`press inline-flex min-h-10 items-center gap-1.5 rounded-full border px-4 text-xs font-bold transition-colors ${
                cat === c.key
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground'
              }`}
              onClick={() => sp.set({ cat: c.key === 'ALL' ? null : c.key })}
            >
              {c.label}
              <span className={`tabular rounded-full px-1.5 text-[10px] ${cat === c.key ? 'bg-primary-foreground/20' : 'bg-muted'}`}>
                {c.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {error && !loading ? (
        <ErrorCard message={error} onRetry={load} />
      ) : loading && !gateways ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Network className="h-10 w-10" />}
          title={t('gwEmpty')}
          hint={t('gwEmptyHint')}
          action={
            <Button variant="outline" size="sm" className="press min-h-9 gap-1.5" onClick={() => sp.reset()}>
              <RefreshCw className="h-3.5 w-3.5" /> {t('clearFilters')}
            </Button>
          }
        />
      ) : (
        <div className="stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((g) => {
            const charges = chargeSummary(g)
            const discount = discountSummary(g)
            return (
              <div
                key={g.id}
                className={`hover-lift cursor-pointer rounded-xl border bg-card p-4 shadow-brand ${!g.enabled ? 'opacity-60' : ''}`}
                onClick={() => openEdit(g)}
                role="button"
                tabIndex={0}
                aria-label={`${g.name} — ${t('gwConfigure')}`}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openEdit(g) } }}
              >
                <div className="flex items-start gap-3">
                  <GatewayLogo code={g.code} mfs={g.mfs} color={g.color} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-foreground">{g.name}</p>
                    <p className="truncate font-mono text-[11px] text-muted-foreground">{g.code}</p>
                  </div>
                  <span
                    data-noclick
                    className="flex min-h-10 items-center"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Switch
                      checked={g.enabled}
                      disabled={savingId === g.id}
                      onCheckedChange={(v) => toggleEnabled(g, v)}
                      aria-label={`${g.name} — ${g.enabled ? t('enabled') : t('disabled')}`}
                    />
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                    {accountTypeLabel[g.accountType] ?? g.accountType}
                  </span>
                  <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                    {typeLabel[g.type] ?? g.type}
                  </span>
                  <span className="ml-auto max-w-full truncate font-mono text-[11px] text-foreground/70">
                    {g.accountNumber ?? '—'}
                  </span>
                </div>

                <div className="mt-2.5 flex items-center justify-between gap-2 border-t pt-2.5 text-[11px]">
                  <span className="text-muted-foreground">
                    {charges ? <><b className="text-foreground">{t('gwCharges')}</b> {charges}</> : t('gwNoCharge')}
                  </span>
                  {discount && (
                    <span className="shrink-0 font-semibold text-success">
                      {t('gwDiscount')} −{discount}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Configure dialog */}
      <Dialog open={!!editing && !!form} onOpenChange={(o) => { if (!o) { setEditing(null); setForm(null) } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-primary" /> {t('gwConfigure')}
            </DialogTitle>
            <DialogDescription className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono">{editing?.code}</span>
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                {t('gwFixed')}
              </span>
              <span className="text-[10px] normal-case text-muted-foreground">{t('gwFixedHint')}</span>
            </DialogDescription>
          </DialogHeader>

          {form && editing && (
            <>
              {/* Live preview strip — how payment pages render this gateway */}
              <div className="space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{t('gwPreview')}</p>
                <div
                  className="flex items-center gap-3 rounded-xl p-3.5 shadow-brand"
                  style={{ background: safeHex(form.color, '#2563EB'), color: safeHex(form.textColor, '#FFFFFF') }}
                >
                  <GatewayLogo code={editing.code} mfs={editing.mfs} color={form.color} size={44} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{form.name || editing.code}</p>
                    <p className="text-[11px] opacity-80">
                      {accountTypeLabel[form.accountType] ?? form.accountType} · {typeLabel[editing.type] ?? editing.type}
                    </p>
                  </div>
                  <div className="ml-auto shrink-0 text-right">
                    <p className="text-[9px] font-bold uppercase tracking-wider opacity-75">{t('gwPayTo')}</p>
                    <p className="font-mono text-sm font-semibold">{form.accountNumber.trim() || '01XXXXXXXXX'}</p>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground">{t('gwPreviewHint')}</p>
              </div>

              <div className="nice-scroll max-h-[46vh] space-y-3.5 overflow-y-auto pr-1">
                <div className="space-y-1.5">
                  <Label htmlFor="gw-number">{t('gwAccountNumber')}</Label>
                  <Input
                    id="gw-number" value={form.accountNumber} inputMode="tel" autoComplete="off"
                    placeholder="01XXXXXXXXX"
                    onChange={(e) => setForm({ ...form, accountNumber: e.target.value })}
                  />
                  <p className="text-[11px] text-muted-foreground">{t('gwAccountHint')}</p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="gw-instructions">{t('gwInstructions')}</Label>
                  <Textarea
                    id="gw-instructions" value={form.instructions} rows={4}
                    onChange={(e) => setForm({ ...form, instructions: e.target.value })}
                  />
                  <p className="text-[11px] text-muted-foreground">{t('gwInstructionsHint')}</p>
                </div>

                <div className="grid grid-cols-2 gap-3.5">
                  <div className="space-y-1.5">
                    <Label htmlFor="gw-min">{t('gwMinAmount')}</Label>
                    <Input
                      id="gw-min" value={form.minAmount} inputMode="decimal" placeholder="—"
                      onChange={(e) => setForm({ ...form, minAmount: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="gw-max">{t('gwMaxAmount')}</Label>
                    <Input
                      id="gw-max" value={form.maxAmount} inputMode="decimal" placeholder="—"
                      onChange={(e) => setForm({ ...form, maxAmount: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="gw-cfixed">{t('gwChargeFixed')}</Label>
                    <Input
                      id="gw-cfixed" value={form.chargeFixed} inputMode="decimal"
                      onChange={(e) => setForm({ ...form, chargeFixed: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="gw-cpct">{t('gwChargePercent')}</Label>
                    <Input
                      id="gw-cpct" value={form.chargePercent} inputMode="decimal"
                      onChange={(e) => setForm({ ...form, chargePercent: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="gw-dfixed">{t('gwDiscountFixed')}</Label>
                    <Input
                      id="gw-dfixed" value={form.discountFixed} inputMode="decimal"
                      onChange={(e) => setForm({ ...form, discountFixed: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="gw-dpct">{t('gwDiscountPercent')}</Label>
                    <Input
                      id="gw-dpct" value={form.discountPercent} inputMode="decimal"
                      onChange={(e) => setForm({ ...form, discountPercent: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3.5">
                  <div className="space-y-1.5">
                    <Label htmlFor="gw-color">{t('gwColor')}</Label>
                    <div className="flex items-center gap-2">
                      <input
                        id="gw-color" type="color" value={safeHex(form.color, '#2563EB')}
                        onChange={(e) => setForm({ ...form, color: e.target.value })}
                        className="h-10 w-12 cursor-pointer rounded-md border bg-card p-1"
                        aria-label={t('gwColor')}
                      />
                      <span className="font-mono text-xs text-muted-foreground">{form.color.toUpperCase()}</span>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="gw-tcolor">{t('gwTextColor')}</Label>
                    <div className="flex items-center gap-2">
                      <input
                        id="gw-tcolor" type="color" value={safeHex(form.textColor, '#FFFFFF')}
                        onChange={(e) => setForm({ ...form, textColor: e.target.value })}
                        className="h-10 w-12 cursor-pointer rounded-md border bg-card p-1"
                        aria-label={t('gwTextColor')}
                      />
                      <span className="font-mono text-xs text-muted-foreground">{form.textColor.toUpperCase()}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>{t('gwAccountType')}</Label>
                  <Select value={form.accountType} onValueChange={(v) => setForm({ ...form, accountType: v })}>
                    <SelectTrigger className="min-h-10 w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PERSONAL">{t('gwPersonal')}</SelectItem>
                      <SelectItem value="AGENT">{t('gwAgent')}</SelectItem>
                      <SelectItem value="MERCHANT">{t('gwMerchant')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <DialogFooter>
                <Button
                  variant="outline" className="press min-h-10"
                  onClick={() => { setEditing(null); setForm(null) }}
                >
                  {t('cancel')}
                </Button>
                <Button className="press min-h-10" disabled={busy || !form.name.trim()} onClick={saveEdit}>
                  {t('saveChanges')}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
