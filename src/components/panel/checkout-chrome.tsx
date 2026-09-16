'use client'

import React, { useState } from 'react'
import {
  ChevronDown, Clock, Globe, Landmark, Mail, MessageCircle,
  Phone, Send, ShieldCheck, Smartphone, User,
} from 'lucide-react'
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useLang } from '@/lib/i18n'
import { CopyButton } from './ui-bits'
import { GatewayLogo } from './gateway-logo'

// ── Checkout chrome — shared building blocks for the reference-style payment
// page (product summary card, quick-payment header, method tabs, logo grid…).

export interface BrandLike {
  name: string
  tagline: string
  logo?: string
  supportPhone: string
  supportEmail: string
  supportWhatsApp: string
  supportTelegram: string
}

export interface GatewayLike {
  code: string
  name: string
  displayName?: string | null
  mfs: string
  category: string
  type: string
  accountType: string
  color: string
  textColor: string
  buttonColor?: string | null
  buttonText?: string | null
  logoUrl?: string | null
  icon: string | null
  accountNumber: string | null
  instructions: string | null
  qrImage?: string | null
  allowPending?: string
  minAmount: number | null
  maxAmount: number | null
  chargeFixed: number
  chargePercent: number
  discountFixed: number
  discountPercent: number
}

export type CheckoutTab = 'MOBILE' | 'NET_BANKING' | 'GLOBAL'

/** "BDT 11,900.00" — reference-style money format. */
export function formatRefMoney(n: number, currency = 'BDT'): string {
  const v = Number(n ?? 0)
  return `${currency} ${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function fmtRemaining(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
  return `${m}:${String(sec).padStart(2, '0')}`
}

export function accountTypeLabel(accountType: string, t: (k: string) => string): string {
  if (accountType === 'AGENT') return t('cpubAgent')
  if (accountType === 'MERCHANT') return t('cpubMerchant')
  return t('cpubPersonal')
}

/** Gateway category → reference tab (Mobile Banking / Net Banking / Global). */
export function tabOf(g: GatewayLike): CheckoutTab {
  if (g.category === 'BANK') return 'NET_BANKING'
  if (g.category === 'GLOBAL') return 'GLOBAL'
  return 'MOBILE'
}

export const TAB_META: Array<{ id: CheckoutTab; icon: React.ElementType; labelKey: string }> = [
  { id: 'MOBILE', icon: Smartphone, labelKey: 'cpubTabMobileBanking' },
  { id: 'NET_BANKING', icon: Landmark, labelKey: 'cpubTabNetBankingFull' },
  { id: 'GLOBAL', icon: Globe, labelKey: 'cpubTabGlobalFull' },
]

// ── Top bar ──────────────────────────────────────────────────────────────────

export function TopBar({ brand, children }: { brand: BrandLike | null; children?: React.ReactNode }) {
  return (
    <header className="safe-top sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-2 px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          {brand?.logo ? (
            <img src={brand.logo} alt={brand.name} className="h-9 w-9 rounded-lg bg-white object-contain ring-1 ring-black/5" />
          ) : (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Globe className="h-4 w-4" />
            </span>
          )}
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

export function ChromeFooter({ brandName }: { brandName: string }) {
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

// ── Product summary card (reference: logo + title + View Details + amount) ──

export function ProductSummaryCard({
  brand,
  title,
  description,
  amount,
  currency,
  expiresLabel,
  extraDetails,
}: {
  brand: BrandLike | null
  title: string
  description?: string | null
  amount: number
  currency: string
  expiresLabel?: string | null
  extraDetails?: Array<{ label: string; value: string }> | null
}) {
  const { t } = useLang()
  const [open, setOpen] = useState(false)
  const hasDetails = Boolean(description || (extraDetails && extraDetails.length > 0))
  return (
    <section className="anim-fade-up rounded-2xl border bg-card px-4 py-3.5 shadow-brand" aria-label={title}>
      <div className="flex items-center gap-3">
        {brand?.logo ? (
          <img
            src={brand.logo}
            alt=""
            className="h-11 w-11 shrink-0 rounded-xl bg-white object-contain ring-1 ring-black/5"
          />
        ) : (
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Globe className="h-5 w-5" />
          </span>
        )}
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[15px] font-bold text-foreground">{title}</p>
          {hasDetails ? (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="press mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-primary"
              aria-expanded={open}
            >
              {open ? t('cpubHideDetails') : t('cpubViewDetails')}
              <ChevronDown className={cn('h-3.5 w-3.5 transition-transform duration-200', open && 'rotate-180')} />
            </button>
          ) : (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{brand?.name}</p>
          )}
        </div>
        <div className="shrink-0 text-right leading-tight">
          <p className="text-[13px] font-semibold text-muted-foreground">{currency}</p>
          <p className="tabular text-base font-extrabold text-foreground">
            {Number(amount ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
      </div>
      {/* Expandable details */}
      <div
        className={cn(
          'grid transition-all duration-300 ease-out',
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        )}
      >
        <div className="overflow-hidden">
          <div className="mt-3 space-y-2.5 border-t pt-3">
            {description && <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>}
            {extraDetails?.map((d) => (
              <div key={d.label} className="flex items-center justify-between gap-3 text-xs">
                <span className="font-semibold text-muted-foreground">{d.label}</span>
                <span className="min-w-0 truncate text-right font-semibold text-foreground">{d.value}</span>
              </div>
            ))}
            {expiresLabel && (
              <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                <Clock className="h-3.5 w-3.5" /> {expiresLabel}
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

// ── Quick Payment header (reference: "Quick Payment" + "Hello Ahmed") ───────

export function QuickPaymentHeader({ customerName }: { customerName?: string | null }) {
  const { t } = useLang()
  return (
    <div className="flex items-center justify-between gap-2">
      <h1 className="text-[15px] font-extrabold tracking-tight text-foreground">{t('cpubQuickPayment')}</h1>
      <p className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground/90">
        {t('cpubHello')} {customerName?.trim() || t('cpubGuest')}
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10">
          <User className="h-3 w-3 text-primary" />
        </span>
      </p>
    </div>
  )
}

// ── Method tabs (Cards / Mobile / Net Banking) with sliding underline ───────

export function MethodTabs({
  tabs,
  active,
  onChange,
}: {
  tabs: CheckoutTab[]
  active: CheckoutTab
  onChange: (t: CheckoutTab) => void
}) {
  const visible = TAB_META.filter((m) => tabs.includes(m.id))
  const { t } = useLang()
  return (
    <div className="relative flex items-stretch justify-between gap-1 border-b px-1" role="tablist">
      {visible.map((m) => {
        const Icon = m.icon
        const isActive = active === m.id
        return (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(m.id)}
            className={cn(
              'press relative flex min-h-[52px] flex-1 flex-col items-center justify-center gap-1 rounded-t-lg px-2 pb-2.5 pt-2 transition-colors duration-200',
              isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="h-[18px] w-[18px]" strokeWidth={isActive ? 2.4 : 2} />
            <span className={cn('text-[11px] leading-none', isActive ? 'font-extrabold' : 'font-semibold')}>
              {t(m.labelKey)}
            </span>
            {/* sliding underline */}
            <span
              aria-hidden
              className={cn(
                'absolute inset-x-3 bottom-0 h-[2.5px] rounded-full bg-primary transition-all duration-300',
                isActive ? 'scale-x-100 opacity-100' : 'scale-x-0 opacity-0'
              )}
            />
          </button>
        )
      })}
    </div>
  )
}

// ── Gateway logo grid (reference: white tiles + gateway name below) ─────────

export function GatewayTileGrid({
  gateways,
  onPick,
}: {
  gateways: GatewayLike[]
  onPick: (code: string) => void
}) {
  return (
    <div className="grid grid-cols-3 gap-2" role="listbox" aria-label="Payment methods">
      {gateways.map((g, i) => (
        <button
          key={g.code}
          type="button"
          role="option"
          aria-selected={false}
          aria-label={g.displayName || g.name}
          onClick={() => onPick(g.code)}
          style={{ animationDelay: `${Math.min(i * 30, 240)}ms` }}
          className="press anim-fade-up hover-lift flex h-[74px] flex-col items-center justify-center gap-1.5 overflow-hidden rounded-xl border bg-card px-2 transition-shadow duration-200 hover:border-primary/40"
        >
          {g.logoUrl ? (
            <span className="flex h-7 max-w-[86%] items-center justify-center">
              { }
              <img src={g.logoUrl} alt="" className="max-h-7 w-auto max-w-full object-contain" />
            </span>
          ) : (
            <GatewayLogo code={g.code} mfs={g.mfs} color={g.color} size={26} variant="wordmark" className="max-w-[86%]" />
          )}
          <span className="max-w-full truncate text-[10px] font-semibold leading-none text-muted-foreground">
            {g.displayName || g.name}
          </span>
        </button>
      ))}
    </div>
  )
}

// ── Copy row (number / reference) ────────────────────────────────────────────

export function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-muted/40 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-center justify-between gap-3">
        <p className="min-w-0 break-all font-mono text-lg font-extrabold tracking-wider text-foreground">{value}</p>
        <CopyButton value={value} compact className="shrink-0" />
      </div>
    </div>
  )
}

export function InlineCopy({ value, className }: { value: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span className="min-w-0 break-all font-mono text-sm font-bold tracking-wide text-foreground">{value}</span>
      <CopyButton value={value} compact />
    </span>
  )
}

// ── Support block ────────────────────────────────────────────────────────────

export function SupportBlock({ brand, faqs }: { brand: BrandLike | null; faqs: Array<{ question: string; answer: string }> }) {
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

// ── Loading skeleton ─────────────────────────────────────────────────────────

export function LoadingSkeleton() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="safe-top border-b bg-background/85">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4">
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
        <Skeleton className="h-20 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    </div>
  )
}
