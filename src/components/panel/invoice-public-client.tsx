'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertTriangle, CheckCircle2, Loader2, ShieldCheck, XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { formatBDT, MFS_META } from '@/lib/format'
import { cn } from '@/lib/utils'
import { LangProvider, useLang } from '@/lib/i18n'
import { BrandLogo, CopyButton } from './ui-bits'
import { GatewayLogo } from './gateway-logo'

// ── Public invoice page (/invoice/[token]) ───────────────────────────────────
// Invoice document card (brand header, bill-to, items, totals) → pay-now card
// with MFS numbers → "I have paid" claim (SENT/OVERDUE → AWAITING) → poll the
// invoice every 4s until PAID → green success screen.

interface PubItem {
  description: string
  quantity: number
  unitPrice: number
  total: number
}

interface PubInvoice {
  number: string
  title: string
  status: string
  currency: string
  subtotal: number
  discount: number
  tax: number
  shipping: number
  total: number
  dueDate: string | null
  paidAt: string | null
  publicNote: string | null
  customerName: string | null
  createdAt: string
  items: PubItem[]
}

interface PubPayload {
  invoice: PubInvoice
  brand: { name: string; supportPhone: string; supportEmail: string }
  payTo: { bkash: string; nagad: string; rocket: string; upay: string; bank: string }
}

type Phase = 'loading' | 'doc' | 'verifying' | 'success' | 'failed' | 'not_found'

const INV_TONE: Record<string, string> = {
  DRAFT: 'border-border bg-muted text-muted-foreground',
  SENT: 'border-primary/25 bg-primary/10 text-primary',
  AWAITING: 'border-warning/30 bg-warning/15 text-amber-700 dark:text-amber-400',
  PAID: 'border-success/20 bg-success/10 text-success',
  OVERDUE: 'border-destructive/25 bg-destructive/10 text-destructive',
  CANCELLED: 'border-border bg-muted text-muted-foreground/70',
  REFUNDED: 'border-warning/30 bg-warning/10 text-amber-700 dark:text-amber-400',
}

function fmtDate(d: string | null): string {
  if (!d) return '—'
  const date = new Date(d)
  if (isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(date)
}

function statusBadge(s: string, t: (k: string) => string) {
  const stKey = `st${s.charAt(0)}${s.slice(1).toLowerCase()}`
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-semibold', INV_TONE[s] ?? INV_TONE.DRAFT)}>
      <span className={cn(
        'h-1.5 w-1.5 rounded-full',
        s === 'PAID' ? 'bg-success'
          : s === 'OVERDUE' ? 'bg-destructive'
            : s === 'SENT' || s === 'AWAITING' ? 'bg-primary' : 'bg-muted-foreground/50',
      )} />
      {t(stKey)}
    </span>
  )
}

function InvoicePublicView({ token }: { token: string }) {
  const { t, lang, setLang } = useLang()
  const [data, setData] = useState<PubPayload | null>(null)
  const [phase, setPhase] = useState<Phase>('loading')
  const [claiming, setClaiming] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/pay/invoice/${encodeURIComponent(token)}`)
      if (!res.ok) {
        setPhase('not_found')
        return
      }
      const d = (await res.json()) as PubPayload
      if (!d || !d.invoice) {
        setPhase('not_found')
        return
      }
      setData(d)
      const st = d.invoice.status
      if (st === 'PAID') setPhase('success')
      else if (st === 'CANCELLED' || st === 'REFUNDED') setPhase('failed')
      else if (st === 'AWAITING') setPhase('verifying') // someone already claimed — keep watching
      else setPhase('doc')
    } catch {
      setPhase('not_found')
    }
  }, [token])

  useEffect(() => {
    load()
  }, [load])

  // ── Poll while verifying: flip to success as soon as the invoice is PAID ──
  useEffect(() => {
    if (phase !== 'verifying') return

    let cancelled = false
    const check = async () => {
      try {
        const res = await fetch(`/api/pay/invoice/${encodeURIComponent(token)}`)
        if (cancelled || !res.ok) return
        const d = (await res.json()) as PubPayload
        if (!d?.invoice) return
        const st = d.invoice.status
        if (st === 'PAID') {
          setData(d)
          setPhase('success')
        } else if (st === 'CANCELLED' || st === 'REFUNDED') {
          setData(d)
          setPhase('failed')
        } else {
          setData(d)
        }
      } catch { /* transient network errors: keep polling */ }
    }

    check()
    pollRef.current = setInterval(check, 4000)
    return () => {
      cancelled = true
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [phase, token])

  const claim = async () => {
    setClaiming(true)
    try {
      const res = await fetch(`/api/pay/invoice/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const d = (await res.json().catch(() => null)) as { ok?: boolean; invoice?: PubInvoice; error?: string } | null
      if (res.ok && d?.ok && d.invoice) {
        setData((prev) => (prev ? { ...prev, invoice: d.invoice as PubInvoice } : prev))
        setPhase('verifying')
      } else {
        toast.error(d?.error ?? t('ipubClaimFailed'))
      }
    } catch {
      toast.error(t('ipubClaimFailed'))
    } finally {
      setClaiming(false)
    }
  }

  // ── Full-screen states ──

  if (phase === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (phase === 'not_found' || phase === 'failed') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
        <div className="anim-scale-in rounded-2xl border bg-card p-10 shadow-brand-lg">
          <XCircle className="h-14 w-14 text-muted-foreground/50" />
          <h1 className="mt-4 text-lg font-bold text-foreground">
            {phase === 'failed' ? t('ipubCancelled') : t('ipubNotFound')}
          </h1>
          <p className="mt-1.5 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" /> {t('ipubSecuredBy')}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">{t('ipubPoweredBy')} {data?.brand.name ?? 'Invokeil Pay'}</p>
      </div>
    )
  }

  if (phase === 'success') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="anim-scale-in w-full max-w-md rounded-2xl border bg-card p-10 text-center shadow-brand-lg">
          <CheckCircle2 className="mx-auto h-16 w-16 text-success" />
          <h1 className="mt-4 text-xl font-extrabold text-foreground">{t('ipubPaidTitle')}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">{t('ipubPaidHint')}</p>
          {data && (
            <>
              <p className="mt-4 font-mono text-xs text-muted-foreground">{data.invoice.number}</p>
              <p className="tabular mt-2 rounded-xl bg-success/10 py-3 text-2xl font-bold text-success">
                {formatBDT(data.invoice.total)}
              </p>
            </>
          )}
          <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" /> {t('ipubSecuredBy')}
          </p>
        </div>
      </div>
    )
  }

  if (!data) return null

  const { invoice, brand, payTo } = data
  const overdue = invoice.status === 'OVERDUE'
  const claimable = invoice.status === 'SENT' || invoice.status === 'OVERDUE'
  const verifying = phase === 'verifying'

  const payRows = [
    { label: MFS_META.BKASH.label, color: MFS_META.BKASH.color, bg: MFS_META.BKASH.bg, value: payTo.bkash, mfs: 'BKASH' },
    { label: MFS_META.NAGAD.label, color: MFS_META.NAGAD.color, bg: MFS_META.NAGAD.bg, value: payTo.nagad, mfs: 'NAGAD' },
    { label: MFS_META.ROCKET.label, color: MFS_META.ROCKET.color, bg: MFS_META.ROCKET.bg, value: payTo.rocket, mfs: 'ROCKET' },
    { label: MFS_META.UPAY.label, color: MFS_META.UPAY.color, bg: MFS_META.UPAY.bg, value: payTo.upay, mfs: 'UPAY' },
    { label: t('ipubBankLabel'), color: MFS_META.BANK.color, bg: MFS_META.BANK.bg, value: payTo.bank, mfs: 'BANK' },
  ].filter((r) => r.value)

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto w-full max-w-2xl">
        {/* Top bar: brand + language toggle */}
        <div className="mb-4 flex items-center justify-between gap-2">
          <BrandLogo size={34} brand={brand.name} />
          <Button
            variant="outline" size="sm" className="press"
            onClick={() => setLang(lang === 'en' ? 'bn' : 'en')}
            aria-label="Language"
          >
            {t('ipubLangToggle')}
          </Button>
        </div>

        {/* Overdue warning */}
        {overdue && (
          <div className="anim-fade-up mb-4 flex items-start gap-2.5 rounded-xl border border-warning/30 bg-warning/10 p-3.5 text-sm text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{t('ipubOverdueWarn')}</span>
          </div>
        )}

        {/* Invoice document card */}
        <div className="anim-fade-up overflow-hidden rounded-2xl border bg-card shadow-brand-lg">
          {/* Brand header */}
          <div className="border-b bg-muted/40 px-5 py-4 sm:px-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-lg font-bold text-foreground">{brand.name}</p>
                {(brand.supportPhone || brand.supportEmail) && (
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {[brand.supportPhone, brand.supportEmail].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
              <div className="text-right">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t('ipubInvoiceNo')}</p>
                <p className="font-mono text-sm font-bold text-foreground">{invoice.number}</p>
                <div className="mt-1.5 flex justify-end">{statusBadge(invoice.status, t)}</div>
              </div>
            </div>
          </div>

          <div className="px-5 py-5 sm:px-6">
            <h1 className="text-base font-bold text-foreground">{invoice.title}</h1>

            <div className="mt-3 grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
              <div>
                <p className="text-muted-foreground">{t('ipubBillTo')}</p>
                <p className="font-semibold text-foreground">{invoice.customerName ?? '—'}</p>
              </div>
              <div className="sm:text-right">
                <p className="text-muted-foreground">{t('ipubIssued')}</p>
                <p className="font-semibold text-foreground">{fmtDate(invoice.createdAt)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">{t('ipubDue')}</p>
                <p className={cn('font-semibold', overdue ? 'text-destructive' : 'text-foreground')}>
                  {invoice.dueDate ? fmtDate(invoice.dueDate) : '—'}
                </p>
              </div>
              {invoice.paidAt && (
                <div className="sm:text-right">
                  <p className="text-muted-foreground">{t('ipubPaidOn')}</p>
                  <p className="font-semibold text-success">{fmtDate(invoice.paidAt)}</p>
                </div>
              )}
            </div>

            {/* Items */}
            <div className="mt-5">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t('ipubItems')}</p>
              <div className="overflow-hidden rounded-xl border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/50 text-left">
                      <th className="px-3 py-2 font-semibold text-muted-foreground">{t('ipubDesc')}</th>
                      <th className="px-3 py-2 text-right font-semibold text-muted-foreground">{t('ipubQty')}</th>
                      <th className="px-3 py-2 text-right font-semibold text-muted-foreground">{t('ipubUnitPrice')}</th>
                      <th className="px-3 py-2 text-right font-semibold text-muted-foreground">{t('ipubTotal')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoice.items.map((it, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="px-3 py-2 font-medium text-foreground">{it.description}</td>
                        <td className="px-3 py-2 text-right tabular text-foreground/80">{it.quantity}</td>
                        <td className="px-3 py-2 text-right tabular text-foreground/80">{formatBDT(it.unitPrice, false)}</td>
                        <td className="px-3 py-2 text-right tabular font-semibold text-foreground">{formatBDT(it.total, false)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Totals */}
            <div className="ml-auto mt-4 w-full max-w-60 space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('ipubSubtotal')}</span>
                <span className="tabular font-semibold text-foreground">{formatBDT(invoice.subtotal, false)}</span>
              </div>
              {invoice.discount > 0 && (
                <div className="flex justify-between text-success">
                  <span>{t('ipubDiscount')}</span>
                  <span className="tabular font-semibold">−{formatBDT(invoice.discount, false)}</span>
                </div>
              )}
              {invoice.tax > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('ipubTax')}</span>
                  <span className="tabular font-semibold text-foreground">+{formatBDT(invoice.tax, false)}</span>
                </div>
              )}
              {invoice.shipping > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('ipubShipping')}</span>
                  <span className="tabular font-semibold text-foreground">+{formatBDT(invoice.shipping, false)}</span>
                </div>
              )}
              <div className="flex justify-between border-t pt-1.5 text-base">
                <span className="font-bold text-foreground">{t('ipubTotal')}</span>
                <span className="tabular font-extrabold text-foreground">{formatBDT(invoice.total)}</span>
              </div>
            </div>

            {invoice.publicNote && (
              <div className="mt-4 rounded-xl bg-muted/50 p-3.5 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{t('ipubNote')}:</span> {invoice.publicNote}
              </div>
            )}
          </div>
        </div>

        {/* Pay-now / verifying card */}
        {claimable && (
          <div className="anim-fade-up mt-4 rounded-2xl border bg-card p-5 shadow-brand-lg sm:p-6">
            <h2 className="text-sm font-bold text-foreground">{t('ipubPayNowTitle')}</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t('ipubPayHint')}</p>

            <div className="mt-4 space-y-2">
              {payRows.map((row) => (
                <div key={row.label} className="flex items-center gap-3 rounded-xl border p-3">
                  <GatewayLogo mfs={row.mfs} size={28} rounded="rounded-lg" />
                  <span
                    className="inline-flex shrink-0 items-center rounded-md px-2 py-1 text-xs font-bold"
                    style={{ color: row.color, backgroundColor: row.bg }}
                  >
                    {row.label}
                  </span>
                  <span className="tabular min-w-0 flex-1 truncate font-mono text-sm font-semibold text-foreground">{row.value}</span>
                  <CopyButton value={row.value} compact className="px-1.5" />
                </div>
              ))}
            </div>

            <Button className="press mt-4 w-full gap-2" onClick={claim} disabled={claiming}>
              {claiming
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <CheckCircle2 className="h-4 w-4" />}
              {claiming ? t('loading') : t('ipubIHavePaid')}
            </Button>
          </div>
        )}

        {verifying && (
          <div className="anim-fade-up mt-4 rounded-2xl border bg-card p-6 text-center shadow-brand-lg">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
            <p className="mt-3 text-sm font-bold text-foreground">{t('ipubVerifying')}</p>
            <p className="mx-auto mt-1.5 max-w-sm text-xs leading-relaxed text-muted-foreground">{t('ipubVerifyingHint')}</p>
            <p className="tabular mt-4 rounded-xl bg-primary/10 py-2.5 text-lg font-bold text-primary">
              {formatBDT(invoice.total)}
            </p>
          </div>
        )}

        <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-[11px] text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" /> {t('ipubSecuredBy')} · {t('ipubPoweredBy')} {brand.name}
        </p>
      </div>
    </div>
  )
}

export function InvoicePublicClient({ token }: { token: string }) {
  return (
    <LangProvider>
      <InvoicePublicView token={token} />
    </LangProvider>
  )
}
