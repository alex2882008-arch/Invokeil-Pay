'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import QRCode from 'qrcode'
import {
  ArrowLeft, ArrowRight, Check, CheckCircle2, Clock, Copy, Headphones,
  Info, Loader2, Lock, Moon, QrCode, RefreshCw, ShieldCheck, Sun, X, XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { formatBDT, formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useLang } from '@/lib/i18n'
import { useTheme } from '@/hooks/use-theme'
import {
  gatewayStructuredSteps, methodLabelEn, methodLabelBn,
  type InstructionStep,
} from '@/lib/gateways'
import {
  CheckoutTab, ChromeFooter, CopyRow, GatewayTileGrid, LoadingSkeleton,
  ProductSummaryCard, SupportBlock, TopBar, TAB_META, fmtRemaining,
  formatRefMoney, tabOf,
  type BrandLike, type GatewayLike,
} from './checkout-chrome'
import { GatewayCardLogos, GatewayLogo } from './gateway-logo'
import { CopyButton } from './ui-bits'

// ── Public checkout page (/pay/[token]) — reference-style money page ─────────
// Two-view flow exactly like the reference screenshots:
//   1. Gateway picker — brand logo + name (Brand Settings), segmented
//      "Mobile Banking / Net Banking / Global" tabs, 3-col logo grid,
//      "Pay Now (amount)" footer.
//   2. Per-gateway view — back arrow, gateway logo, PipraPay-exact colored
//      instruction box with inline copy buttons, Transaction/Order ID input,
//      sender number and a full-width Verify button in the gateway's colors.
// Responsive: mobile-first card, sticky brand summary on lg+ screens, EN+BN,
// light/dark themes, micro-animations everywhere.

interface FieldDef {
  name: string
  label: string
  required: boolean
}

interface CheckoutDTO {
  token: string
  title: string
  description: string | null
  amount: number
  currency: string
  status: string
  mfs: string
  gatewayCode: string | null
  customFields: FieldDef[] | null
  answers: Record<string, string> | null
  expiresAt: string | null
  paidAt: string | null
  paidTrxId: string | null
  customerName: string | null
  successUrl: string | null
}

interface FaqDTO {
  question: string
  answer: string
}

interface PayPayload {
  checkout: CheckoutDTO
  brand: BrandLike
  payTo: {
    bkash: string
    nagad: string
    rocket: string
    upay: string
    bank_hint: string
    number_tap: string
    number_telecash: string
    number_mcash: string
    number_okwallet: string
  }
  gateways: GatewayLike[]
  faqs: FaqDTO[]
}

type Phase = 'loading' | 'form' | 'awaiting' | 'paid' | 'cancelled' | 'expired' | 'not_found'

const POLL_INTERVAL_MS = 4000
const POLL_MAX_MS = 10 * 60_000
const FALLBACK_COLOR = '#2563EB'

function normalizeBdClient(raw: string): string {
  return raw.replace(/[^0-9+]/g, '').replace(/^\+?88/, '').replace(/\D/g, '')
}

function gatewayMethod(g: GatewayLike): string | undefined {
  return (g as GatewayLike & { method?: string }).method
}

function gatewayHasQr(g: GatewayLike): boolean {
  return (g as GatewayLike & { hasQr?: boolean }).hasQr ?? true
}

/** "500.00BDT" — reference-style footer amount (no space, no symbol). */
function amountNoSpace(n: number, currency: string): string {
  return `${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${currency}`
}

/** Inline white copy chip rendered inside the colored instruction box. */
function StepCopy({ value, tint }: { value: string; tint: string }) {
  const { t } = useLang()
  const [done, setDone] = useState(false)
  if (!value) return null
  return (
    <button
      type="button"
      className="ml-1.5 inline-flex h-6 w-6 shrink-0 translate-y-[3px] items-center justify-center rounded-md bg-white align-middle shadow-sm transition-transform active:scale-90"
      style={{ color: tint }}
      aria-label={t('copy')}
      onClick={async (e) => {
        e.preventDefault()
        e.stopPropagation()
        try {
          await navigator.clipboard.writeText(value)
        } catch {
          try {
            const ta = document.createElement('textarea')
            ta.value = value
            document.body.appendChild(ta)
            ta.select()
            document.execCommand('copy')
            document.body.removeChild(ta)
          } catch { /* clipboard unavailable */ }
        }
        setDone(true)
        toast.success(t('copied'))
        window.setTimeout(() => setDone(false), 1400)
      }}
    >
      {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  )
}

/** Small circular icon button used in the card headers (reference style). */
function CircleIconBtn({
  onClick, label, children,
}: {
  onClick: () => void
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="press flex h-9 w-9 items-center justify-center rounded-full border bg-card text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
    >
      {children}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────── Main view ──

export function CheckoutPublicView({ token }: { token: string }) {
  const { t, lang, setLang } = useLang()
  const { theme, setTheme } = useTheme()

  const [data, setData] = useState<PayPayload | null>(null)
  const [phase, setPhase] = useState<Phase>('loading')
  const [submitting, setSubmitting] = useState(false)
  const [pollTimedOut, setPollTimedOut] = useState(false)

  // form state
  const [view, setView] = useState<'pick' | 'pay'>('pick')
  const [selectedCode, setSelectedCode] = useState<string | null>(null)
  const [tab, setTab] = useState<CheckoutTab | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [senderNumber, setSenderNumber] = useState('')
  const [trxId, setTrxId] = useState('')
  // card form (visual — only a masked reference ever leaves the page)
  const [cardNumber, setCardNumber] = useState('')
  const [cardExpiry, setCardExpiry] = useState('')
  const [cardCvc, setCardCvc] = useState('')
  const [cardName, setCardName] = useState('')
  const [rememberCard, setRememberCard] = useState(false)

  // countdown + qr + dialogs
  const [remaining, setRemaining] = useState<number | null>(null)
  const [qrOpen, setQrOpen] = useState(false)
  const [qrData, setQrData] = useState<string | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [supportOpen, setSupportOpen] = useState(false)

  const expiryRefreshedRef = useRef(false)

  // ── Load the checkout (also used for expiry-hit and claim-failure refresh) ──
  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/pay/${encodeURIComponent(token)}`, { cache: 'no-store' })
      if (!res.ok) {
        setPhase((p) => (p === 'loading' ? 'not_found' : res.status === 404 ? 'not_found' : p))
        return
      }
      const d = (await res.json()) as PayPayload | null
      if (!d?.checkout) {
        setPhase((p) => (p === 'loading' ? 'not_found' : p))
        return
      }
      setData(d)
      const st = d.checkout.status
      if (st === 'PAID') setPhase('paid')
      else if (st === 'CANCELLED') setPhase('cancelled')
      else if (st === 'EXPIRED') setPhase('expired')
      else if (st === 'AWAITING') {
        setPollTimedOut(false)
        setPhase('awaiting')
      } else setPhase('form')
    } catch {
      setPhase((p) => (p === 'loading' ? 'not_found' : p))
    }
  }, [token])

  useEffect(() => {
    load()
  }, [load])

  // ── Expiry countdown: live tick, auto-refresh status when it hits 0 ──
  useEffect(() => {
    const exp = data?.checkout.expiresAt
    if (!exp || (phase !== 'form' && phase !== 'awaiting')) return
    const target = new Date(exp).getTime()
    if (isNaN(target)) return
    expiryRefreshedRef.current = false
    const tick = () => {
      const ms = target - Date.now()
      setRemaining(ms)
      if (ms <= 0 && !expiryRefreshedRef.current) {
        expiryRefreshedRef.current = true
        load()
      }
    }
    const first = window.setTimeout(tick, 0)
    const iv = window.setInterval(tick, 1000)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(iv)
    }
  }, [data?.checkout.expiresAt, phase, load])

  // ── Poll while awaiting verification (4s, paused when tab hidden, 10 min cap) ──
  useEffect(() => {
    if (phase !== 'awaiting') return
    let stopped = false
    let iv: ReturnType<typeof setInterval> | null = null
    const start = Date.now()
    const check = async () => {
      if (stopped || document.hidden) return
      if (Date.now() - start > POLL_MAX_MS) {
        stopped = true
        if (iv) clearInterval(iv)
        setPollTimedOut(true)
        return
      }
      try {
        const res = await fetch(`/api/pay/${encodeURIComponent(token)}`, { cache: 'no-store' })
        if (stopped || !res.ok) return
        const d = (await res.json()) as PayPayload | null
        if (stopped || !d?.checkout) return
        setData((prev) => (prev ? { ...prev, checkout: { ...prev.checkout, ...d.checkout } } : prev))
        const st = d.checkout.status
        if (st === 'PAID') setPhase('paid')
        else if (st === 'CANCELLED') setPhase('cancelled')
        else if (st === 'EXPIRED') setPhase('expired')
      } catch { /* transient network error — keep polling */ }
    }
    const first = window.setTimeout(check, 0)
    iv = setInterval(check, POLL_INTERVAL_MS)
    return () => {
      stopped = true
      window.clearTimeout(first)
      if (iv) clearInterval(iv)
    }
  }, [phase, token])

  // ── Derived data ──
  const checkout = data?.checkout ?? null
  const customFields = useMemo(() => checkout?.customFields ?? [], [checkout])

  const selectedGateway = useMemo(() => {
    const list = data?.gateways ?? []
    if (list.length === 0) return null
    const byCode = (code: string | null | undefined) =>
      code ? list.find((g) => g.code === code) ?? null : null
    return byCode(selectedCode) ?? byCode(checkout?.gatewayCode) ?? list[0]
  }, [data, selectedCode, checkout?.gatewayCode])

  const tabs = useMemo(() => {
    const set: CheckoutTab[] = []
    for (const g of data?.gateways ?? []) {
      const tb = tabOf(g)
      if (!set.includes(tb)) set.push(tb)
    }
    // keep reference order: Mobile Banking → Net Banking → Global
    return TAB_META.map((m) => m.id).filter((id) => set.includes(id))
  }, [data])

  const activeTab: CheckoutTab = tab ?? (selectedGateway ? tabOf(selectedGateway) : tabs[0] ?? 'MOBILE')

  // Keep the tab in sync with a gateway picked from elsewhere
  useEffect(() => {
    if (selectedGateway) setTab(tabOf(selectedGateway))
  }, [selectedGateway?.code])

  const visibleGateways = useMemo(
    () => (data?.gateways ?? []).filter((g) => tabOf(g) === activeTab),
    [data, activeTab]
  )

  const accountNumber = useMemo(() => {
    if (!selectedGateway) return null
    if (selectedGateway.accountNumber) return selectedGateway.accountNumber
    const payTo = data?.payTo
    if (!payTo) return null
    if (selectedGateway.mfs === 'BANK') return payTo.bank_hint || null
    const map: Record<string, string> = {
      bkash: payTo.bkash, nagad: payTo.nagad, rocket: payTo.rocket, upay: payTo.upay,
      tap: payTo.number_tap, telecash: payTo.number_telecash, mcash: payTo.number_mcash,
      okwallet: payTo.number_okwallet,
    }
    return map[selectedGateway.mfs.toLowerCase()] || null
  }, [selectedGateway, data?.payTo])

  const pricing = useMemo(() => {
    const amt = checkout?.amount ?? 0
    const g = selectedGateway
    const charge = g ? Math.round((g.chargeFixed + amt * (g.chargePercent / 100)) * 100) / 100 : 0
    const discount = g ? Math.round((g.discountFixed + amt * (g.discountPercent / 100)) * 100) / 100 : 0
    return { charge, discount, total: Math.round((amt + charge - discount) * 100) / 100 }
  }, [checkout?.amount, selectedGateway])

  const showCardForm = selectedGateway
    ? selectedGateway.code === 'CARD_MANUAL' || (activeTab === 'GLOBAL' && selectedGateway.category === 'GLOBAL' && selectedGateway.type === 'MANUAL' && gatewayMethod(selectedGateway) === 'CARD')
    : false

  const currency = checkout?.currency ?? 'BDT'
  const gwColor = selectedGateway?.color ?? FALLBACK_COLOR
  const gwTextColor = selectedGateway?.textColor || '#FFFFFF'
  const gwButtonColor = selectedGateway?.buttonColor || gwColor
  const gwButtonText = selectedGateway?.buttonText || '#FFFFFF'
  const isBinance = selectedGateway?.code.toUpperCase().startsWith('BINANCE') ?? false
  const isApiGw = selectedGateway
    ? selectedGateway.type === 'API' || gatewayMethod(selectedGateway) === 'API_CHECKOUT'
    : false

  const structuredSteps: InstructionStep[] = useMemo(() => {
    if (!selectedGateway) return []
    return gatewayStructuredSteps(
      {
        code: selectedGateway.code,
        mfs: selectedGateway.mfs,
        name: selectedGateway.name,
        accountType: selectedGateway.accountType,
        type: selectedGateway.type,
        method: gatewayMethod(selectedGateway),
        hasQr: gatewayHasQr(selectedGateway),
        instructions: selectedGateway.instructions,
      },
      lang,
      {
        number: accountNumber,
        amount: Number(pricing.total).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        currency,
      }
    )
  }, [selectedGateway, lang, accountNumber, pricing.total, currency])

  const rangeWarn = useMemo(() => {
    if (!checkout || !selectedGateway) return null
    const { amount } = checkout
    const { minAmount: min, maxAmount: max } = selectedGateway
    if (min != null && amount < min) {
      return t('cpubAmountRangeWarn').replace('{min}', formatBDT(min)).replace('{max}', max != null ? formatBDT(max) : '∞')
    }
    if (max != null && amount > max) {
      return t('cpubAmountRangeWarn').replace('{min}', min != null ? formatBDT(min) : formatBDT(0)).replace('{max}', formatBDT(max))
    }
    return null
  }, [checkout, selectedGateway, t])

  const fallbackNumbers = useMemo(() => {
    const p = data?.payTo
    if (!p) return []
    const out: Array<{ label: string; value: string }> = []
    if (p.bkash) out.push({ label: 'bKash', value: p.bkash })
    if (p.nagad) out.push({ label: 'Nagad', value: p.nagad })
    if (p.rocket) out.push({ label: 'Rocket', value: p.rocket })
    if (p.upay) out.push({ label: 'Upay', value: p.upay })
    if (p.bank_hint) out.push({ label: 'Bank', value: p.bank_hint })
    return out
  }, [data?.payTo])

  const gwBrandName = useMemo(() => {
    if (!selectedGateway) return ''
    const raw = selectedGateway.displayName || selectedGateway.name
    return (
      raw
        .replace(/\s*\((?:Personal|Agent|Merchant|DBBL|Tokenized API|Merchant API)\)\s*/gi, ' ')
        .replace(/\s+(Personal|Agent|Merchant)\s*$/i, '')
        .replace(/\s+/g, ' ')
        .trim() || selectedGateway.name
    )
  }, [selectedGateway])

  // ── Actions ──

  const openQr = async () => {
    setQrData(null)
    setQrOpen(true)
    try {
      if (selectedGateway?.qrImage) {
        setQrData(selectedGateway.qrImage)
        return
      }
      const payload = `Number: ${accountNumber ?? ''}\nAmount: ${formatRefMoney(pricing.total, currency)}`
      setQrData(await QRCode.toDataURL(payload, { width: 280, margin: 1 }))
    } catch {
      setQrData(null)
    }
  }

  const closePicker = () => {
    if (checkout?.successUrl) {
      window.location.href = checkout.successUrl
      return
    }
    if (typeof window !== 'undefined' && window.history.length > 1) {
      window.history.back()
    } else {
      window.location.href = '/'
    }
  }

  const submitClaim = async () => {
    if (!checkout) return
    const errs: Record<string, string> = {}
    for (const f of customFields) {
      if (f.required && !answers[f.name]?.trim()) errs[f.name] = t('cpubFieldRequired')
    }
    setFieldErrors(errs)
    if (Object.keys(errs).length > 0) return

    const phone = normalizeBdClient(senderNumber.trim())
    if (!/^01\d{9}$/.test(phone)) {
      toast.error(t('cpubNumberInvalid'))
      return
    }

    // Card flow — only a masked reference ever leaves the page (PCI-safe).
    let effectiveTrx = trxId.trim()
    if (showCardForm && !effectiveTrx && cardNumber.replace(/\D/g, '').length >= 12) {
      effectiveTrx = `CARD-${cardNumber.replace(/\D/g, '').slice(-4)}`
    }

    setSubmitting(true)
    try {
      const res = await fetch(`/api/pay/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'claim',
          senderNumber: phone,
          trxId: effectiveTrx || undefined,
          answers: customFields.length > 0 ? answers : undefined,
          gatewayCode: selectedGateway?.code ?? undefined,
        }),
      })
      const d = (await res.json().catch(() => null)) as { ok?: boolean; status?: string; error?: string } | null
      if (res.ok && d?.ok) {
        if (d.status === 'PAID') {
          await load()
          setPhase('paid')
          return
        }
        setPollTimedOut(false)
        setData((prev) => (prev ? { ...prev, checkout: { ...prev.checkout, status: 'AWAITING' } } : prev))
        setPhase('awaiting')
      } else if (res.status === 422 && d?.error === 'PENDING_DISABLED') {
        toast.error(t('cpubPendingDisabled'))
      } else if (res.status === 403) {
        toast.error(t('cpubBlocked'))
      } else {
        toast.error(t('cpubClaimFailed'))
        load() // picks up server-side state changes (e.g. expired)
      }
    } catch {
      toast.error(t('cpubClaimFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  const submitCancel = async () => {
    try {
      const res = await fetch(`/api/pay/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }),
      })
      const d = (await res.json().catch(() => null)) as { ok?: boolean } | null
      if (res.ok && d?.ok) {
        setData((prev) => (prev ? { ...prev, checkout: { ...prev.checkout, status: 'CANCELLED' } } : prev))
        setPhase('cancelled')
      } else {
        toast.error(t('cpubClaimFailed'))
      }
    } catch {
      toast.error(t('cpubClaimFailed'))
    }
  }

  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark')

  // ── Render ──

  if (phase === 'loading' || (!data && phase !== 'not_found')) {
    return <LoadingSkeleton />
  }

  const brand = data?.brand ?? null
  const faqs = data?.faqs ?? []
  const c = checkout

  // Chrome pieces shared by every screen
  const topBar = (
    <TopBar brand={brand}>
      <Button
        variant="ghost"
        size="icon"
        className="press h-9 w-9 rounded-full"
        onClick={toggleTheme}
        aria-label={t('cpubToggleTheme')}
      >
        {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="press h-9 rounded-full px-3.5 text-xs font-bold"
        onClick={() => setLang(lang === 'en' ? 'bn' : 'en')}
        aria-label={t('cpubToggleLang')}
      >
        {lang === 'en' ? 'বাংলা' : 'EN'}
      </Button>
    </TopBar>
  )

  // Terminal screens (expired / cancelled / not found)
  if (phase === 'expired' || phase === 'cancelled' || phase === 'not_found' || !c) {
    const term =
      phase === 'expired'
        ? { icon: <Clock className="h-14 w-14 text-amber-500" />, title: t('cpubExpiredTitle'), hint: t('cpubExpiredHint') }
        : phase === 'cancelled'
          ? { icon: <XCircle className="h-14 w-14 text-destructive" />, title: t('cpubCancelledTitle'), hint: t('cpubCancelledHint') }
          : { icon: <XCircle className="h-14 w-14 text-muted-foreground/50" />, title: t('cpubNotFoundTitle'), hint: t('cpubNotFoundHint') }
    return (
      <div className="flex min-h-screen flex-col bg-background">
        {topBar}
        <main className="flex flex-1 items-center justify-center px-4 py-10">
          <div className="anim-scale-in w-full max-w-md space-y-4">
            <div className="rounded-2xl border bg-card p-10 text-center shadow-brand-lg">
              <div className="flex justify-center">{term.icon}</div>
              <h1 className="mt-4 text-lg font-extrabold text-foreground">{term.title}</h1>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{term.hint}</p>
              {c && (
                <p className="tabular mt-4 rounded-xl bg-muted py-2.5 text-lg font-bold text-foreground">
                  {formatRefMoney(c.amount, c.currency)}
                </p>
              )}
            </div>
            <SupportBlock brand={brand} faqs={faqs} />
          </div>
        </main>
        <ChromeFooter brandName={brand?.name ?? 'Invokeil Pay'} />
      </div>
    )
  }

  // ── Success screen ──
  if (phase === 'paid') {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        {topBar}
        <main className="flex flex-1 items-center justify-center px-4 py-10">
          <div className="anim-scale-in w-full max-w-md rounded-2xl border bg-card p-8 text-center shadow-brand-lg">
            <div className="relative mx-auto h-24 w-24">
              <div className="absolute inset-0 flex items-center justify-center rounded-full bg-success/15">
                <CheckCircle2 className="h-14 w-14 text-success" />
              </div>
              <span className="anim-fade-up absolute -top-1 left-2 h-2.5 w-2.5 rounded-full bg-success" />
              <span className="anim-fade-up absolute -right-1 top-3 h-2 w-2 rounded-full bg-amber-400" style={{ animationDelay: '120ms' }} />
              <span className="anim-fade-up absolute -bottom-1 right-5 h-2 w-2 rounded-full bg-pink-500" style={{ animationDelay: '240ms' }} />
            </div>
            <h1 className="mt-5 text-xl font-extrabold text-foreground">{t('paidThanks')}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t('cpubSuccessHint')}</p>
            <p className="tabular mt-5 rounded-xl bg-success/10 py-3.5 text-2xl font-extrabold text-success">
              {formatRefMoney(c.amount, c.currency)}
            </p>
            {c.paidTrxId && (
              <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border bg-muted/40 px-4 py-2.5">
                <div className="min-w-0 text-left">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t('cpubTrxIdLabel')}</p>
                  <p className="break-all font-mono text-sm font-bold text-foreground">{c.paidTrxId}</p>
                </div>
                <CopyButton value={c.paidTrxId} compact className="shrink-0" />
              </div>
            )}
            {c.paidAt && (
              <p className="mt-3 text-xs text-muted-foreground">
                {t('cpubPaidAt')}: {formatDateTime(c.paidAt)}
              </p>
            )}
            {c.successUrl && (
              <Button
                className="press mt-6 h-11 w-full gap-2 text-sm font-bold"
                style={{ backgroundColor: FALLBACK_COLOR }}
                onClick={() => { window.location.href = c.successUrl as string }}
              >
                {t('cpubBackToMerchant')} <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </main>
        <ChromeFooter brandName={brand?.name ?? 'Invokeil Pay'} />
      </div>
    )
  }

  // ── Active screens (form / awaiting) ──
  const awaiting = phase === 'awaiting'
  const gwMethod = selectedGateway ? gatewayMethod(selectedGateway) : undefined
  const methodChip = selectedGateway
    ? (lang === 'bn' ? methodLabelBn(gwMethod ?? '') : methodLabelEn(gwMethod ?? ''))
    : ''

  const expiresChip = remaining != null && remaining > 0
    ? `${t('cpubExpiresIn')} ${fmtRemaining(remaining)}`
    : remaining != null && remaining <= 0
      ? t('expired')
      : null

  // ── View 1: gateway picker (reference image #1) ──
  const pickView = (
    <div className="anim-fade-up">
      {/* header: close + support/info */}
      <div className="flex items-center justify-between px-3.5 pt-3.5">
        <CircleIconBtn onClick={closePicker} label={t('cpubClose')}>
          <X className="h-4 w-4" />
        </CircleIconBtn>
        <div className="flex items-center gap-1.5">
          <CircleIconBtn onClick={() => setSupportOpen(true)} label={t('cpubContactSupport')}>
            <Headphones className="h-4 w-4" />
          </CircleIconBtn>
          <CircleIconBtn onClick={() => setDetailsOpen(true)} label={t('cpubPaymentDetails')}>
            <Info className="h-4 w-4" />
          </CircleIconBtn>
        </div>
      </div>

      {/* brand logo + name (Brand Settings) */}
      <div className="flex flex-col items-center gap-2 px-4 pb-1 pt-2.5">
        {brand?.logo ? (
           
          <img
            src={brand.logo}
            alt={brand.name}
            className="h-16 w-auto max-w-[190px] rounded-xl bg-white object-contain"
          />
        ) : (
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <ShieldCheck className="h-7 w-7" />
          </span>
        )}
        <p className="text-center text-lg font-extrabold leading-tight text-foreground">
          {brand?.name ?? 'Invokeil Pay'}
        </p>
      </div>

      {/* tabs — Mobile Banking / Net Banking / Global */}
      {tabs.length > 1 && (
        <div className="px-4 pt-3">
          <div className="grid grid-flow-col auto-cols-fr gap-1 rounded-xl border bg-muted/30 p-1" role="tablist">
            {TAB_META.filter((m) => tabs.includes(m.id)).map((m) => {
              const Icon = m.icon
              const isActive = activeTab === m.id
              return (
                <button
                  key={m.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => {
                    setTab(m.id)
                    const first = (data?.gateways ?? []).find((g) => tabOf(g) === m.id)
                    if (first) setSelectedCode(first.code)
                  }}
                  className={cn(
                    'press flex min-h-[42px] items-center justify-center gap-1 rounded-lg px-1 text-[10px] font-bold whitespace-nowrap transition-all duration-200 sm:text-xs',
                    isActive
                      ? 'bg-card text-primary shadow-sm ring-1 ring-primary/20'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" strokeWidth={isActive ? 2.4 : 2} />
                  <span className="min-w-0 overflow-hidden text-ellipsis">{t(m.labelKey)}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* gateway logo grid */}
      <div className="px-4 pt-3">
        {visibleGateways.length > 0 ? (
          <GatewayTileGrid
            gateways={visibleGateways}
            onPick={(code) => {
              setSelectedCode(code)
              setView('pay')
            }}
          />
        ) : (
          <p className="rounded-xl border border-dashed px-4 py-6 text-center text-xs text-muted-foreground">
            {t('cpubChooseMethod')}
          </p>
        )}
      </div>

      {/* reference footer: Pay Now (500.00BDT) */}
      <p className="pb-4 pt-4 text-center text-sm font-bold text-muted-foreground">
        {t('cpubPayNowAmount')} ({amountNoSpace(pricing.total, currency)})
      </p>
    </div>
  )

  // ── View 2: per-gateway payment (reference images #2–#4) ──
  const payView = selectedGateway && (
    <div className="anim-fade-up">
      {/* header: back + QR */}
      <div className="flex items-center justify-between px-3.5 pt-3.5">
        <CircleIconBtn onClick={() => setView('pick')} label={t('cpubChooseMethod')}>
          <ArrowLeft className="h-4 w-4" />
        </CircleIconBtn>
        <div className="flex items-center gap-1.5">
          {accountNumber && (gatewayHasQr(selectedGateway) || selectedGateway.qrImage) && (
            <CircleIconBtn onClick={() => { void openQr() }} label={t('cpubShowQr')}>
              <QrCode className="h-4 w-4" />
            </CircleIconBtn>
          )}
        </div>
      </div>

      {/* gateway logo */}
      <div className="flex justify-center px-4 pb-3 pt-2">
        {selectedGateway.logoUrl ? (
           
          <img
            src={selectedGateway.logoUrl}
            alt={selectedGateway.name}
            className="h-14 w-auto max-w-[190px] rounded-xl bg-white object-contain"
          />
        ) : (
          <GatewayLogo
            code={selectedGateway.code}
            mfs={selectedGateway.mfs}
            color={selectedGateway.color}
            size={56}
            variant="wordmark"
            className="max-w-[190px]"
          />
        )}
      </div>

      {/* PipraPay-exact colored instruction box with inline copy buttons */}
      {structuredSteps.length > 0 && !showCardForm && (
        <div className="px-4">
          <div
            className="anim-fade-up rounded-2xl px-4 py-4 shadow-brand"
            style={{ backgroundColor: gwColor, color: gwTextColor }}
            role="list"
            aria-label={t('cpubHowToPay')}
          >
            <ul className="space-y-2.5">
              {structuredSteps.map((s, i) => (
                <li key={i} className="flex items-start gap-2.5 text-[13px] leading-relaxed" role="listitem">
                  <span
                    aria-hidden
                    className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: gwTextColor, opacity: 0.9 }}
                  />
                  <span className="min-w-0 flex-1">
                    {s.text}
                    {s.strong && <span className="font-extrabold"> {s.strong}</span>}
                    {s.copy && <StepCopy value={s.copy} tint={gwColor} />}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* bank account details (bank gateways) */}
      {selectedGateway.category === 'BANK' && selectedGateway.type !== 'API' && (
        <div className="mt-3 space-y-2 px-4">
          {selectedGateway.accountNumber && (
            <CopyRow label={t('cpubAccountNumber')} value={selectedGateway.accountNumber} />
          )}
          {(selectedGateway as GatewayLike & { bankName?: string | null }).bankName && (
            <p className="text-xs text-muted-foreground">
              {(selectedGateway as GatewayLike & { bankName?: string | null }).bankName}
              {(selectedGateway as GatewayLike & { branchName?: string | null }).branchName
                ? ` · ${(selectedGateway as GatewayLike & { branchName?: string | null }).branchName}`
                : ''}
            </p>
          )}
        </div>
      )}

      {/* send-exactly + charges */}
      <div className="mt-3 space-y-2.5 px-4">
        {!showCardForm && (
          <div
            className="flex items-center justify-between gap-3 rounded-xl px-4 py-3"
            style={{ backgroundColor: `${gwColor}14` }}
          >
            <span className="text-xs font-semibold text-muted-foreground">{t('cpubSendExactly')}</span>
            <span className="tabular text-lg font-extrabold" style={{ color: gwColor }}>
              {formatRefMoney(pricing.total, currency)}
            </span>
          </div>
        )}

        {rangeWarn && (
          <p className="rounded-lg bg-warning/15 px-3 py-2 text-xs font-semibold text-amber-700 dark:text-amber-400">
            {rangeWarn}
          </p>
        )}

        {(pricing.charge > 0 || pricing.discount > 0) && (
          <div className="space-y-1.5 rounded-xl border bg-muted/30 px-4 py-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t('amount')}</span>
              <span className="tabular font-bold text-foreground">{formatRefMoney(c.amount, currency)}</span>
            </div>
            {pricing.charge > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t('cpubCharge')}</span>
                <span className="tabular font-bold text-amber-600 dark:text-amber-400">+{formatRefMoney(pricing.charge, currency)}</span>
              </div>
            )}
            {pricing.discount > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t('cpubYouSave')}</span>
                <span className="tabular font-bold text-success">−{formatRefMoney(pricing.discount, currency)}</span>
              </div>
            )}
            <div className="flex items-center justify-between border-t pt-1.5">
              <span className="font-bold text-foreground">{t('cpubTotal')}</span>
              <span className="tabular font-extrabold text-foreground">{formatRefMoney(pricing.total, currency)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Card form (Global tab) — reference layout, PCI-safe submit */}
      {showCardForm && (
        <div className="anim-fade-up mx-4 mt-3 space-y-3 rounded-xl border bg-muted/20 p-4">
          <div className="grid gap-1.5">
            <Label htmlFor="pub-card" className="text-xs font-semibold text-foreground/80">{t('cpubCardNumber')}</Label>
            <div className="relative">
              <Input
                id="pub-card"
                value={cardNumber}
                onChange={(e) => setCardNumber(e.target.value.replace(/[^\d ]/g, '').slice(0, 23))}
                placeholder="4242 4242 4242 4242"
                inputMode="numeric"
                autoComplete="cc-number"
                className="h-11 pr-24"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2">
                <GatewayCardLogos />
              </span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="pub-exp" className="text-xs font-semibold text-foreground/80">{t('cpubExpiryDate')}</Label>
              <Input
                id="pub-exp"
                value={cardExpiry}
                onChange={(e) => setCardExpiry(e.target.value.slice(0, 7))}
                placeholder="MM / YY"
                inputMode="numeric"
                autoComplete="cc-exp"
                className="h-11"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pub-cvc" className="text-xs font-semibold text-foreground/80">{t('cpubCvc')}</Label>
              <Input
                id="pub-cvc"
                value={cardCvc}
                onChange={(e) => setCardCvc(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="•••"
                inputMode="numeric"
                autoComplete="cc-csc"
                className="h-11"
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pub-name" className="text-xs font-semibold text-foreground/80">{t('cpubNameOnCard')}</Label>
            <Input
              id="pub-name"
              value={cardName}
              onChange={(e) => setCardName(e.target.value.slice(0, 60))}
              placeholder="AHMED RAHMAN"
              autoComplete="cc-name"
              className="h-11 uppercase"
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch id="pub-remember" checked={rememberCard} onCheckedChange={setRememberCard} />
            <Label htmlFor="pub-remember" className="text-xs text-muted-foreground">
              {t('cpubRememberCard')}{' '}
              <span className="cursor-pointer font-semibold text-success underline-offset-2 hover:underline">{t('cpubLearnMore')}</span>
            </Label>
          </div>
        </div>
      )}

      {/* custom fields */}
      {customFields.length > 0 && (
        <div className="mx-4 mt-3 space-y-3">
          <p className="text-xs font-bold text-foreground">{t('cpubAdditionalInfo')}</p>
          {customFields.map((f) => (
            <div key={f.name} className="grid gap-1.5">
              <Label htmlFor={`cf-${f.name}`} className="text-xs font-semibold text-foreground/80">
                {f.label} {f.required && <span className="text-destructive">*</span>}
              </Label>
              <Input
                id={`cf-${f.name}`}
                value={answers[f.name] ?? ''}
                onChange={(e) => setAnswers((a) => ({ ...a, [f.name]: e.target.value }))}
                maxLength={300}
                className="h-11"
                aria-invalid={!!fieldErrors[f.name]}
              />
              {fieldErrors[f.name] && (
                <p className="text-[11px] font-semibold text-destructive">{fieldErrors[f.name]}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Transaction/Order ID + sender number */}
      {!showCardForm && (
        <div className="mx-4 mt-3 grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="pub-trxid" className="text-sm font-semibold text-foreground">
              {isBinance ? t('cpubOrderIdField') : t('cpubTrxIdField')}
            </Label>
            <Input
              id="pub-trxid"
              value={trxId}
              onChange={(e) => setTrxId(e.target.value)}
              placeholder={isBinance ? t('cpubOrderIdPh') : t('cpubTrxIdPh')}
              maxLength={40}
              className="h-11"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pub-sender" className="text-sm font-semibold text-foreground">
              {t('cpubYourBrandNumber').replace('{brand}', gwBrandName)} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="pub-sender"
              value={senderNumber}
              onChange={(e) => setSenderNumber(e.target.value)}
              placeholder={t('cpubYourNumberPh')}
              inputMode="tel"
              autoComplete="tel"
              className="h-11"
            />
            <p className="text-[11px] text-muted-foreground">{t('cpubYourNumberHint')}</p>
          </div>
        </div>
      )}

      {/* terms + Verify button in the gateway's own colors */}
      <div className="mx-4 space-y-2.5 pb-4 pt-4">
        <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
          {t('cpubAgreeTo')}{' '}
          <a href="/legal/terms" target="_blank" rel="noopener noreferrer" className="font-bold text-success underline-offset-2 hover:underline">
            {t('cpubTerms')}
          </a>
        </p>
        <Button
          className="press h-[52px] w-full gap-2 rounded-xl text-[15px] font-extrabold tracking-wide"
          style={{ backgroundColor: gwButtonColor, color: gwButtonText }}
          onClick={() => submitClaim()}
          disabled={submitting}
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {isApiGw ? t('cpubPayNow') : t('cpubVerify')}
        </Button>
        {showCardForm && (
          <p className="flex items-center justify-center gap-2 pt-1 text-[11px] font-semibold text-muted-foreground">
            {t('cpubPayWith')} <GatewayCardLogos />
          </p>
        )}
      </div>
    </div>
  )

  // ── No gateways configured → fallback numbers flow ──
  const fallbackView = data && data.gateways.length === 0 && (
    <div className="anim-fade-up space-y-2 px-4 pb-4 pt-4">
      <p className="text-sm font-bold text-foreground">{t('sendMoneyTo')}</p>
      {fallbackNumbers.map((n) => (
        <CopyRow key={n.label} label={n.label} value={n.value} />
      ))}
      {fallbackNumbers.length === 0 && (
        <p className="rounded-xl border border-dashed px-4 py-3 text-center text-xs text-muted-foreground">
          {t('sendMoneyTo')}
        </p>
      )}
      <ol className="space-y-2 pt-2">
        {[t('cpubStep1'), t('cpubStep2'), t('cpubStep3'), t('cpubStep4')].map((s, i) => (
          <li key={i} className="flex items-start gap-2.5 text-xs leading-relaxed text-muted-foreground">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-extrabold text-primary">
              {i + 1}
            </span>
            {s}
          </li>
        ))}
      </ol>
      <p className="pt-1 text-center text-[11px] text-muted-foreground">
        {t('cpubAgreeTo')}{' '}
        <a href="/legal/terms" target="_blank" rel="noopener noreferrer" className="font-bold text-success underline-offset-2 hover:underline">
          {t('cpubTerms')}
        </a>
      </p>
    </div>
  )

  // ── Payment panel: picker ⇄ per-gateway, shared by mobile & desktop column ──
  const payPanel = (
    <div className="rounded-2xl border bg-card shadow-brand-lg">
      {awaiting ? null : data && data.gateways.length > 0
        ? (view === 'pick' ? pickView : payView)
        : fallbackView}
    </div>
  )

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {topBar}

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-5 pb-8">
        {/* Awaiting banner */}
        {awaiting && (
          <div className="anim-fade-up mx-auto mb-4 max-w-md rounded-2xl border bg-card p-6 text-center shadow-brand-lg" role="status">
            <Clock className="live-dot mx-auto h-12 w-12 text-amber-500" />
            <p className="mt-3 text-base font-bold text-foreground">{t('verifying')}</p>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{t('cpubVerifyingHint')}</p>
            <div className="mt-3 flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {senderNumber ? `+88 ${senderNumber}` : ''}
              {trxId.trim() ? ` · ${trxId.trim()}` : ''}
            </div>
            <p className="mt-2 text-[11px] font-semibold text-muted-foreground">
              {t('cpubMethod')}: {selectedGateway?.displayName || selectedGateway?.name} · {methodChip}
            </p>
            {pollTimedOut && (
              <div className="mt-4 space-y-2">
                <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">{t('cpubPollSlow')}</p>
                <Button variant="outline" size="sm" className="press h-9 gap-1.5" onClick={() => load()}>
                  <RefreshCw className="h-3.5 w-3.5" /> {t('cpubCheckAgain')}
                </Button>
              </div>
            )}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button
                  type="button"
                  className="press mx-auto mt-4 block min-h-[36px] rounded text-xs text-muted-foreground underline underline-offset-2 hover:text-destructive"
                >
                  {t('cpubCancelPayment')}
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent className="max-w-sm rounded-2xl">
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('cpubCancelTitle')}</AlertDialogTitle>
                  <AlertDialogDescription>{t('cpubCancelBody')}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="press">{t('cpubKeepWaiting')}</AlertDialogCancel>
                  <AlertDialogAction
                    className="press bg-destructive text-white hover:bg-destructive/90"
                    onClick={() => submitCancel()}
                  >
                    {t('cpubYesCancel')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}

        {/* Reference layout — mobile: stacked; lg+: sticky summary + payment column */}
        <div className="grid gap-5 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:gap-7">
          {/* Left — product/brand summary */}
          <div className={cn('space-y-4', !awaiting && 'lg:sticky lg:top-20 lg:self-start')}>
            <ProductSummaryCard
              brand={brand}
              title={c.title}
              description={c.description}
              amount={c.amount}
              currency={currency}
              expiresLabel={expiresChip}
              extraDetails={[
                ...(selectedGateway
                  ? [{ label: t('cpubMethodLabel'), value: `${selectedGateway.displayName || selectedGateway.name} · ${methodChip}` }]
                  : []),
                ...customFields
                  .filter((f) => answers[f.name]?.trim())
                  .map((f) => ({ label: f.label, value: answers[f.name] })),
              ]}
            />
            {/* Trust row */}
            <div className="hidden lg:block">
              <div className="flex items-center gap-4 rounded-2xl border bg-card px-4 py-3 text-[11px] font-semibold text-muted-foreground shadow-brand">
                <span className="flex items-center gap-1.5"><Lock className="h-3.5 w-3.5 text-success" /> 256-bit SSL</span>
                <span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-primary" /> {t('cpubSecuredBy')}</span>
              </div>
            </div>
            <div className="hidden lg:block">
              <SupportBlock brand={brand} faqs={faqs} />
            </div>
          </div>

          {/* Right — gateway picker / per-gateway payment flow */}
          <div className={cn('mx-auto w-full', awaiting ? 'max-w-md' : 'max-w-md lg:max-w-none')}>
            {payPanel}
            <div className="mt-4 lg:hidden">
              <SupportBlock brand={brand} faqs={faqs} />
            </div>
          </div>
        </div>
      </main>

      <ChromeFooter brandName={brand?.name ?? 'Invokeil Pay'} />

      {/* QR dialog */}
      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="max-w-[320px] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-center">{selectedGateway?.displayName || selectedGateway?.name || t('cpubShowQr')}</DialogTitle>
            <DialogDescription className="text-center">{t('cpubScanHint')}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3 pb-2">
            {qrData ? (
               
              <img src={qrData} alt="Payment QR" className="h-56 w-56 rounded-xl border bg-white p-2" />
            ) : (
              <Skeleton className="h-56 w-56 rounded-xl" />
            )}
            {accountNumber && (
              <p className="break-all text-center font-mono text-sm font-bold tracking-wider text-foreground">
                {accountNumber}
              </p>
            )}
            <p className="tabular text-lg font-extrabold" style={{ color: FALLBACK_COLOR }}>
              {formatRefMoney(pricing.total, currency)}
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Payment details dialog (Info icon) */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>{t('cpubPaymentDetails')}</DialogTitle>
            <DialogDescription>{c.title}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2.5 pb-1 text-sm">
            <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/40 px-4 py-3">
              <span className="text-xs font-semibold text-muted-foreground">{t('amount')}</span>
              <span className="tabular text-base font-extrabold text-foreground">{formatRefMoney(c.amount, currency)}</span>
            </div>
            {c.description && (
              <p className="text-xs leading-relaxed text-muted-foreground">{c.description}</p>
            )}
            {selectedGateway && (
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="font-semibold text-muted-foreground">{t('cpubMethodLabel')}</span>
                <span className="font-bold text-foreground">{selectedGateway.displayName || selectedGateway.name}</span>
              </div>
            )}
            {expiresChip && (
              <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                <Clock className="h-3.5 w-3.5" /> {expiresChip}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Support dialog (Headphones icon) */}
      <Dialog open={supportOpen} onOpenChange={setSupportOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>{t('needHelp')}</DialogTitle>
            <DialogDescription>{t('cpubContactSupport')}</DialogDescription>
          </DialogHeader>
          <div className="pb-1">
            <SupportBlock brand={brand} faqs={faqs} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}


