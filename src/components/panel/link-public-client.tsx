'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckCircle2, Clock, Globe, Loader2, ShieldCheck, XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatBDT } from '@/lib/format'
import { MFS_META } from '@/lib/format'
import { gatewayColor, GATEWAY_CATALOG } from '@/lib/gateways'
import { cn } from '@/lib/utils'
import { LangProvider, useLang } from '@/lib/i18n'
import { CopyButton } from './ui-bits'
import { GatewayLogo } from './gateway-logo'

// ── Public payment link page (/link/[slug]) ──────────────────────────────────
// Hero (gateway-colored) → amount/custom fields → pay-to numbers → "I have paid"
// → claim creates an AWAITING checkout → poll /api/pay/{token} → auto-success.

interface LinkFieldDef {
  name: string
  label: string
  required: boolean
}

interface LinkInfo {
  title: string
  description: string | null
  amountType: string
  amount: number
  minAmount: number | null
  maxAmount: number | null
  currency: string
  gatewayCode: string | null
  customFields: LinkFieldDef[]
  status: string
  expiresAt: string | null
  usageLimit: number | null
  usedCount: number
}

interface LinkPayload {
  link: LinkInfo
  brand: { name: string }
  payTo: { bkash: string; nagad: string; rocket: string; upay: string; bank: string }
}

type Phase = 'loading' | 'form' | 'verifying' | 'success' | 'failed' | 'not_found' | 'expired' | 'disabled'

function LinkPublicView({ slug }: { slug: string }) {
  const { t, lang, setLang } = useLang()
  const [payload, setPayload] = useState<LinkPayload | null>(null)
  const [phase, setPhase] = useState<Phase>('loading')
  const [claimedAmount, setClaimedAmount] = useState<number | null>(null)

  // form state
  const [amount, setAmount] = useState('')
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [senderNumber, setSenderNumber] = useState('')
  const [trxId, setTrxId] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [claimToken, setClaimToken] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/link/${encodeURIComponent(slug)}`)
      if (res.status === 404) {
        setPhase('not_found')
        return
      }
      if (!res.ok) {
        setPhase('not_found')
        return
      }
      const d = (await res.json()) as LinkPayload
      if (!d || !d.link) {
        setPhase('not_found')
        return
      }
      setPayload(d)
      if (d.link.status !== 'ACTIVE') {
        setPhase('disabled')
        return
      }
      if (d.link.expiresAt && new Date(d.link.expiresAt) < new Date()) {
        setPhase('expired')
        return
      }
      if (d.link.usageLimit != null && d.link.usedCount >= d.link.usageLimit) {
        setPhase('expired')
        return
      }
      setPhase('form')
    } catch {
      setPhase('not_found')
    }
  }, [slug])

  useEffect(() => {
    load()
  }, [load])

  const gatewayName = payload?.link.gatewayCode
    ? GATEWAY_CATALOG.find((g) => g.code === payload.link.gatewayCode)?.name ?? payload.link.gatewayCode
    : null

  // ── Poll the created checkout while verifying ──
  useEffect(() => {
    if (phase !== 'verifying' || !claimToken) return

    let cancelled = false
    const check = async () => {
      try {
        const res = await fetch(`/api/pay/${encodeURIComponent(claimToken)}`)
        if (cancelled) return
        if (res.status === 410) {
          setPhase('expired')
          return
        }
        if (res.status === 404) {
          // checkout vanished — stay in verifying, the claim is likely still processing
          return
        }
        if (!res.ok) return
        const d = (await res.json()) as { checkout?: { status?: string } }
        const st = d?.checkout?.status
        if (st === 'PAID') setPhase('success')
        else if (st === 'CANCELLED') setPhase('failed')
      } catch { /* transient network errors: keep polling */ }
    }

    check()
    pollRef.current = setInterval(check, 4000)
    return () => {
      cancelled = true
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [phase, claimToken])

  // ── VARIABLE amount live validation ──
  const amountError = useMemo((): string | null => {
    if (!payload || payload.link.amountType !== 'VARIABLE') return null
    const raw = amount.trim()
    if (!raw) return null
    const n = Number(raw)
    if (!Number.isFinite(n) || n <= 0) return t('lpubEnterAmount')
    const min = payload.link.minAmount ?? 0
    const max = payload.link.maxAmount
    if (n < min) return t('lpubAmountTooLow').replace('{min}', String(min))
    if (max != null && n > max) return t('lpubAmountTooHigh').replace('{max}', String(max))
    return null
  }, [payload, amount, t])

  const claimedValid = payload
    ? payload.link.amountType === 'FIXED' || (amount.trim() !== '' && amountError == null)
    : false

  const submitClaim = async () => {
    if (!payload) return
    const errs: Record<string, string> = {}
    for (const f of payload.link.customFields) {
      if (f.required && !answers[f.name]?.trim()) errs[f.name] = t('lpubFieldRequired')
    }
    setFieldErrors(errs)
    if (Object.keys(errs).length > 0) return

    if (!senderNumber.trim()) {
      toast.error(t('lpubNumberRequired'))
      return
    }
    if (!claimedValid) {
      toast.error(amountError ?? t('lpubClaimFailed'))
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch(`/api/link/${encodeURIComponent(slug)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: payload.link.amountType === 'FIXED' ? payload.link.amount : Number(amount),
          answers,
          senderNumber: senderNumber.trim(),
          trxId: trxId.trim() || undefined,
        }),
      })
      const d = (await res.json().catch(() => null)) as { ok?: boolean; token?: string; error?: string } | null
      if (res.ok && d?.ok && d.token) {
        setClaimedAmount(payload.link.amountType === 'FIXED' ? payload.link.amount : Number(amount))
        setClaimToken(d.token)
        setPhase('verifying')
      } else {
        toast.error(d?.error ?? t('lpubClaimFailed'))
      }
    } catch {
      toast.error(t('lpubClaimFailed'))
    } finally {
      setSubmitting(false)
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

  if (phase === 'not_found' || phase === 'expired' || phase === 'disabled' || phase === 'failed') {
    const icon = phase === 'expired' ? <Clock className="h-14 w-14 text-amber-500" /> : phase === 'disabled'
      ? <XCircle className="h-14 w-14 text-muted-foreground/50" />
      : <XCircle className="h-14 w-14 text-destructive" />
    const msg = phase === 'expired' ? t('lpubExpired') : phase === 'disabled'
      ? t('lpubDisabled') : phase === 'failed' ? t('lpubClaimFailed') : t('lpubNotFound')
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
        <div className="anim-scale-in rounded-2xl border bg-card p-10 shadow-brand-lg">
          {icon}
          <h1 className="mt-4 text-lg font-bold text-foreground">{msg}</h1>
          <p className="mt-1.5 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" /> {t('lpubSecuredBy')}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">{t('lpubPoweredBy')} {payload?.brand.name ?? 'Invokeil Pay'}</p>
      </div>
    )
  }

  if (phase === 'success') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="anim-scale-in w-full max-w-md rounded-2xl border bg-card p-10 text-center shadow-brand-lg">
          <CheckCircle2 className="mx-auto h-16 w-16 text-success" />
          <h1 className="mt-4 text-xl font-extrabold text-foreground">{t('lpubSuccessTitle')}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">{t('lpubSuccessHint')}</p>
          {claimedAmount != null && (
            <p className="tabular mt-4 rounded-xl bg-success/10 py-3 text-2xl font-bold text-success">
              {formatBDT(claimedAmount)}
            </p>
          )}
          <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" /> {t('lpubSecuredBy')}
          </p>
        </div>
      </div>
    )
  }

  if (!payload) return null

  const { link, brand, payTo } = payload
  const heroColor = gatewayColor(link.gatewayCode)
  const isFixed = link.amountType === 'FIXED'

  const numbers: Array<{ label: string; value: string; color: string; mfs: string }> = []
  if (payTo.bkash) numbers.push({ label: 'bKash', value: payTo.bkash, color: MFS_META.BKASH.color, mfs: 'BKASH' })
  if (payTo.nagad) numbers.push({ label: 'Nagad', value: payTo.nagad, color: MFS_META.NAGAD.color, mfs: 'NAGAD' })
  if (payTo.rocket) numbers.push({ label: 'Rocket', value: payTo.rocket, color: MFS_META.ROCKET.color, mfs: 'ROCKET' })
  if (payTo.upay) numbers.push({ label: 'Upay', value: payTo.upay, color: MFS_META.UPAY.color, mfs: 'UPAY' })
  if (payTo.bank) numbers.push({ label: 'Bank', value: payTo.bank, color: MFS_META.BANK.color, mfs: 'BANK' })

  return (
    <div className="min-h-screen bg-background pb-14">
      {/* Gateway-colored hero */}
      <div style={{ backgroundColor: heroColor }} className="safe-top px-4 pb-20 pt-6 text-white">
        <div className="mx-auto max-w-md">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-bold tracking-tight">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white/20">
                <Globe className="h-3.5 w-3.5" />
              </span>
              {brand.name}
            </span>
            <button
              type="button"
              onClick={() => setLang(lang === 'en' ? 'bn' : 'en')}
              className="press rounded-full bg-white/20 px-3 py-1 text-xs font-bold hover:bg-white/30"
              aria-label="Language"
            >
              {t('lpubChangeLang')}
            </button>
          </div>

          <div className="mt-8 text-center">
            {phase === 'verifying' ? (
              <>
                <p className="text-sm opacity-90">{t('lpubVerifying')}</p>
                <p className="tabular mt-1 text-4xl font-extrabold tracking-tight">
                  {formatBDT(claimedAmount ?? link.amount)}
                </p>
              </>
            ) : (
              <>
                <p className="text-sm opacity-90">{t('lpubYouArePaying')}</p>
                {isFixed ? (
                  <p className="tabular mt-1 text-4xl font-extrabold tracking-tight">{formatBDT(link.amount)}</p>
                ) : (
                  <p className="tabular mt-1 text-3xl font-extrabold tracking-tight">
                    ৳{link.minAmount ?? 0}{link.maxAmount != null ? ` – ৳${link.maxAmount}` : '+'}
                  </p>
                )}
              </>
            )}
            <p className="mt-2 text-base font-semibold opacity-95">{link.title}</p>
            {link.description && <p className="mt-1 text-xs opacity-80">{link.description}</p>}
          </div>
        </div>
      </div>

      <div className="mx-auto -mt-12 max-w-md space-y-4 px-4">
        {/* Verifying card */}
        {phase === 'verifying' && (
          <div className="anim-fade-up rounded-2xl border bg-card p-6 text-center shadow-brand-lg">
            <Clock className="live-dot mx-auto h-12 w-12 text-amber-500" />
            <p className="mt-3 text-base font-bold text-foreground">{t('lpubVerifying')}</p>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{t('lpubVerifyingHint')}</p>
            <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {senderNumber ? `+88 ${senderNumber}` : ''}
              {trxId ? ` · ${trxId}` : ''}
            </div>
          </div>
        )}

        {/* Payment form */}
        {phase === 'form' && (
          <div className="anim-fade-up space-y-4">
            {/* Amount input for VARIABLE */}
            {!isFixed && (
              <div className="rounded-2xl border bg-card p-5 shadow-brand-lg">
                <Label htmlFor="pub-amount" className="text-sm font-bold text-foreground">
                  {t('lpubEnterAmount')} *
                </Label>
                <div className="relative mt-2">
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-lg font-bold text-muted-foreground">৳</span>
                  <Input
                    id="pub-amount"
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder={`${link.minAmount ?? 0}`}
                    className="tabular h-12 pl-9 text-lg font-bold"
                  />
                </div>
                <p className={cn('mt-2 text-xs', amountError ? 'font-semibold text-destructive' : 'text-muted-foreground')}>
                  {amountError ?? t('lpubAmountRange').replace('{min}', String(link.minAmount ?? 0)).replace('{max}', String(link.maxAmount ?? '∞'))}
                </p>
              </div>
            )}

            {/* Custom fields */}
            {link.customFields.length > 0 && (
              <div className="rounded-2xl border bg-card p-5 shadow-brand-lg">
                <p className="mb-3 text-sm font-bold text-foreground">{t('customFieldsLabel')}</p>
                <div className="space-y-3">
                  {link.customFields.map((f) => (
                    <div key={f.name} className="grid gap-1.5">
                      <Label htmlFor={`cf-${f.name}`} className="text-xs font-semibold text-foreground/80">
                        {f.label} {f.required && <span className="text-destructive">*</span>}
                      </Label>
                      <Input
                        id={`cf-${f.name}`}
                        value={answers[f.name] ?? ''}
                        onChange={(e) => setAnswers((a) => ({ ...a, [f.name]: e.target.value }))}
                        maxLength={300}
                        className={cn('h-9', fieldErrors[f.name] && 'border-destructive')}
                      />
                      {fieldErrors[f.name] && (
                        <p className="text-[11px] font-semibold text-destructive">{fieldErrors[f.name]}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pay-to numbers */}
            <div className="rounded-2xl border bg-card p-5 shadow-brand-lg">
              <p className="mb-3 text-sm font-bold text-foreground">{t('lpubPayTo')}</p>
              <div className="space-y-2">
                {numbers.map((n) => (
                  <div key={n.label} className="flex items-center justify-between gap-2 rounded-xl border bg-muted/40 px-4 py-3">
                    <GatewayLogo mfs={n.mfs} size={32} rounded="rounded-lg" />
                    <div className="min-w-0">
                      <p className="font-mono text-base font-bold tracking-wide text-foreground">{n.value}</p>
                      <p className="text-[11px] font-semibold" style={{ color: n.color }}>{n.label}</p>
                    </div>
                    <CopyButton value={n.value} compact className="shrink-0" label={undefined} />
                  </div>
                ))}
                {numbers.length === 0 && (
                  <p className="rounded-xl border border-dashed px-4 py-3 text-center text-xs text-muted-foreground">
                    {t('lpubPayTo')} — {gatewayName ?? t('anyGateway')}
                  </p>
                )}
              </div>
              {gatewayName && (
                <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <GatewayLogo code={link.gatewayCode} size={20} rounded="rounded-md" />
                  {gatewayName}
                </p>
              )}
            </div>

            {/* How to pay */}
            <div className="rounded-2xl border bg-card p-5 shadow-brand-lg">
              <p className="mb-3 text-sm font-bold text-foreground">{t('lpubHowToPay')}</p>
              <ol className="space-y-2.5">
                {[t('lpubStep1'), t('lpubStep2'), t('lpubStep3'), t('lpubStep4')].map((s, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm leading-snug text-muted-foreground">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                      {i + 1}
                    </span>
                    {s}
                  </li>
                ))}
              </ol>
            </div>

            {/* Claim form */}
            <div className="rounded-2xl border bg-card p-5 shadow-brand-lg">
              <div className="grid gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="pub-sender" className="text-xs font-semibold text-foreground/80">
                    {t('lpubYourNumber')} <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="pub-sender"
                    value={senderNumber}
                    onChange={(e) => setSenderNumber(e.target.value)}
                    placeholder="01XXXXXXXXX"
                    inputMode="tel"
                    className="h-10"
                  />
                  <p className="text-[11px] text-muted-foreground">{t('lpubYourNumberHint')}</p>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="pub-trxid" className="text-xs font-semibold text-foreground/80">
                    {t('lpubTrxId')}
                  </Label>
                  <Input
                    id="pub-trxid"
                    value={trxId}
                    onChange={(e) => setTrxId(e.target.value)}
                    placeholder="9F7A2K1B"
                    className="h-10 font-mono"
                  />
                </div>
                <Button
                  className="press h-12 w-full text-sm font-bold"
                  onClick={submitClaim}
                  disabled={submitting || (!isFixed && !claimedValid)}
                >
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t('lpubIHavePaid')}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex flex-col items-center gap-1 pt-2 text-center">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" /> {t('lpubSecuredBy')}
          </p>
          <p className="text-xs text-muted-foreground/70">
            {t('lpubPoweredBy')} <span className="font-semibold text-muted-foreground">{brand.name}</span>
          </p>
        </div>
      </div>
    </div>
  )
}

export function LinkPublicClient({ slug }: { slug: string }) {
  return (
    <LangProvider>
      <LinkPublicView slug={slug} />
    </LangProvider>
  )
}
