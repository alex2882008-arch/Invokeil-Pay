'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, BadgeCheck, ShieldCheck, QrCode } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { MfsBadge } from '@/components/panel/ui-bits'
import { VER_EN, VER_BN } from '@/lib/i18n/verify'
import { formatBDT, formatDateTime } from '@/lib/format'

type Receipt = {
  kind: 'transaction' | 'invoice' | 'checkout'
  status: string
  amount: number
  currency: string
  date: string
  brandName: string
  method: string | null
  payer: string | null
  refMasked: string | null
  verifyUrl: string
}

const KIND_KEY: Record<Receipt['kind'], string> = {
  transaction: 'verKindTransaction',
  invoice: 'verKindInvoice',
  checkout: 'verKindCheckout',
}

const isGood = (s: string) => s === 'PAID' || s === 'MATCHED' || s === 'DELIVERED'

// ── Public receipt verification (token/ref = the only credential) ────────────
export function VerifyPublicView({ receiptRef: initialRef }: { receiptRef: string }) {
  const [lang, setLang] = useState<'en' | 'bn'>('en')
  const t = useCallback((k: string) => (lang === 'bn' ? VER_BN[k] ?? VER_EN[k] ?? k : VER_EN[k] ?? k), [lang])

  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [manualRef, setManualRef] = useState('')

  useEffect(() => {
    try {
      const saved = localStorage.getItem('ilp_lang')
      if (saved === 'bn') setLang('bn')
    } catch { /* ignore */ }
  }, [])

  const toggleLang = () => {
    setLang((prev) => {
      const next = prev === 'en' ? 'bn' : 'en'
      try { localStorage.setItem('ilp_lang', next) } catch { /* ignore */ }
      document.documentElement.lang = next
      return next
    })
  }

  const load = useCallback(async (ref: string) => {
    setLoading(true)
    setNotFound(false)
    setReceipt(null)
    try {
      const res = await fetch(`/api/verify/${encodeURIComponent(ref)}`)
      if (res.status === 404) { setNotFound(true); return }
      if (!res.ok) throw new Error('Failed')
      const body = (await res.json()) as { receipt: Receipt }
      setReceipt(body.receipt)
    } catch {
      setNotFound(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load(initialRef) }, [initialRef, load])

  if (loading) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-8">
        <Skeleton className="h-8 w-56 rounded-lg" />
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    )
  }

  // ── 404 state ──
  if (notFound || !receipt) {
    return (
      <Card className="ilp-fade-up mx-auto mt-10 max-w-md p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-lg font-bold text-foreground">{t('verNotFoundTitle')}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t('verNotFoundHint')}</p>
        <form
          className="mt-5 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            const v = manualRef.trim()
            if (v) window.location.href = `/verify/${encodeURIComponent(v)}`
          }}
        >
          <Input
            value={manualRef}
            onChange={(e) => setManualRef(e.target.value)}
            placeholder="TrxID / token…"
            aria-label={t('verTryAgain')}
          />
          <Button type="submit" className="press shrink-0">{t('verTryAgain')}</Button>
        </form>
      </Card>
    )
  }

  const paid = isGood(receipt.status)

  // ── Verified receipt ──
  return (
    <div className="ilp-fade-up mx-auto max-w-md space-y-4 py-4">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">{t('verVerified')}</p>
        <h1 className="mt-1 text-xl font-bold text-foreground">{t('verTrustTitle')}</h1>
      </div>

      <Card className="overflow-hidden p-0">
        {/* status strip */}
        <div className={`flex items-center justify-between gap-3 px-5 py-4 ${paid ? 'bg-success/10' : 'bg-warning/10'}`}>
          <div className="flex items-center gap-2.5">
            <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${paid ? 'bg-success/15 text-success' : 'bg-warning/20 text-amber-600 dark:text-amber-400'}`}>
              <BadgeCheck className="h-5 w-5" />
            </span>
            <div>
              <p className={`text-sm font-bold ${paid ? 'text-success' : 'text-foreground'}`}>{receipt.status}</p>
              <p className="text-[11px] text-muted-foreground">{t(KIND_KEY[receipt.kind])}</p>
            </div>
          </div>
          <MfsBadge mfs={receipt.method ?? 'OTHER'} />
        </div>

        {/* amount */}
        <div className="border-t px-5 py-6 text-center">
          <p className="text-3xl font-bold tabular tracking-tight text-foreground sm:text-4xl">
            {formatBDT(receipt.amount)}
            <span className="ml-1 text-sm font-medium text-muted-foreground">{receipt.currency}</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(receipt.date)}</p>
        </div>

        {/* details */}
        <dl className="border-t px-5 py-2 text-xs">
          <div className="flex items-center justify-between gap-4 border-b py-2.5 last:border-0">
            <dt className="shrink-0 font-medium text-muted-foreground">{t('verBrand')}</dt>
            <dd className="truncate font-semibold text-foreground">{receipt.brandName}</dd>
          </div>
          <div className="flex items-center justify-between gap-4 border-b py-2.5 last:border-0">
            <dt className="shrink-0 font-medium text-muted-foreground">{t('verPayer')}</dt>
            <dd className="font-mono font-semibold text-foreground" title={t('verPayerMasked')}>{receipt.payer ?? '—'}</dd>
          </div>
          <div className="flex items-center justify-between gap-4 border-b py-2.5 last:border-0">
            <dt className="shrink-0 font-medium text-muted-foreground">{t('verReference')}</dt>
            <dd className="font-mono font-semibold text-foreground" title={t('verRefMasked')}>{receipt.refMasked ?? '—'}</dd>
          </div>
          <div className="flex items-center justify-between gap-4 py-2.5">
            <dt className="shrink-0 font-medium text-muted-foreground">{t('verKind')}</dt>
            <dd className="font-semibold text-foreground">{t(KIND_KEY[receipt.kind])}</dd>
          </div>
        </dl>
      </Card>

      {/* trust note */}
      <div className="rounded-xl border border-success/25 bg-success/5 p-4">
        <p className="flex items-start gap-2 text-xs leading-relaxed text-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
          {t('verTrustNote')}
        </p>
        {paid && <p className="mt-2 pl-6 text-[11px] text-muted-foreground">{t('verPaidNote')}</p>}
      </div>

      {/* deep link / QR hint */}
      <div className="rounded-xl border bg-card p-4">
        <p className="flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
          <QrCode className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {t('verQrHint')}
        </p>
        <p className="mt-2 break-all rounded-lg bg-muted/60 p-2 font-mono text-[11px] text-foreground">
          {typeof window !== 'undefined' ? window.location.href : receipt.verifyUrl}
        </p>
      </div>

      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" className="press h-8 text-xs" onClick={toggleLang}>
          {lang === 'en' ? 'বাংলা' : 'EN'}
        </Button>
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('verPowered')} Invokeil Pay</p>
      </div>
    </div>
  )
}
