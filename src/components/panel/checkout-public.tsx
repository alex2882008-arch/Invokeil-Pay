'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import QRCode from 'qrcode'
import {
  ArrowRight, Check, CheckCircle2, Clock, Globe, Loader2, Mail, MessageCircle,
  Moon, Phone, QrCode, RefreshCw, Send, ShieldCheck, Sun, XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion'
import { formatBDT, formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useLang } from '@/lib/i18n'
import { useTheme } from '@/hooks/use-theme'
import { CopyButton } from './ui-bits'
import { GatewayLogo } from './gateway-logo'

// ── Public checkout page (/pay/[token]) — the money page ─────────────────────
// States: loading → form → awaiting → paid | cancelled | expired | not_found.
// Claim POSTs to /api/pay/{token} ({ action: 'claim' }), then polls the same
// GET every 4s (max 10 min, paused when the tab is hidden) until PAID.

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

interface BrandDTO {
  name: string
  tagline: string
  supportPhone: string
  supportEmail: string
  supportWhatsApp: string
  supportTelegram: string
}

interface PayToDTO {
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

interface GatewayDTO {
  code: string
  name: string
  mfs: string
  category: string
  type: string
  accountType: string
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
}

interface FaqDTO {
  question: string
  answer: string
}

interface PayPayload {
  checkout: CheckoutDTO
  brand: BrandDTO
  payTo: PayToDTO
  gateways: GatewayDTO[]
  faqs: FaqDTO[]
}

type Phase = 'loading' | 'form' | 'awaiting' | 'paid' | 'cancelled' | 'expired' | 'not_found'
type GroupCat = 'MFS' | 'BANK' | 'GLOBAL'

const POLL_INTERVAL_MS = 4000
const POLL_MAX_MS = 10 * 60_000
const FALLBACK_COLOR = '#2563EB'

function fmtRemaining(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
  return `${m}:${String(sec).padStart(2, '0')}`
}

function normalizeBdClient(raw: string): string {
  return raw.replace(/[^0-9+]/g, '').replace(/^\+?88/, '').replace(/\D/g, '')
}

function accountTypeLabel(accountType: string, t: (k: string) => string): string {
  if (accountType === 'AGENT') return t('cpubAgent')
  if (accountType === 'MERCHANT') return t('cpubMerchant')
  return t('cpubPersonal')
}

function categoryOf(g: GatewayDTO): GroupCat {
  if (g.category === 'BANK') return 'BANK'
  if (g.category === 'GLOBAL') return 'GLOBAL'
  return 'MFS'
}

/** Support contacts + FAQ accordion — shared by active & terminal screens. */
function SupportBlock({ brand, faqs }: { brand: BrandDTO | null; faqs: FaqDTO[] }) {
  const { t } = useLang()
  const contacts: Array<{ href: string; label: string; icon: React.ReactNode }> = []
  if (brand?.supportPhone) {
    contacts.push({ href: `tel:${brand.supportPhone.replace(/[^\d+]/g, '')}`, label: brand.supportPhone, icon: <Phone className="h-3.5 w-3.5" /> })
  }
  if (brand?.supportEmail) {
    contacts.push({ href: `mailto:${brand.supportEmail}`, label: brand.supportEmail, icon: <Mail className="h-3.5 w-3.5" /> })
  }
  if (brand?.supportWhatsApp) {
    contacts.push({ href: `https://wa.me/${brand.supportWhatsApp.replace(/\D/g, '')}`, label: 'WhatsApp', icon: <MessageCircle className="h-3.5 w-3.5" /> })
  }
  if (brand?.supportTelegram) {
    const tg = brand.supportTelegram.startsWith('http') ? brand.supportTelegram : `https://t.me/${brand.supportTelegram.replace(/^@/, '')}`
    contacts.push({ href: tg, label: 'Telegram', icon: <Send className="h-3.5 w-3.5" /> })
  }

  return (
    <div className="rounded-2xl border bg-card p-5 shadow-brand">
      <p className="text-sm font-bold text-foreground">{t('needHelp')}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{t('cpubContactSupport')}</p>
      {contacts.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {contacts.map((c) => (
            <a
              key={c.href}
              href={c.href}
              target="_blank"
              rel="noopener noreferrer"
              className="press inline-flex h-10 items-center gap-1.5 rounded-full border bg-muted/40 px-3.5 text-xs font-semibold text-foreground hover:bg-muted"
            >
              {c.icon}
              <span className="max-w-[180px] truncate">{c.label}</span>
            </a>
          ))}
        </div>
      )}
      {faqs.length > 0 && (
        <div className="mt-4">
          <Accordion type="single" collapsible className="rounded-xl border bg-muted/30 px-4">
            <AccordionItem value="faq" className="border-0">
              <AccordionTrigger className="py-3 text-xs font-bold text-foreground hover:no-underline">
                {t('cpubFaq')} ({faqs.length})
              </AccordionTrigger>
              <AccordionContent className="pb-3">
                <div className="space-y-3">
                  {faqs.map((f, i) => (
                    <div key={i}>
                      <p className="text-xs font-bold text-foreground">{f.question}</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{f.answer}</p>
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      )}
    </div>
  )
}

function ChromeFooter({ brandName }: { brandName: string }) {
  const { t } = useLang()
  return (
    <footer className="mt-auto flex flex-col items-center gap-1 px-4 pb-8 pt-6 text-center">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5" /> {t('cpubSecuredBy')}
      </p>
      <p className="text-xs text-muted-foreground/70">
        {t('cpubPoweredBy')} <span className="font-semibold text-muted-foreground">{brandName}</span>
      </p>
    </footer>
  )
}

function TopBar({ brand, children }: { brand: BrandDTO | null; children: React.ReactNode }) {
  const { t } = useLang()
  return (
    <header className="safe-top sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-md items-center justify-between gap-2 px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Globe className="h-4 w-4" />
          </span>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-bold text-foreground">{brand?.name ?? 'Invokeil Pay'}</p>
            {brand?.tagline && (
              <p className="hidden truncate text-[10px] text-muted-foreground sm:block">{brand.tagline}</p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">{children}</div>
      </div>
    </header>
  )
}

function LoadingSkeleton() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="safe-top border-b bg-background/85">
        <div className="mx-auto flex h-14 w-full max-w-md items-center justify-between px-4">
          <div className="flex items-center gap-2.5">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <div className="space-y-1.5">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-2.5 w-40" />
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Skeleton className="h-9 w-9 rounded-lg" />
            <Skeleton className="h-9 w-16 rounded-full" />
          </div>
        </div>
      </div>
      <div className="mx-auto w-full max-w-md space-y-4 px-4 pt-5">
        <Skeleton className="h-48 w-full rounded-2xl" />
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    </div>
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
  const [selectedCode, setSelectedCode] = useState<string | null>(null)
  const [tab, setTab] = useState<GroupCat | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [senderNumber, setSenderNumber] = useState('')
  const [trxId, setTrxId] = useState('')

  // countdown + qr
  const [remaining, setRemaining] = useState<number | null>(null)
  const [qrOpen, setQrOpen] = useState(false)
  const [qrData, setQrData] = useState<string | null>(null)

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
    // preselect checkout.gatewayCode, else user pick, else first gateway
    return byCode(selectedCode) ?? byCode(checkout?.gatewayCode) ?? list[0]
  }, [data, selectedCode, checkout?.gatewayCode])

  const categories = useMemo(() => {
    const cats: GroupCat[] = []
    for (const g of data?.gateways ?? []) {
      const c = categoryOf(g)
      if (!cats.includes(c)) cats.push(c)
    }
    return cats
  }, [data])

  const activeTab: GroupCat = tab ?? (selectedGateway ? categoryOf(selectedGateway) : 'MFS')
  const visibleGateways = useMemo(
    () => (data?.gateways ?? []).filter((g) => categoryOf(g) === activeTab),
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

  const heroColor = selectedGateway?.color ?? FALLBACK_COLOR

  const instructionLines = useMemo(() => {
    const raw = selectedGateway?.instructions
    if (!raw?.trim()) return []
    return raw
      .split('\n')
      .map((l) => l.replace(/^\s*\d+[.)]\s*/, '').trim())
      .filter(Boolean)
  }, [selectedGateway])

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
    const out: Array<{ label: string; value: string; color: string }> = []
    if (p.bkash) out.push({ label: 'bKash', value: p.bkash, color: '#E2136E' })
    if (p.nagad) out.push({ label: 'Nagad', value: p.nagad, color: '#F6921E' })
    if (p.rocket) out.push({ label: 'Rocket', value: p.rocket, color: '#8C3494' })
    if (p.upay) out.push({ label: 'Upay', value: p.upay, color: '#00A99D' })
    if (p.bank_hint) out.push({ label: 'Bank', value: p.bank_hint, color: '#475569' })
    return out
  }, [data?.payTo])

  // ── Actions ──

  const openQr = async () => {
    setQrData(null)
    setQrOpen(true)
    try {
      const payload = `Number: ${accountNumber ?? ''}\nAmount: ${formatBDT(pricing.total)}`
      setQrData(await QRCode.toDataURL(payload, { width: 280, margin: 1 }))
    } catch {
      setQrData(null)
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

    setSubmitting(true)
    try {
      const res = await fetch(`/api/pay/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'claim',
          senderNumber: phone,
          trxId: trxId.trim() || undefined,
          answers: customFields.length > 0 ? answers : undefined,
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
                  {formatBDT(c.amount)}
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
              {/* confetti-ish floating dots (existing ilp-fade-up keyframes, staggered) */}
              <span className="anim-fade-up absolute -top-1 left-2 h-2.5 w-2.5 rounded-full bg-success" />
              <span className="anim-fade-up absolute -right-1 top-3 h-2 w-2 rounded-full bg-amber-400" style={{ animationDelay: '120ms' }} />
              <span className="anim-fade-up absolute -bottom-1 right-5 h-2 w-2 rounded-full bg-pink-500" style={{ animationDelay: '240ms' }} />
            </div>
            <h1 className="mt-5 text-xl font-extrabold text-foreground">{t('paidThanks')}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t('cpubSuccessHint')}</p>
            <p className="tabular mt-5 rounded-xl bg-success/10 py-3.5 text-3xl font-extrabold text-success">
              {formatBDT(c.amount)}
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

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {topBar}

      {/* Hero card */}
      <main className="mx-auto w-full max-w-md flex-1 px-4 pt-5">
        <div
          className="anim-fade-up rounded-2xl p-6 text-white shadow-brand-lg transition-colors duration-300"
          style={{ background: `linear-gradient(135deg, ${heroColor} 0%, ${heroColor}d9 100%)` }}
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold opacity-90">{t('youArePaying')}</p>
            {remaining != null && remaining > 0 && (
              <span
                className={cn(
                  'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold tabular',
                  remaining < 5 * 60_000 ? 'bg-white text-red-600' : 'bg-white/15'
                )}
                role="timer"
              >
                <Clock className="h-3 w-3" /> {t('cpubExpiresIn')} {fmtRemaining(remaining)}
              </span>
            )}
            {remaining != null && remaining <= 0 && (
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-red-600">
                <Clock className="h-3 w-3" /> {t('expired')}
              </span>
            )}
          </div>
          <p className="tabular mt-1.5 text-4xl font-extrabold tracking-tight">{formatBDT(c.amount)}</p>
          <p className="mt-2 text-base font-bold opacity-95">{c.title}</p>
          {c.description && <p className="mt-1 text-xs leading-relaxed opacity-80">{c.description}</p>}
          {c.customerName && <p className="mt-1.5 text-xs opacity-75">{c.customerName}</p>}
        </div>

        <div className={cn('space-y-4', awaiting ? 'mt-4' : 'mt-4')}>
          {/* Awaiting verification card */}
          {awaiting && (
            <div className="anim-fade-up rounded-2xl border bg-card p-6 text-center shadow-brand-lg" role="status">
              <Clock className="live-dot mx-auto h-12 w-12 text-amber-500" />
              <p className="mt-3 text-base font-bold text-foreground">{t('verifying')}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{t('cpubVerifyingHint')}</p>
              <div className="mt-3 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {senderNumber ? `+88 ${senderNumber}` : ''}
                {trxId.trim() ? ` · ${trxId.trim()}` : ''}
              </div>
              {pollTimedOut && (
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">{t('cpubPollSlow')}</p>
                  <Button variant="outline" size="sm" className="press h-9 gap-1.5" onClick={() => load()}>
                    <RefreshCw className="h-3.5 w-3.5" /> {t('cpubCheckAgain')}
                  </Button>
                </div>
              )}
              {/* Cancel link */}
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

          {/* Gateway selector */}
          {!awaiting && data && data.gateways.length > 0 && (
            <div className="anim-fade-up rounded-2xl border bg-card p-5 shadow-brand-lg">
              <p className="mb-3 text-sm font-bold text-foreground">{t('cpubChooseMethod')}</p>
              {categories.length > 1 && (
                <div className="mb-3 flex rounded-xl bg-muted p-1" role="tablist">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      role="tab"
                      aria-selected={activeTab === cat}
                      onClick={() => setTab(cat)}
                      className={cn(
                        'press h-10 min-h-[40px] flex-1 rounded-lg text-xs font-bold transition-colors',
                        activeTab === cat ? 'bg-card text-foreground shadow-brand' : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {cat === 'MFS' ? t('cpubTabMfs') : cat === 'BANK' ? t('cpubTabBank') : t('cpubTabGlobal')}
                    </button>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                {visibleGateways.map((g) => {
                  const selected = selectedGateway?.code === g.code
                  return (
                    <button
                      key={g.code}
                      type="button"
                      onClick={() => setSelectedCode(g.code)}
                      aria-pressed={selected}
                      className={cn(
                        'press hover-lift flex min-h-[56px] items-center gap-2.5 rounded-xl border bg-card p-2.5 text-left',
                        selected ? 'border-transparent' : 'border-border'
                      )}
                      style={selected ? { boxShadow: `0 0 0 2px ${g.color}` } : undefined}
                    >
                      <GatewayLogo code={g.code} mfs={g.mfs} color={g.color} size={36} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-bold text-foreground">{g.name}</span>
                        <span className="mt-0.5 inline-block rounded bg-muted px-1.5 py-px text-[10px] font-semibold text-muted-foreground">
                          {accountTypeLabel(g.accountType, t)}
                        </span>
                      </span>
                      {selected && <Check className="h-4 w-4 shrink-0" style={{ color: g.color }} />}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Fallback pay-to numbers (no gateways configured) */}
          {!awaiting && data && data.gateways.length === 0 && (
            <div className="anim-fade-up rounded-2xl border bg-card p-5 shadow-brand-lg">
              <p className="mb-3 text-sm font-bold text-foreground">{t('sendMoneyTo')}</p>
              <div className="space-y-2">
                {fallbackNumbers.map((n) => (
                  <div key={n.label} className="flex items-center justify-between gap-2 rounded-xl border bg-muted/40 px-4 py-3">
                    <div className="min-w-0">
                      <p className="break-all font-mono text-base font-bold tracking-wide text-foreground">{n.value}</p>
                      <p className="text-[11px] font-semibold" style={{ color: n.color }}>{n.label}</p>
                    </div>
                    <CopyButton value={n.value} compact className="shrink-0" />
                  </div>
                ))}
                {fallbackNumbers.length === 0 && (
                  <p className="rounded-xl border border-dashed px-4 py-3 text-center text-xs text-muted-foreground">
                    {t('sendMoneyTo')}
                  </p>
                )}
              </div>
              <div className="mt-4">
                <p className="mb-2 text-xs font-bold text-foreground">{t('cpubHowToPay')}</p>
                <ol className="space-y-2">
                  {[t('cpubStep1'), t('cpubStep2'), t('cpubStep3'), t('cpubStep4')].map((s, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-xs leading-relaxed text-muted-foreground">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-extrabold text-primary">
                        {i + 1}
                      </span>
                      {s}
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          )}

          {/* Selected gateway payment instructions */}
          {!awaiting && selectedGateway && (
            <div className="anim-fade-up overflow-hidden rounded-2xl border bg-card shadow-brand-lg">
              <div
                className="flex items-center justify-between gap-2 px-5 py-3.5"
                style={{ backgroundColor: selectedGateway.color, color: selectedGateway.textColor }}
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <GatewayLogo code={selectedGateway.code} mfs={selectedGateway.mfs} color={selectedGateway.color} size={36} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-extrabold">{selectedGateway.name}</p>
                    <p className="text-[11px] opacity-85">{t('cpubInstructions')}</p>
                  </div>
                </div>
                <span className="shrink-0 rounded-full bg-black/15 px-2.5 py-1 text-[10px] font-bold">
                  {accountTypeLabel(selectedGateway.accountType, t)}
                </span>
              </div>
              <div className="space-y-4 p-5">
                {accountNumber && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {t('cpubAccountNumber')}
                    </p>
                    <div className="mt-1.5 flex items-center justify-between gap-3 rounded-xl border bg-muted/40 px-4 py-3">
                      <p className="min-w-0 break-all font-mono text-xl font-extrabold tracking-wider text-foreground">
                        {accountNumber}
                      </p>
                      <CopyButton value={accountNumber} compact className="shrink-0" />
                    </div>
                  </div>
                )}

                <div
                  className="flex items-center justify-between gap-3 rounded-xl px-4 py-3"
                  style={{ backgroundColor: `${selectedGateway.color}14` }}
                >
                  <span className="text-xs font-semibold text-muted-foreground">{t('cpubSendExactly')}</span>
                  <span className="tabular text-lg font-extrabold" style={{ color: selectedGateway.color }}>
                    {formatBDT(pricing.total)}
                  </span>
                </div>

                {accountNumber && (
                  <Button
                    type="button"
                    variant="outline"
                    className="press h-11 w-full gap-2 text-xs font-bold"
                    onClick={() => openQr()}
                  >
                    <QrCode className="h-4 w-4" /> {t('cpubShowQr')}
                  </Button>
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
                      <span className="tabular font-bold text-foreground">{formatBDT(c.amount)}</span>
                    </div>
                    {pricing.charge > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">{t('cpubCharge')}</span>
                        <span className="tabular font-bold text-amber-600 dark:text-amber-400">+{formatBDT(pricing.charge)}</span>
                      </div>
                    )}
                    {pricing.discount > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">{t('cpubYouSave')}</span>
                        <span className="tabular font-bold text-success">−{formatBDT(pricing.discount)}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between border-t pt-1.5">
                      <span className="font-bold text-foreground">{t('cpubTotal')}</span>
                      <span className="tabular font-extrabold text-foreground">{formatBDT(pricing.total)}</span>
                    </div>
                  </div>
                )}

                {instructionLines.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-bold text-foreground">{t('cpubHowToPay')}</p>
                    <ol className="space-y-2">
                      {instructionLines.map((s, i) => (
                        <li key={i} className="flex items-start gap-2.5 text-xs leading-relaxed text-muted-foreground">
                          <span
                            className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-extrabold"
                            style={{ backgroundColor: `${selectedGateway.color}1A`, color: selectedGateway.color }}
                          >
                            {i + 1}
                          </span>
                          {s}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Custom fields + verify form */}
          {!awaiting && (
            <div className="anim-fade-up space-y-4">
              {customFields.length > 0 && (
                <div className="rounded-2xl border bg-card p-5 shadow-brand-lg">
                  <p className="mb-3 text-sm font-bold text-foreground">{t('cpubAdditionalInfo')}</p>
                  <div className="space-y-3">
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
                          className={cn('h-11', fieldErrors[f.name] && 'border-destructive')}
                          aria-invalid={!!fieldErrors[f.name]}
                        />
                        {fieldErrors[f.name] && (
                          <p className="text-[11px] font-semibold text-destructive">{fieldErrors[f.name]}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="rounded-2xl border bg-card p-5 shadow-brand-lg">
                <div className="grid gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="pub-sender" className="text-xs font-semibold text-foreground/80">
                      {t('cpubYourNumber')} <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="pub-sender"
                      value={senderNumber}
                      onChange={(e) => setSenderNumber(e.target.value)}
                      placeholder="01XXXXXXXXX"
                      inputMode="tel"
                      autoComplete="tel"
                      className="h-11"
                    />
                    <p className="text-[11px] text-muted-foreground">{t('cpubYourNumberHint')}</p>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="pub-trxid" className="text-xs font-semibold text-foreground/80">
                      {t('cpubTrxId')}
                    </Label>
                    <Input
                      id="pub-trxid"
                      value={trxId}
                      onChange={(e) => setTrxId(e.target.value)}
                      placeholder="9F7A2K1B"
                      maxLength={40}
                      className="h-11 font-mono"
                    />
                    <p className="text-[11px] text-muted-foreground">{t('cpubTrxIdHint')}</p>
                  </div>
                  <Button
                    className="press h-12 w-full gap-2 text-sm font-bold text-white"
                    style={{ backgroundColor: heroColor }}
                    onClick={() => submitClaim()}
                    disabled={submitting}
                  >
                    {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                    {t('iHavePaid')} <ArrowRight className="h-4 w-4" />
                  </Button>
                  {/* Cancel link */}
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button
                        type="button"
                        className="press mx-auto block min-h-[36px] rounded text-xs text-muted-foreground underline underline-offset-2 hover:text-destructive"
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
              </div>
            </div>
          )}

          {/* Support & FAQ */}
          <SupportBlock brand={brand} faqs={faqs} />
        </div>
      </main>

      <ChromeFooter brandName={brand?.name ?? 'Invokeil Pay'} />

      {/* Sticky mobile CTA */}
      {!awaiting && (
        <div className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur md:hidden">
          <div className="mx-auto flex w-full max-w-md items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0 leading-tight">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t('youArePaying')}
              </p>
              <p className="tabular truncate text-lg font-extrabold text-foreground">{formatBDT(c.amount)}</p>
            </div>
            <Button
              className="press h-11 flex-1 text-sm font-bold text-white"
              style={{ backgroundColor: heroColor, maxWidth: '58%' }}
              onClick={() => submitClaim()}
              disabled={submitting}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : t('cpubPayNow')}
            </Button>
          </div>
        </div>
      )}

      {/* QR dialog */}
      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="max-w-[320px] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-center">{selectedGateway?.name ?? t('cpubShowQr')}</DialogTitle>
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
            <p className="tabular text-lg font-extrabold" style={{ color: heroColor }}>
              {formatBDT(pricing.total)}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
