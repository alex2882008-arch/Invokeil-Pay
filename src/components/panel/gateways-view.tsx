'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import {
  Network, Plus, Landmark, RefreshCw, Settings2, Trash2, Upload,
  ChevronLeft, ChevronRight, Image as ImageIcon, SlidersHorizontal, X,
} from 'lucide-react'
import { fetchApi } from '@/lib/api-client'
import { PageHeader, EmptyState, ErrorCard } from './ui-bits'
import { GatewayLogo } from './gateway-logo'
import { useLang } from '@/lib/i18n'
import { useUrlState } from '@/hooks/use-url-state'
import {
  gatewayConfigFields, accountFieldLabel,
  type ConfigFieldDef,
} from '@/lib/gateways'
import { cn } from '@/lib/utils'

// ── Types & helpers ──────────────────────────────────────────────────────────

interface GatewayRow {
  id: string
  code: string
  name: string
  displayName: string | null
  mfs: string
  category: string
  type: string
  accountType: string
  enabled: boolean
  color: string
  textColor: string
  buttonColor: string | null
  buttonText: string | null
  icon: string | null
  logoUrl: string | null
  accountNumber: string | null
  bankName: string | null
  holderName: string | null
  branchName: string | null
  routingNumber: string | null
  swiftCode: string | null
  allowPending: string
  ipnUrl: string | null
  mode: string | null
  supportedLanguages: string | null
  currency: string | null
  instructions: string | null
  qrImage: string | null
  minAmount: number | null
  maxAmount: number | null
  chargeFixed: number
  chargePercent: number
  discountFixed: number
  discountPercent: number
  sortOrder: number
  config: Record<string, string> | null
}

interface CatalogItem {
  code: string
  name: string
  mfs: string
  category: string
  type: string
  accountType: string
  color: string
  textColor: string
  method: string
  hasQr: boolean
  instructions: string | null
}

interface GatewayForm {
  name: string
  displayName: string
  currency: string
  enabled: boolean
  minAmount: string
  maxAmount: string
  chargeFixed: string
  chargePercent: string
  discountFixed: string
  discountPercent: string
  color: string
  textColor: string
  buttonColor: string
  buttonText: string
  logoUrl: string | null
  qrImage: string | null
  accountNumber: string
  instructions: string
  bankName: string
  holderName: string
  branchName: string
  routingNumber: string
  swiftCode: string
  allowPending: 'ENABLED' | 'DISABLED'
  ipnUrl: string
  mode: string
  supportedLanguages: string
  accountType: string
}

type Category = 'ALL' | 'MFS' | 'BANK' | 'GLOBAL'

const CURRENCIES = ['BDT', 'USD', 'EUR', 'GBP', 'INR', 'AED']
const LANG_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'bn', label: 'বাংলা (Bangla)' },
  { value: 'en,bn', label: 'English + বাংলা' },
]
const PAGE_SIZES = [8, 10, 25, 50]

/** Native <input type="color"> needs a strict #rrggbb value. */
function safeHex(v: string | null | undefined, fallback: string): string {
  return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : fallback
}

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

function formFromGateway(g: GatewayRow): GatewayForm {
  return {
    name: g.name,
    displayName: g.displayName ?? '',
    currency: g.currency ?? 'BDT',
    enabled: g.enabled,
    minAmount: g.minAmount != null ? String(g.minAmount) : '',
    maxAmount: g.maxAmount != null ? String(g.maxAmount) : '',
    chargeFixed: String(g.chargeFixed ?? 0),
    chargePercent: String(g.chargePercent ?? 0),
    discountFixed: String(g.discountFixed ?? 0),
    discountPercent: String(g.discountPercent ?? 0),
    color: safeHex(g.color, '#2563EB'),
    textColor: safeHex(g.textColor, '#FFFFFF'),
    buttonColor: safeHex(g.buttonColor, safeHex(g.color, '#2563EB')),
    buttonText: safeHex(g.buttonText, safeHex(g.textColor, '#FFFFFF')),
    logoUrl: g.logoUrl ?? null,
    qrImage: g.qrImage ?? null,
    accountNumber: g.accountNumber ?? '',
    instructions: g.instructions ?? '',
    bankName: g.bankName ?? '',
    holderName: g.holderName ?? '',
    branchName: g.branchName ?? '',
    routingNumber: g.routingNumber ?? '',
    swiftCode: g.swiftCode ?? '',
    allowPending: g.allowPending === 'DISABLED' ? 'DISABLED' : 'ENABLED',
    ipnUrl: g.ipnUrl ?? '',
    mode: g.mode ?? 'LIVE',
    supportedLanguages: g.supportedLanguages ?? 'en,bn',
    accountType: g.accountType || 'PERSONAL',
  }
}

function blankBankForm(): GatewayForm {
  return {
    name: '',
    displayName: '',
    currency: 'BDT',
    enabled: true,
    minAmount: '',
    maxAmount: '',
    chargeFixed: '0',
    chargePercent: '0',
    discountFixed: '0',
    discountPercent: '0',
    color: '#475569',
    textColor: '#FFFFFF',
    buttonColor: '#475569',
    buttonText: '#FFFFFF',
    logoUrl: null,
    qrImage: null,
    accountNumber: '',
    instructions: '',
    bankName: '',
    holderName: '',
    branchName: '',
    routingNumber: '',
    swiftCode: '',
    allowPending: 'ENABLED',
    ipnUrl: '',
    mode: 'LIVE',
    supportedLanguages: 'en,bn',
    accountType: 'PERSONAL',
  }
}

/** Row/catalog → gateway method (for config-field metadata). */
function methodOf(row: { code: string; category: string; type: string; accountType: string }): string {
  if (row.category === 'BANK') return row.type === 'API' ? 'API_CHECKOUT' : 'BANK_TRANSFER'
  if (row.category === 'MFS') {
    return row.accountType === 'AGENT' ? 'CASH_OUT' : row.accountType === 'MERCHANT' ? 'MAKE_PAYMENT' : 'SEND_MONEY'
  }
  return row.type === 'API' ? 'API_CHECKOUT' : 'MANUAL_TRANSFER'
}

/** Whether the Configuration card shows a QR upload (PipraPay per-gateway QR). */
function qrAvailable(row: { code: string; category: string }): boolean {
  const c = row.code.toUpperCase()
  if (c.startsWith('BINANCE')) return true
  if (row.category === 'MFS') {
    // Nagad / Tap / iPay / CellFin personal have no QR in PipraPay's modules;
    // the catalog metadata covers the rest via hasQr on the pay page — for the
    // admin form keep it simple: MFS rows may upload a QR.
    return true
  }
  return false
}

// ── Small building blocks ────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
      <p className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">{title}</p>
      {children}
    </div>
  )
}

function Field({
  label, required, hint, children, htmlFor,
}: {
  label: string
  required?: boolean
  hint?: string
  children: React.ReactNode
  htmlFor?: string
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-xs font-semibold text-foreground/85">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
      {hint && <p className="text-[11px] leading-snug text-muted-foreground">{hint}</p>}
    </div>
  )
}

function SuffixInput({
  id, value, onChange, suffix, placeholder, inputMode,
}: {
  id: string
  value: string
  onChange: (v: string) => void
  suffix: string
  placeholder?: string
  inputMode?: 'decimal' | 'tel' | 'text'
}) {
  return (
    <div className="flex items-stretch overflow-hidden rounded-lg border bg-card focus-within:ring-2 focus-within:ring-ring/40">
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        className="h-10 min-w-0 flex-1 rounded-none border-0 shadow-none focus-visible:ring-0"
      />
      <span className="flex shrink-0 items-center border-l bg-muted px-2.5 text-[11px] font-bold text-muted-foreground">
        {suffix}
      </span>
    </div>
  )
}

function ColorField({
  id, label, value, onChange, required,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  required?: boolean
}) {
  return (
    <Field label={label} required={required} htmlFor={id}>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="color"
          value={safeHex(value, '#000000')}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-12 cursor-pointer rounded-md border bg-card p-1"
          aria-label={label}
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 font-mono text-xs uppercase"
          aria-label={`${label} hex`}
        />
      </div>
    </Field>
  )
}

/** Image upload (logo 500x250 / QR) — data-URL ≤ ~300KB with preview. */
function ImageField({
  id, label, value, onChange, hint, wide, removeLabel, uploadLabel,
}: {
  id: string
  label: string
  value: string | null
  onChange: (v: string | null) => void
  hint?: string
  wide?: boolean
  removeLabel: string
  uploadLabel: string
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const { t } = useLang()

  async function pick(file: File | undefined) {
    if (!file) return
    if (file.size > 300 * 1024) {
      toast.error(t('gwLogoTooBig'))
      return
    }
    const reader = new FileReader()
    reader.onload = () => onChange(String(reader.result ?? ''))
    reader.readAsDataURL(file)
  }

  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <div className="flex flex-wrap items-center gap-3">
        {value ? (
          <div className="relative overflow-hidden rounded-lg border bg-white p-1.5">
            { }
            <img
              src={value}
              alt={label}
              className={cn('object-contain', wide ? 'h-16 w-[128px]' : 'h-16 w-16 rounded-md')}
            />
          </div>
        ) : (
          <div className={cn('flex items-center justify-center rounded-lg border border-dashed bg-muted/40 text-muted-foreground', wide ? 'h-16 w-[128px]' : 'h-16 w-16')}>
            <ImageIcon className="h-5 w-5" />
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="press h-9 gap-1.5"
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5" /> {uploadLabel}
          </Button>
          {value && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="press h-9 gap-1.5 text-destructive hover:text-destructive"
              onClick={() => onChange(null)}
            >
              <X className="h-3.5 w-3.5" /> {removeLabel}
            </Button>
          )}
        </div>
        <input
          ref={inputRef}
          id={id}
          type="file"
          accept="image/png,image/jpeg,image/svg+xml,image/webp"
          className="hidden"
          onChange={(e) => { void pick(e.target.files?.[0]); e.currentTarget.value = '' }}
        />
      </div>
    </Field>
  )
}

function ConfigFieldInput({
  def, value, onChange, secretHint,
}: {
  def: ConfigFieldDef
  value: string
  onChange: (v: string) => void
  secretHint: string
}) {
  if (def.type === 'select' && def.options) {
    return (
      <Field label={def.label} required={def.required} hint={def.hint}>
        <Select value={value || def.options[0]?.value || ''} onValueChange={onChange}>
          <SelectTrigger className="min-h-10 w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {def.options.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    )
  }
  return (
    <Field label={def.label} required={def.required} hint={def.secret ? secretHint : def.hint}>
      <Input
        type={def.type === 'password' ? 'password' : 'text'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        className="h-10"
        placeholder={def.secret ? '••••' : undefined}
      />
    </Field>
  )
}

// ── Main view ────────────────────────────────────────────────────────────────

export function GatewaysView() {
  const { t } = useLang()
  const sp = useUrlState()
  const cat = (sp.get('cat') as Category) || 'ALL'

  const [gateways, setGateways] = useState<GatewayRow[] | null>(null)
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // table controls
  const [q, setQ] = useState('')
  const [pageSize, setPageSize] = useState(8)
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [savingId, setSavingId] = useState<string | null>(null)

  // dialogs
  const [newGatewayOpen, setNewGatewayOpen] = useState(false)
  const [newCode, setNewCode] = useState<string>('')
  const [creating, setCreating] = useState(false)
  const [newBankOpen, setNewBankOpen] = useState(false)
  const [bankForm, setBankForm] = useState<GatewayForm | null>(null)
  const [editing, setEditing] = useState<GatewayRow | null>(null)
  const [form, setForm] = useState<GatewayForm | null>(null)
  const [configVals, setConfigVals] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<GatewayRow | null>(null)

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

  const loadCatalog = useCallback(async () => {
    try {
      const d = await fetchApi<{ catalog?: CatalogItem[] }>('/api/admin/gateways?catalog=1')
      setCatalog(Array.isArray(d.catalog) ? d.catalog : [])
    } catch { /* picker shows empty */ }
  }, [])

  const openNewGateway = useCallback(() => {
    setNewCode('')
    void loadCatalog()
    setNewGatewayOpen(true)
  }, [loadCatalog])

  const openEdit = useCallback((g: GatewayRow) => {
    setEditing(g)
    setForm(formFromGateway(g))
    setConfigVals({ ...(g.config ?? {}) })
  }, [])

  // ── Create from catalog ──
  async function createFromCatalog() {
    if (!newCode) return
    setCreating(true)
    try {
      const d = await fetchApi<{ gateway?: GatewayRow }>('/api/admin/gateways', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: newCode }),
      })
      const created = d.gateway
      if (created) {
        setGateways((prev) => {
          const list = [...(prev ?? []), created]
          list.sort((a, b) => a.sortOrder - b.sortOrder)
          return list
        })
        toast.success(t('gwCreatedMsg'), { description: created.name })
        setNewGatewayOpen(false)
        openEdit(created)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setCreating(false)
    }
  }

  // ── Create bank gateway ──
  async function createBank() {
    if (!bankForm) return
    if (!bankForm.name.trim()) { toast.error(t('gwGatewayName')); return }
    if (!bankForm.bankName.trim() || !bankForm.holderName.trim() || !bankForm.accountNumber.trim()) {
      toast.error(t('gwBankName'))
      return
    }
    setBusy(true)
    try {
      const d = await fetchApi<{ gateway?: GatewayRow }>('/api/admin/gateways', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bank: true,
          name: bankForm.name.trim(),
          displayName: bankForm.displayName.trim() || null,
          enabled: bankForm.enabled,
          currency: bankForm.currency,
          minAmount: toNumOrNull(bankForm.minAmount),
          maxAmount: toNumOrNull(bankForm.maxAmount),
          chargeFixed: toNumOr0(bankForm.chargeFixed),
          chargePercent: toNumOr0(bankForm.chargePercent),
          discountFixed: toNumOr0(bankForm.discountFixed),
          discountPercent: toNumOr0(bankForm.discountPercent),
          color: safeHex(bankForm.color, '#475569'),
          textColor: safeHex(bankForm.textColor, '#FFFFFF'),
          logoUrl: bankForm.logoUrl,
          accountNumber: bankForm.accountNumber.trim(),
          bankName: bankForm.bankName.trim(),
          holderName: bankForm.holderName.trim(),
          branchName: bankForm.branchName.trim() || null,
          routingNumber: bankForm.routingNumber.trim() || null,
          swiftCode: bankForm.swiftCode.trim() || null,
          allowPending: bankForm.allowPending,
          supportedLanguages: bankForm.supportedLanguages,
          instructions: bankForm.instructions.trim() || null,
        }),
      })
      const created = d.gateway
      if (created) {
        setGateways((prev) => {
          const list = [...(prev ?? []), created]
          list.sort((a, b) => a.sortOrder - b.sortOrder)
          return list
        })
        toast.success(t('gwCreatedMsg'), { description: created.name })
        setNewBankOpen(false)
        setBankForm(null)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  // ── Save settings ──
  async function saveEdit() {
    if (!editing || !form) return
    setBusy(true)
    try {
      // config: skip blank + masked echoes (keep stored secrets)
      const cleanConfig: Record<string, string> = {}
      for (const [k, v] of Object.entries(configVals)) {
        const s = v.trim()
        if (s === '' || s.startsWith('••••')) continue
        cleanConfig[k] = s
      }
      const body = JSON.stringify({
        name: form.name.trim(),
        displayName: form.displayName.trim() || null,
        enabled: form.enabled,
        currency: form.currency,
        minAmount: toNumOrNull(form.minAmount),
        maxAmount: toNumOrNull(form.maxAmount),
        chargeFixed: toNumOr0(form.chargeFixed),
        chargePercent: Math.min(100, toNumOr0(form.chargePercent)),
        discountFixed: toNumOr0(form.discountFixed),
        discountPercent: Math.min(100, toNumOr0(form.discountPercent)),
        color: safeHex(form.color, '#2563EB'),
        textColor: safeHex(form.textColor, '#FFFFFF'),
        buttonColor: safeHex(form.buttonColor, safeHex(form.color, '#2563EB')),
        buttonText: safeHex(form.buttonText, safeHex(form.textColor, '#FFFFFF')),
        logoUrl: form.logoUrl,
        qrImage: form.qrImage,
        accountNumber: form.accountNumber.trim() || null,
        instructions: form.instructions.trim() || null,
        bankName: form.bankName.trim() || null,
        holderName: form.holderName.trim() || null,
        branchName: form.branchName.trim() || null,
        routingNumber: form.routingNumber.trim() || null,
        swiftCode: form.swiftCode.trim() || null,
        allowPending: form.allowPending,
        ipnUrl: form.ipnUrl.trim() || null,
        mode: form.mode || null,
        supportedLanguages: form.supportedLanguages || null,
        accountType: form.accountType,
        config: cleanConfig,
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

  // ── Enable/disable (optimistic) ──
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

  // ── Delete ──
  async function doDelete(g: GatewayRow) {
    try {
      await fetchApi(`/api/admin/gateways/${g.id}`, { method: 'DELETE' })
      setGateways((prev) => (prev ?? []).filter((x) => x.id !== g.id))
      setSelected((prev) => { const n = new Set(prev); n.delete(g.id); return n })
      toast.success(t('gwDeletedMsg'), { description: g.name })
      setConfirmDelete(null)
      if (editing?.id === g.id) { setEditing(null); setForm(null) }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    }
  }

  // ── Bulk actions ──
  async function bulk(next: boolean | 'delete') {
    const ids = [...selected]
    if (ids.length === 0) return
    for (const id of ids) {
      const row = (gateways ?? []).find((x) => x.id === id)
      if (!row) continue
      if (next === 'delete') {
        await fetchApi(`/api/admin/gateways/${id}`, { method: 'DELETE' }).catch(() => undefined)
      } else {
        await fetchApi(`/api/admin/gateways/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: next }),
        }).catch(() => undefined)
      }
    }
    setSelected(new Set())
    await load()
    toast.success(next === 'delete' ? t('gwDeletedMsg') : next ? t('gwEnabledMsg') : t('gwDisabledMsg'), {
      description: `${ids.length} gateway${ids.length > 1 ? 's' : ''}`,
    })
  }

  // ── Derived: filter + paginate ──
  const filtered = useMemo(() => {
    const list = gateways ?? []
    const needle = q.trim().toLowerCase()
    return list.filter((g) => {
      if (cat !== 'ALL' && g.category !== cat) return false
      if (!needle) return true
      return (
        g.name.toLowerCase().includes(needle) ||
        g.code.toLowerCase().includes(needle) ||
        g.mfs.toLowerCase().includes(needle)
      )
    })
  }, [gateways, cat, q])

  useEffect(() => { setPage(1) }, [cat, q, pageSize])

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, pageCount)
  const paged = useMemo(
    () => filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filtered, safePage, pageSize]
  )

  const allShownSelected = paged.length > 0 && paged.every((g) => selected.has(g.id))

  function toggleSelectAll() {
    setSelected((prev) => {
      const n = new Set(prev)
      if (allShownSelected) paged.forEach((g) => n.delete(g.id))
      else paged.forEach((g) => n.add(g.id))
      return n
    })
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  const tabs: Array<{ key: Category; label: string }> = [
    { key: 'ALL', label: t('gwTabAll') },
    { key: 'MFS', label: t('gwTabMfsGateways') },
    { key: 'BANK', label: t('gwTabBankGateways') },
    { key: 'GLOBAL', label: t('gwTabGlobalGateways') },
  ]

  const configDefs = useMemo(() => {
    if (!editing) return []
    return gatewayConfigFields({
      code: editing.code,
      mfs: editing.mfs,
      category: editing.category,
      type: editing.type,
      accountType: editing.accountType,
      method: methodOf(editing),
    })
  }, [editing])

  const accountLabel = useMemo(() => {
    if (!editing) return t('gwMobileNumber')
    return accountFieldLabel({ code: editing.code, category: editing.category, method: methodOf(editing) })
  }, [editing, t])

  const isBankRow = editing?.category === 'BANK' && editing?.type !== 'API'

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      <PageHeader
        icon={<Network className="h-5 w-5" />}
        title={t('gwTitle')}
        description={t('gwDesc')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              className="press min-h-10 gap-1.5 rounded-lg bg-violet-600 text-white hover:bg-violet-700"
              onClick={openNewGateway}
            >
              <Plus className="h-4 w-4" /> {t('gwNewGateway')}
            </Button>
            <Button
              className="press min-h-10 gap-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700"
              onClick={() => { setBankForm(blankBankForm()); setNewBankOpen(true) }}
            >
              <Plus className="h-4 w-4" /> {t('gwNewBank')}
            </Button>
            <Button variant="outline" className="press min-h-10 gap-1.5" onClick={load} aria-label={t('refresh')}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        }
      />

      {/* Category tabs — reference-style centered group */}
      <div className="flex justify-start lg:justify-center">
        <div className="flex flex-wrap items-center gap-1 rounded-xl border bg-card p-1.5" role="tablist" aria-label={t('gwTitle')}>
          {tabs.map((tb) => (
            <button
              key={tb.key}
              type="button"
              role="tab"
              aria-selected={cat === tb.key}
              className={cn(
                'press rounded-lg px-3.5 py-2 text-xs font-bold transition-colors sm:px-4',
                cat === tb.key
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
              onClick={() => sp.set({ cat: tb.key === 'ALL' ? null : tb.key })}
            >
              {tb.label}
            </button>
          ))}
        </div>
      </div>

      {error && !loading ? (
        <ErrorCard message={error} onRetry={load} />
      ) : loading && !gateways ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : (gateways ?? []).length === 0 ? (
        /* ── Blank state — reference: "Nothing Here Yet" ── */
        <div className="rounded-xl border bg-card shadow-brand">
          <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Network className="h-7 w-7" />
            </span>
            <p className="text-base font-bold text-foreground">{t('gwNothingHere')}</p>
            <p className="text-sm text-muted-foreground">{t('gwNothingHereHint')}</p>
            <p className="max-w-sm text-xs text-muted-foreground/80">{t('gwNothingHereCta')}</p>
          </div>
        </div>
      ) : (
        <>
          {/* Bulk action bar */}
          {selected.size > 0 && (
            <div className="anim-fade-up flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-4 py-2.5">
              <span className="text-xs font-bold text-foreground">{selected.size} selected</span>
              <Button variant="outline" size="sm" className="press h-8" onClick={() => bulk(true)}>{t('gwEnable')}</Button>
              <Button variant="outline" size="sm" className="press h-8" onClick={() => bulk(false)}>{t('gwDisable')}</Button>
              <Button variant="outline" size="sm" className="press h-8 text-destructive hover:text-destructive" onClick={() => bulk('delete')}>
                <Trash2 className="h-3.5 w-3.5" /> {t('gwDelete')}
              </Button>
              <Button variant="ghost" size="sm" className="press ml-auto h-8" onClick={() => setSelected(new Set())}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}

          {/* ── Table card (md+) — reference: GATEWAY | CURRENCY | STATUS ── */}
          <div className="hidden rounded-xl border bg-card shadow-brand md:block">
            {/* controls row */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{t('gwShowEntries')}</span>
                <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                  <SelectTrigger className="h-8 w-[72px]" aria-label={t('gwShowEntries')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZES.map((s) => (
                      <SelectItem key={s} value={String(s)}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span>{t('gwEntries')}</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">{t('gwSearchLabel')}</span>
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={t('gwSearchAllPh')}
                  className="h-8 w-44"
                  aria-label={t('gwSearchLabel')}
                />
              </div>
            </div>

            <div className="overflow-x-auto nice-scroll">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">
                    <th className="w-10 px-4 py-3">
                      <Checkbox
                        checked={allShownSelected}
                        onCheckedChange={toggleSelectAll}
                        aria-label={t('gwTabAll')}
                      />
                    </th>
                    <th className="px-4 py-3">{t('gwColGateway')}</th>
                    <th className="px-4 py-3">{t('gwColCurrency')}</th>
                    <th className="px-4 py-3">{t('gwColStatus')}</th>
                    <th className="w-20 px-4 py-3 text-right">
                      <SlidersHorizontal className="ml-auto h-3.5 w-3.5" aria-hidden />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((g) => (
                    <tr
                      key={g.id}
                      className="group cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/30"
                      onClick={() => openEdit(g)}
                    >
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selected.has(g.id)}
                          onCheckedChange={() => toggleSelect(g.id)}
                          aria-label={g.name}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {g.logoUrl ? (
                            <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white ring-1 ring-black/5">
                              { }
                              <img src={g.logoUrl} alt="" className="h-full w-full object-contain p-1" />
                            </span>
                          ) : (
                            <GatewayLogo code={g.code} mfs={g.mfs} color={g.color} size={40} />
                          )}
                          <div className="min-w-0">
                            <p className={cn('truncate text-sm font-bold', !g.enabled && 'text-muted-foreground')}>{g.name}</p>
                            <p className="truncate font-mono text-[11px] text-muted-foreground">{g.code}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
                          {g.currency ?? '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className={cn(
                            'press inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 text-[11px] font-extrabold transition-colors',
                            g.enabled ? 'bg-green-500/15 text-green-700 dark:text-green-400' : 'bg-muted text-muted-foreground'
                          )}
                          onClick={() => toggleEnabled(g, !g.enabled)}
                          disabled={savingId === g.id}
                          aria-label={`${g.name} — ${g.enabled ? t('gwStatusActive') : t('gwStatusInactive')}`}
                        >
                          <span className={cn('h-1.5 w-1.5 rounded-full', g.enabled ? 'bg-green-500' : 'bg-muted-foreground')} />
                          {g.enabled ? t('gwStatusActive') : t('gwStatusInactive')}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                          onClick={() => setConfirmDelete(g)}
                          aria-label={`${t('gwDelete')} ${g.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {paged.length === 0 && (
                    <tr>
                      <td colSpan={5}>
                        <div className="flex flex-col items-center gap-1.5 py-10 text-center">
                          <p className="text-sm font-bold text-foreground">{t('gwEmpty')}</p>
                          <p className="text-xs text-muted-foreground">{t('gwEmptyHint')}</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* footer row */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-xs text-muted-foreground">
              <span>
                {filtered.length === 0
                  ? `Showing 0 to 0 of 0 entries`
                  : `${t('gwShowing')} ${(safePage - 1) * pageSize + 1} ${t('gwTo')} ${Math.min(safePage * pageSize, filtered.length)} ${t('gwOf')} ${filtered.length} ${t('gwEntries')}`}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline" size="icon" className="h-8 w-8"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                {Array.from({ length: pageCount }).slice(0, 6).map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    className={cn(
                      'press h-8 min-w-8 rounded-lg border px-2 text-xs font-bold transition-colors',
                      safePage === i + 1 ? 'border-primary bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:border-primary/40'
                    )}
                    onClick={() => setPage(i + 1)}
                  >
                    {i + 1}
                  </button>
                ))}
                <Button
                  variant="outline" size="icon" className="h-8 w-8"
                  disabled={safePage >= pageCount}
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  aria-label="Next page"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* ── Mobile card list ── */}
          <div className="space-y-3 md:hidden">
            {paged.map((g) => (
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
                  {g.logoUrl ? (
                    <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white ring-1 ring-black/5">
                      { }
                      <img src={g.logoUrl} alt="" className="h-full w-full object-contain p-1" />
                    </span>
                  ) : (
                    <GatewayLogo code={g.code} mfs={g.mfs} color={g.color} size={40} />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-foreground">{g.name}</p>
                    <p className="truncate font-mono text-[11px] text-muted-foreground">{g.code}</p>
                  </div>
                  <span
                    data-noclick
                    className="flex min-h-10 items-center"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      className={cn(
                        'press inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 text-[11px] font-extrabold',
                        g.enabled ? 'bg-green-500/15 text-green-700 dark:text-green-400' : 'bg-muted text-muted-foreground'
                      )}
                      onClick={() => toggleEnabled(g, !g.enabled)}
                      disabled={savingId === g.id}
                    >
                      <span className={cn('h-1.5 w-1.5 rounded-full', g.enabled ? 'bg-green-500' : 'bg-muted-foreground')} />
                      {g.enabled ? t('gwStatusActive') : t('gwStatusInactive')}
                    </button>
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between border-t pt-2.5 text-[11px] text-muted-foreground">
                  <span className="font-mono">{g.currency ?? '—'}</span>
                  <span
                    data-noclick
                    className="inline-flex items-center gap-1 text-destructive"
                    onClick={(e) => { e.stopPropagation(); setConfirmDelete(g) }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); setConfirmDelete(g) } }}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> {t('gwDelete')}
                  </span>
                </div>
              </div>
            ))}
            {paged.length === 0 && (
              <EmptyState
                icon={<Network className="h-10 w-10" />}
                title={t('gwEmpty')}
                hint={t('gwEmptyHint')}
              />
            )}
          </div>
        </>
      )}

      {/* ── New Gateway dialog — reference: "Gateway * / Select gateway" ── */}
      <Dialog open={newGatewayOpen} onOpenChange={setNewGatewayOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('gwNewGateway')}</DialogTitle>
            <DialogDescription>{t('gwSelectGateway')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Field label={t('gwSelectGateway')} required htmlFor="new-gw-code">
              <Select value={newCode} onValueChange={setNewCode}>
                <SelectTrigger id="new-gw-code" className="min-h-10 w-full">
                  <SelectValue placeholder={t('gwSelectGatewayPh')} />
                </SelectTrigger>
                <SelectContent className="max-h-80">
                  {catalog.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      <span className="flex items-center gap-2">
                        <GatewayLogo code={c.code} mfs={c.mfs} color={c.color} size={20} />
                        <span>{c.name}</span>
                      </span>
                    </SelectItem>
                  ))}
                  {catalog.length === 0 && (
                    <div className="px-3 py-6 text-center text-xs text-muted-foreground">{t('gwEmpty')}</div>
                  )}
                </SelectContent>
              </Select>
            </Field>
            {newCode && (
              <div className="flex items-center gap-3 rounded-xl border bg-muted/30 p-3">
                <GatewayLogo code={newCode} mfs={catalog.find((c) => c.code === newCode)?.mfs} size={36} />
                <div className="min-w-0 text-xs">
                  <p className="font-bold text-foreground">{catalog.find((c) => c.code === newCode)?.name}</p>
                  <p className="font-mono text-muted-foreground">{newCode}</p>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" className="press min-h-10" onClick={() => setNewGatewayOpen(false)}>
              {t('cancel')}
            </Button>
            <Button
              className="press min-h-10 bg-violet-600 text-white hover:bg-violet-700"
              disabled={!newCode || creating}
              onClick={createFromCatalog}
            >
              {t('gwCreate')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── New Bank dialog — full PipraPay bank form ── */}
      <Dialog open={newBankOpen} onOpenChange={(o) => { if (!o) { setNewBankOpen(false); setBankForm(null) } }}>
        <DialogContent className="max-h-[92vh] overflow-hidden sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Landmark className="h-4 w-4 text-green-600" /> {t('gwNewBank')}
            </DialogTitle>
            <DialogDescription>{t('gwSectionConfiguration')} — {t('gwTabBankGateways')}</DialogDescription>
          </DialogHeader>

          {bankForm && (
            <div className="nice-scroll max-h-[62vh] space-y-3.5 overflow-y-auto pr-1">
              <Section title={t('gwSectionInformation')}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={t('gwGatewayName')} required htmlFor="bank-name">
                    <Input id="bank-name" value={bankForm.name} onChange={(e) => setBankForm({ ...bankForm, name: e.target.value })} className="h-10" />
                  </Field>
                  <Field label={t('gwDisplayName')} htmlFor="bank-display">
                    <Input id="bank-display" value={bankForm.displayName} onChange={(e) => setBankForm({ ...bankForm, displayName: e.target.value })} className="h-10" />
                  </Field>
                  <Field label={t('gwMinAmount')} required htmlFor="bank-min">
                    <SuffixInput id="bank-min" value={bankForm.minAmount} onChange={(v) => setBankForm({ ...bankForm, minAmount: v })} suffix={bankForm.currency || 'BDT'} inputMode="decimal" placeholder="0" />
                  </Field>
                  <Field label={t('gwMaxAmount')} required htmlFor="bank-max">
                    <SuffixInput id="bank-max" value={bankForm.maxAmount} onChange={(v) => setBankForm({ ...bankForm, maxAmount: v })} suffix={bankForm.currency || 'BDT'} inputMode="decimal" placeholder="∞" />
                  </Field>
                  <Field label={t('gwChargeFixed')} required htmlFor="bank-cf">
                    <SuffixInput id="bank-cf" value={bankForm.chargeFixed} onChange={(v) => setBankForm({ ...bankForm, chargeFixed: v })} suffix={bankForm.currency || 'BDT'} inputMode="decimal" />
                  </Field>
                  <Field label={t('gwChargePercent')} required htmlFor="bank-cp">
                    <SuffixInput id="bank-cp" value={bankForm.chargePercent} onChange={(v) => setBankForm({ ...bankForm, chargePercent: v })} suffix="%" inputMode="decimal" />
                  </Field>
                  <Field label={t('gwDiscountFixed')} required htmlFor="bank-df">
                    <SuffixInput id="bank-df" value={bankForm.discountFixed} onChange={(v) => setBankForm({ ...bankForm, discountFixed: v })} suffix={bankForm.currency || 'BDT'} inputMode="decimal" />
                  </Field>
                  <Field label={t('gwDiscountPercent')} required htmlFor="bank-dp">
                    <SuffixInput id="bank-dp" value={bankForm.discountPercent} onChange={(v) => setBankForm({ ...bankForm, discountPercent: v })} suffix="%" inputMode="decimal" />
                  </Field>
                  <Field label={t('gwCurrency')} required>
                    <Select value={bankForm.currency} onValueChange={(v) => setBankForm({ ...bankForm, currency: v })}>
                      <SelectTrigger className="min-h-10 w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                  </Field>
                  <Field label={t('gwStatus')} required>
                    <Select value={bankForm.enabled ? '1' : '0'} onValueChange={(v) => setBankForm({ ...bankForm, enabled: v === '1' })}>
                      <SelectTrigger className="min-h-10 w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">{t('gwStatusActive')}</SelectItem>
                        <SelectItem value="0">{t('gwStatusInactive')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
              </Section>

              <Section title={t('gwSectionAssets')}>
                <ImageField
                  id="bank-logo"
                  label={t('gwGatewayLogo')}
                  value={bankForm.logoUrl}
                  onChange={(v) => setBankForm({ ...bankForm, logoUrl: v })}
                  hint={t('gwLogoHint')}
                  wide
                  removeLabel={t('gwRemoveLogo')}
                  uploadLabel={t('gwUploadLogo')}
                />
              </Section>

              <Section title={t('gwSectionColors')}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <ColorField id="bank-c1" label={t('gwPrimaryColor')} value={bankForm.color} onChange={(v) => setBankForm({ ...bankForm, color: v })} required />
                  <ColorField id="bank-c2" label={t('gwTextColor')} value={bankForm.textColor} onChange={(v) => setBankForm({ ...bankForm, textColor: v })} required />
                  <ColorField id="bank-c3" label={t('gwButtonColor')} value={bankForm.buttonColor} onChange={(v) => setBankForm({ ...bankForm, buttonColor: v })} required />
                  <ColorField id="bank-c4" label={t('gwButtonTextColor')} value={bankForm.buttonText} onChange={(v) => setBankForm({ ...bankForm, buttonText: v })} required />
                </div>
              </Section>

              <Section title={t('gwSectionConfiguration')}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={t('gwBankName')} required htmlFor="bank-bn">
                    <Input id="bank-bn" value={bankForm.bankName} onChange={(e) => setBankForm({ ...bankForm, bankName: e.target.value })} className="h-10" />
                  </Field>
                  <Field label={t('gwHolderName')} required htmlFor="bank-hn">
                    <Input id="bank-hn" value={bankForm.holderName} onChange={(e) => setBankForm({ ...bankForm, holderName: e.target.value })} className="h-10" />
                  </Field>
                  <Field label={t('gwAccountNumber')} required htmlFor="bank-an">
                    <Input id="bank-an" value={bankForm.accountNumber} onChange={(e) => setBankForm({ ...bankForm, accountNumber: e.target.value })} className="h-10" />
                  </Field>
                  <Field label={t('gwBranchName')} required htmlFor="bank-br">
                    <Input id="bank-br" value={bankForm.branchName} onChange={(e) => setBankForm({ ...bankForm, branchName: e.target.value })} className="h-10" />
                  </Field>
                  <Field label={t('gwRoutingNumber')} required htmlFor="bank-rn">
                    <Input id="bank-rn" value={bankForm.routingNumber} onChange={(e) => setBankForm({ ...bankForm, routingNumber: e.target.value })} className="h-10" />
                  </Field>
                  <Field label={t('gwSwift')} required htmlFor="bank-sw">
                    <Input id="bank-sw" value={bankForm.swiftCode} onChange={(e) => setBankForm({ ...bankForm, swiftCode: e.target.value })} className="h-10" />
                  </Field>
                </div>
              </Section>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" className="press min-h-10" onClick={() => { setNewBankOpen(false); setBankForm(null) }}>
              {t('cancel')}
            </Button>
            <Button
              className="press min-h-10 bg-green-600 text-white hover:bg-green-700"
              disabled={busy}
              onClick={createBank}
            >
              {t('gwCreate')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Gateway Setting dialog — Information / Assets / Colors / Configuration ── */}
      <Dialog open={!!editing && !!form} onOpenChange={(o) => { if (!o) { setEditing(null); setForm(null) } }}>
        <DialogContent className="max-h-[92vh] overflow-hidden sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-primary" /> {t('gwGatewaySetting')}
            </DialogTitle>
            <DialogDescription className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono">{editing?.code}</span>
              {editing && (
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                  {editing.category} · {editing.type}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          {form && editing && (
            <div className="nice-scroll max-h-[62vh] space-y-3.5 overflow-y-auto pr-1">
              {/* Live preview strip */}
              <div
                className="flex items-center gap-3 rounded-xl p-3.5 shadow-brand"
                style={{ background: safeHex(form.color, '#2563EB'), color: safeHex(form.textColor, '#FFFFFF') }}
              >
                {form.logoUrl ? (
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white/95 p-1">
                    { }
                    <img src={form.logoUrl} alt="" className="h-full w-full object-contain" />
                  </span>
                ) : (
                  <GatewayLogo code={editing.code} mfs={editing.mfs} color={form.color} size={44} />
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">{form.displayName || form.name || editing.code}</p>
                  <p className="text-[11px] opacity-80">{form.accountNumber.trim() || '01XXXXXXXXX'}</p>
                </div>
                <span
                  className="ml-auto shrink-0 rounded-lg px-4 py-2 text-xs font-extrabold"
                  style={{ background: safeHex(form.buttonColor, form.color), color: safeHex(form.buttonText, form.textColor) }}
                >
                  {t('cpubVerify')}
                </span>
              </div>

              <Section title={t('gwSectionInformation')}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={t('gwGatewayName')} required htmlFor="gw-name">
                    <Input id="gw-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-10" />
                  </Field>
                  <Field label={t('gwDisplayName')} htmlFor="gw-display" hint={t('gwDisplayNameHint')}>
                    <Input id="gw-display" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} className="h-10" />
                  </Field>
                  <Field label={t('gwMinAmount')} required htmlFor="gw-min">
                    <SuffixInput id="gw-min" value={form.minAmount} onChange={(v) => setForm({ ...form, minAmount: v })} suffix={form.currency || 'BDT'} inputMode="decimal" placeholder="0" />
                  </Field>
                  <Field label={t('gwMaxAmount')} required htmlFor="gw-max">
                    <SuffixInput id="gw-max" value={form.maxAmount} onChange={(v) => setForm({ ...form, maxAmount: v })} suffix={form.currency || 'BDT'} inputMode="decimal" placeholder="∞" />
                  </Field>
                  <Field label={t('gwChargeFixed')} required htmlFor="gw-cfixed">
                    <SuffixInput id="gw-cfixed" value={form.chargeFixed} onChange={(v) => setForm({ ...form, chargeFixed: v })} suffix={form.currency || 'BDT'} inputMode="decimal" />
                  </Field>
                  <Field label={t('gwChargePercent')} required htmlFor="gw-cpct">
                    <SuffixInput id="gw-cpct" value={form.chargePercent} onChange={(v) => setForm({ ...form, chargePercent: v })} suffix="%" inputMode="decimal" />
                  </Field>
                  <Field label={t('gwDiscountFixed')} required htmlFor="gw-dfixed">
                    <SuffixInput id="gw-dfixed" value={form.discountFixed} onChange={(v) => setForm({ ...form, discountFixed: v })} suffix={form.currency || 'BDT'} inputMode="decimal" />
                  </Field>
                  <Field label={t('gwDiscountPercent')} required htmlFor="gw-dpct">
                    <SuffixInput id="gw-dpct" value={form.discountPercent} onChange={(v) => setForm({ ...form, discountPercent: v })} suffix="%" inputMode="decimal" />
                  </Field>
                  <Field label={t('gwCurrency')} required>
                    <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                      <SelectTrigger className="min-h-10 w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                  </Field>
                  <Field label={t('gwStatus')} required>
                    <Select value={form.enabled ? '1' : '0'} onValueChange={(v) => setForm({ ...form, enabled: v === '1' })}>
                      <SelectTrigger className="min-h-10 w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">{t('gwStatusActive')}</SelectItem>
                        <SelectItem value="0">{t('gwStatusInactive')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label={t('gwAccountType')}>
                    <Select value={form.accountType} onValueChange={(v) => setForm({ ...form, accountType: v })}>
                      <SelectTrigger className="min-h-10 w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PERSONAL">{t('gwPersonal')}</SelectItem>
                        <SelectItem value="AGENT">{t('gwAgent')}</SelectItem>
                        <SelectItem value="MERCHANT">{t('gwMerchant')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
              </Section>

              <Section title={t('gwSectionAssets')}>
                <ImageField
                  id="gw-logo"
                  label={t('gwGatewayLogo')}
                  value={form.logoUrl}
                  onChange={(v) => setForm({ ...form, logoUrl: v })}
                  hint={t('gwLogoHint')}
                  wide
                  removeLabel={t('gwRemoveLogo')}
                  uploadLabel={t('gwUploadLogo')}
                />
                {qrAvailable(editing) && (
                  <ImageField
                    id="gw-qr"
                    label={t('gwQrCode')}
                    value={form.qrImage}
                    onChange={(v) => setForm({ ...form, qrImage: v })}
                    hint={t('gwQrHint')}
                    removeLabel={t('gwRemoveLogo')}
                    uploadLabel={t('gwQrUpload')}
                  />
                )}
              </Section>

              <Section title={t('gwSectionColors')}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <ColorField id="gw-c1" label={t('gwPrimaryColor')} value={form.color} onChange={(v) => setForm({ ...form, color: v })} required />
                  <ColorField id="gw-c2" label={t('gwTextColor')} value={form.textColor} onChange={(v) => setForm({ ...form, textColor: v })} required />
                  <ColorField id="gw-c3" label={t('gwButtonColor')} value={form.buttonColor} onChange={(v) => setForm({ ...form, buttonColor: v })} required />
                  <ColorField id="gw-c4" label={t('gwButtonTextColor')} value={form.buttonText} onChange={(v) => setForm({ ...form, buttonText: v })} required />
                </div>
              </Section>

              <Section title={t('gwSectionConfiguration')}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={accountLabel} required htmlFor="gw-number" hint={t('gwAccountHint')}>
                    <Input
                      id="gw-number"
                      value={form.accountNumber}
                      inputMode="text"
                      autoComplete="off"
                      placeholder={editing.category === 'BANK' ? 'Account number' : '01XXXXXXXXX'}
                      onChange={(e) => setForm({ ...form, accountNumber: e.target.value })}
                      className="h-10"
                    />
                  </Field>
                  <Field label={t('gwAllowPending')} required hint={t('gwAllowPendingHint')}>
                    <Select value={form.allowPending} onValueChange={(v) => setForm({ ...form, allowPending: v as 'ENABLED' | 'DISABLED' })}>
                      <SelectTrigger className="min-h-10 w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ENABLED">{t('gwEnable')}</SelectItem>
                        <SelectItem value="DISABLED">{t('gwDisable')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  {editing.type === 'API' && (
                    <Field label={t('gwIpnUrl')} htmlFor="gw-ipn" hint={t('gwIpnHint')}>
                      <Input id="gw-ipn" value={form.ipnUrl} onChange={(e) => setForm({ ...form, ipnUrl: e.target.value })} className="h-10" placeholder="https://…" />
                    </Field>
                  )}
                  <Field label={t('gwSupportedLanguages')}>
                    <Select value={form.supportedLanguages} onValueChange={(v) => setForm({ ...form, supportedLanguages: v })}>
                      <SelectTrigger className="min-h-10 w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {LANG_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  {configDefs.map((def) => {
                    if (def.key === 'mode') {
                      return (
                        <Field key={def.key} label={t('gwMode')} required>
                          <Select value={form.mode || 'LIVE'} onValueChange={(v) => setForm({ ...form, mode: v })}>
                            <SelectTrigger className="min-h-10 w-full"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="LIVE">{t('gwModeLive')}</SelectItem>
                              <SelectItem value="SANDBOX">{t('gwModeSandbox')}</SelectItem>
                            </SelectContent>
                          </Select>
                        </Field>
                      )
                    }
                    return (
                      <ConfigFieldInput
                        key={def.key}
                        def={def}
                        value={configVals[def.key] ?? ''}
                        onChange={(v) => setConfigVals((c) => ({ ...c, [def.key]: v }))}
                        secretHint={t('gwSecretKeepHint')}
                      />
                    )
                  })}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="gw-instructions" className="text-xs font-semibold text-foreground/85">{t('gwInstructions')}</Label>
                  <Textarea
                    id="gw-instructions"
                    value={form.instructions}
                    rows={3}
                    onChange={(e) => setForm({ ...form, instructions: e.target.value })}
                    className="min-h-[72px]"
                  />
                  <p className="text-[11px] text-muted-foreground">{t('gwInstructionsHint')}</p>
                </div>
              </Section>
            </div>
          )}

          <DialogFooter className="sm:justify-between">
            {editing && (
              <Button
                variant="ghost"
                className="press min-h-10 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setConfirmDelete(editing)}
              >
                <Trash2 className="h-4 w-4" /> {t('gwDelete')}
              </Button>
            )}
            <div className="flex gap-2">
              <Button variant="outline" className="press min-h-10" onClick={() => { setEditing(null); setForm(null) }}>
                {t('cancel')}
              </Button>
              <Button className="press min-h-10" disabled={busy || !form?.name.trim()} onClick={saveEdit}>
                {t('saveChanges')}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirm ── */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => { if (!o) setConfirmDelete(null) }}>
        <AlertDialogContent className="max-w-sm rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('gwDeleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete?.name} — {t('gwDeleteBody')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="press">{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="press bg-destructive text-white hover:bg-destructive/90"
              onClick={() => confirmDelete && doDelete(confirmDelete)}
            >
              {t('gwDelete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}



