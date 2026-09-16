'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Store, ToggleLeft, Smartphone, ReceiptText, Check, Copy, ExternalLink, SkipForward,
  ChevronLeft, ArrowRight, Loader2, ShieldCheck, KeyRound, LayoutDashboard,
} from 'lucide-react'
import QRCode from 'qrcode'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { fetchApi } from '@/lib/api-client'
import { copyText } from './ui-bits'
import { GatewayLogo } from './gateway-logo'
import { cn } from '@/lib/utils'
import { useLang } from '@/lib/i18n'

// ── Types ────────────────────────────────────────────────────────────────────

interface GatewayRow {
  id: string
  code: string
  name: string
  mfs: string
  category: string
  enabled: boolean
  color: string
  accountType: string
}

interface DeviceResult {
  deviceKey: string
  pairingCode: string | null
}

interface CheckoutResult {
  token: string
}

const STEPS = [1, 2, 3, 4] as const

/** Fresh-install preselect: the everyday MFS gateways. */
const COMMON_GATEWAY_CODES = ['BKASH_PERSONAL', 'NAGAD_PERSONAL', 'ROCKET_PERSONAL', 'UPAY_PERSONAL']

// ── Component ────────────────────────────────────────────────────────────────

export function WizardView() {
  const { t } = useLang()
  const router = useRouter()

  const [step, setStep] = useState(1)
  const [busy, setBusy] = useState(false)
  const [skipOpen, setSkipOpen] = useState(false)
  const [done, setDone] = useState(false)

  // step 1
  const [brandName, setBrandName] = useState('')
  const [bkash, setBkash] = useState('')
  const [nagad, setNagad] = useState('')

  // step 2
  const [gateways, setGateways] = useState<GatewayRow[] | null>(null)
  const [enabledCodes, setEnabledCodes] = useState<Set<string>>(new Set())

  // step 3
  const [deviceName, setDeviceName] = useState('')
  const [device, setDevice] = useState<DeviceResult | null>(null)
  const [deviceQr, setDeviceQr] = useState<string | null>(null)

  // step 4
  const [coTitle, setCoTitle] = useState('')
  const [coAmount, setCoAmount] = useState('')
  const [coPhone, setCoPhone] = useState('')
  const [checkout, setCheckout] = useState<CheckoutResult | null>(null)

  const [origin, setOrigin] = useState('')

  useEffect(() => {
    setOrigin(window.location.origin)
    // prefill brand step from saved settings
    void fetchApi<{ settings: Record<string, string> }>('/api/admin/settings')
      .then((r) => {
        setBrandName(r.settings.brandName === 'Invokeil Pay' ? '' : r.settings.brandName ?? '')
        setBkash(r.settings.number_bkash ?? '')
        setNagad(r.settings.number_nagad ?? '')
      })
      .catch(() => undefined)
  }, [])

  const loadGateways = useCallback(async () => {
    try {
      const res = await fetchApi<{ gateways: GatewayRow[] }>('/api/admin/gateways')
      setGateways(res.gateways)
      // Preselect currently-enabled ones plus the common everyday MFS gateways
      const pre = new Set(res.gateways.filter((g) => g.enabled).map((g) => g.code))
      for (const code of COMMON_GATEWAY_CODES) {
        if (res.gateways.some((g) => g.code === code)) pre.add(code)
      }
      setEnabledCodes(pre)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Request failed')
    }
  }, [])

  useEffect(() => {
    if (step === 2 && gateways === null) void loadGateways()
  }, [step, gateways, loadGateways])

  const toggleGateway = (code: string) => {
    setEnabledCodes((prev) => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  async function post<T = Record<string, unknown>>(body: Record<string, unknown>): Promise<T> {
    return fetchApi<T>('/api/admin/wizard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  const complete = async () => {
    await post({ step: 'complete' })
    toast.success(t('wizDoneToast'))
    router.push('/admin/dashboard')
    router.refresh()
  }

  // ── Step submissions ──

  const submitStep1 = async () => {
    if (!brandName.trim()) { toast.error(t('s1Title')); return }
    setBusy(true)
    try {
      await post({
        step: 1,
        brandName: brandName.trim(),
        number_bkash: bkash.trim(),
        number_nagad: nagad.trim(),
      })
      toast.success(t('s1SavedToast'))
      setStep(2)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setBusy(false)
    }
  }

  const submitStep2 = async () => {
    setBusy(true)
    try {
      await post({ step: 2, enableGatewayCodes: [...enabledCodes] })
      toast.success(t('s2SavedToast'))
      setStep(3)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setBusy(false)
    }
  }

  const submitStep3 = async () => {
    if (!deviceName.trim()) { toast.error(t('s3NameLabel')); return }
    setBusy(true)
    try {
      const res = await post<DeviceResult>({ step: 3, deviceName: deviceName.trim() })
      setDevice(res)
      const payload = JSON.stringify({ url: window.location.origin, key: res.deviceKey, code: res.pairingCode })
      setDeviceQr(await QRCode.toDataURL(payload, { width: 240, margin: 1 }))
      toast.success(t('s3SavedToast'))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setBusy(false)
    }
  }

  const submitStep4 = async () => {
    const amount = Number(coAmount)
    if (!coTitle.trim()) { toast.error(t('s4TitleLabel')); return }
    if (!Number.isFinite(amount) || amount <= 0) { toast.error(t('s4AmountLabel')); return }
    setBusy(true)
    try {
      const res = await post<CheckoutResult>({
        step: 4,
        title: coTitle.trim(),
        amount,
        customerPhone: coPhone.trim(),
      })
      setCheckout(res)
      toast.success(t('s4SavedToast'))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setBusy(false)
    }
  }

  const copyValue = async (value: string, what?: string) => {
    if (await copyText(value)) toast.success(what ?? t('copied'))
  }

  const grouped = useMemo(() => {
    if (!gateways) return []
    const pick = (cat: string) => gateways.filter((g) => g.category === cat)
    return [
      { label: 'MFS', items: pick('MFS') },
      { label: 'BANK', items: pick('BANK') },
      { label: 'GLOBAL', items: pick('GLOBAL') },
    ].filter((g) => g.items.length > 0)
  }, [gateways])

  const checkoutUrl = checkout ? `${origin}/pay/${checkout.token}` : ''
  const stepMeta = [
    { n: 1, icon: Store, label: t('step1Label') },
    { n: 2, icon: ToggleLeft, label: t('step2Label') },
    { n: 3, icon: Smartphone, label: t('step3Label') },
    { n: 4, icon: ReceiptText, label: t('step4Label') },
  ]

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-background">
      <div className="mx-auto flex min-h-full w-full max-w-xl flex-col px-4 py-6 sm:py-10">
        {/* Header */}
        {!done && (
        <div className="anim-fade-up">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">{t('wizTitle')}</h1>
              <p className="mt-1 text-xs text-muted-foreground sm:text-sm">{t('wizSubtitle')}</p>
            </div>
            <Button
              variant="ghost" size="sm"
              className="press shrink-0 gap-1.5 text-muted-foreground hover:text-foreground"
              onClick={() => setSkipOpen(true)}
            >
              <SkipForward className="h-3.5 w-3.5" /> {t('wizSkip')}
            </Button>
          </div>

          {/* Stepper + progress */}
          <div className="mt-6 flex items-center gap-1.5 sm:gap-2.5">
            {stepMeta.map((s, i) => {
              const Icon = s.icon
              const done = step > s.n
              const current = step === s.n
              return (
                <div key={s.n} className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2.5">
                  <div
                    className={cn(
                      'press flex min-w-0 items-center gap-1.5 rounded-full border px-2 py-1 sm:px-3',
                      done && 'border-success/25 bg-success/10 text-success',
                      current && 'border-primary/30 bg-primary/10 text-primary',
                      !done && !current && 'border-border bg-muted text-muted-foreground'
                    )}
                  >
                    {done ? <Check className="h-3.5 w-3.5 shrink-0" /> : <Icon className="h-3.5 w-3.5 shrink-0" />}
                    <span className="hidden truncate text-xs font-semibold sm:block">{s.label}</span>
                    <span className="text-xs font-bold sm:hidden">{s.n}</span>
                  </div>
                  {i < stepMeta.length - 1 && <div className={cn('h-px flex-1', step > s.n ? 'bg-success/40' : 'bg-border')} />}
                </div>
              )
            })}
          </div>
          <Progress value={(step / 4) * 100} className="mt-4 h-1.5" aria-label={`${t('wizStep')} ${step} ${t('wizOf')} 4`} />
        </div>
        )}

        {/* Body */}
        <div className="mt-6 flex-1">
          {/* ── Finish screen ── */}
          {done ? (
            <Card className="anim-scale-in flex flex-col items-center p-8 text-center shadow-brand">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/15 text-success">
                <Check className="h-9 w-9" strokeWidth={3} />
              </div>
              <h2 className="mt-4 text-xl font-bold text-foreground">{t('wizDoneTitle')}</h2>
              <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">{t('wizDoneDescription')}</p>
              <Button
                size="lg"
                className="press mt-6 gap-2"
                disabled={busy}
                onClick={() => {
                  setBusy(true)
                  void complete().finally(() => setBusy(false))
                }}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LayoutDashboard className="h-4 w-4" />}
                {t('wizOpenDashboard')}
              </Button>
            </Card>
          ) : (
          <>
          {/* ── Step 1: Brand ── */}
          {step === 1 && (
            <Card className="anim-fade-up p-6 shadow-brand">
              <h2 className="text-lg font-bold text-foreground">{t('s1Title')}</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t('s1Description')}</p>
              <div className="mt-5 grid gap-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="wiz-brand">{t('s1BrandLabel')} *</Label>
                  <Input
                    id="wiz-brand"
                    value={brandName}
                    onChange={(e) => setBrandName(e.target.value)}
                    placeholder={t('s1BrandPh')}
                    autoFocus
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label htmlFor="wiz-bkash">{t('s1BkashLabel')}</Label>
                    <Input
                      id="wiz-bkash"
                      value={bkash}
                      onChange={(e) => setBkash(e.target.value)}
                      placeholder={t('s1BkashPh')}
                      inputMode="tel"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="wiz-nagad">{t('s1NagadLabel')}</Label>
                    <Input
                      id="wiz-nagad"
                      value={nagad}
                      onChange={(e) => setNagad(e.target.value)}
                      placeholder={t('s1NagadPh')}
                      inputMode="tel"
                    />
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* ── Step 2: Gateways ── */}
          {step === 2 && (
            <Card className="anim-fade-up p-6 shadow-brand">
              <h2 className="text-lg font-bold text-foreground">{t('s2Title')}</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t('s2Description')}</p>

              {gateways === null ? (
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
                </div>
              ) : (
                <div className="mt-5 space-y-4">
                  {grouped.map((grp) => (
                    <div key={grp.label}>
                      <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{grp.label}</p>
                      <div className="grid gap-2.5 sm:grid-cols-3">
                        {grp.items.map((g) => {
                          const on = enabledCodes.has(g.code)
                          return (
                            <button
                              key={g.id}
                              type="button"
                              onClick={() => toggleGateway(g.code)}
                              aria-pressed={on}
                              className={cn(
                                'press rounded-xl border p-3 text-left transition-colors',
                                on ? 'border-primary/40 bg-primary/5' : 'hover:bg-muted/50'
                              )}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <GatewayLogo code={g.code} mfs={g.mfs} color={g.color} size={28} rounded="rounded-lg" />
                                <span
                                  className={cn(
                                    'flex h-5 w-9 items-center rounded-full p-0.5 transition-colors',
                                    on ? 'bg-primary' : 'bg-muted-foreground/30'
                                  )}
                                >
                                  <span className={cn('h-4 w-4 rounded-full bg-white transition-transform', on && 'translate-x-4')} />
                                </span>
                              </div>
                              <p className="mt-2 truncate text-xs font-semibold text-foreground">{g.name}</p>
                              <p className="truncate text-[11px] text-muted-foreground">{g.accountType}</p>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                  <p className={cn('text-[11px]', enabledCodes.size === 0 ? 'font-semibold text-destructive' : 'text-muted-foreground')}>
                    {enabledCodes.size === 0
                      ? t('s2None')
                      : `${t('s2EnabledCount').replace('{n}', String(enabledCodes.size)).replace('{total}', String(gateways.length))} · ${t('s2Hint')}`}
                  </p>
                </div>
              )}
            </Card>
          )}

          {/* ── Step 3: Device ── */}
          {step === 3 && (
            <Card className="anim-fade-up p-6 shadow-brand">
              <h2 className="text-lg font-bold text-foreground">{t('s3Title')}</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t('s3Description')}</p>

              {!device ? (
                <div className="mt-5 grid max-w-sm gap-1.5">
                  <Label htmlFor="wiz-device-name">{t('s3NameLabel')} *</Label>
                  <div className="flex gap-2">
                    <Input
                      id="wiz-device-name"
                      value={deviceName}
                      onChange={(e) => setDeviceName(e.target.value)}
                      placeholder={t('s3NamePh')}
                      autoFocus
                      onKeyDown={(e) => { if (e.key === 'Enter') void submitStep3() }}
                    />
                    <Button className="press shrink-0" onClick={() => void submitStep3()} disabled={busy || !deviceName.trim()}>
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t('s3Create')}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="anim-scale-in mt-5">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-success" />
                    <p className="font-semibold text-foreground">{t('s3CreatedTitle')}</p>
                  </div>
                  <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start">
                    {deviceQr && (
                      <img
                        src={deviceQr}
                        alt={t('s3PairingLabel')}
                        className="h-[200px] w-[200px] shrink-0 self-center rounded-xl border bg-white p-2 sm:self-start"
                      />
                    )}
                    <div className="w-full space-y-3">
                      <p className="text-xs leading-relaxed text-muted-foreground">{t('s3QrHint')}</p>
                      <div>
                        <Label className="text-xs">{t('s3KeyLabel')}</Label>
                        <div className="mt-1 flex items-center gap-2">
                          <code className="min-w-0 flex-1 truncate rounded-lg bg-muted px-2.5 py-2 font-mono text-xs text-foreground">
                            {device.deviceKey}
                          </code>
                          <Button
                            variant="outline" size="sm" className="press shrink-0 gap-1.5"
                            onClick={() => void copyValue(device.deviceKey, t('s3KeyLabel'))}
                          >
                            <Copy className="h-3.5 w-3.5" /> {t('copy')}
                          </Button>
                        </div>
                      </div>
                      {device.pairingCode && (
                        <div>
                          <Label className="text-xs">{t('s3PairingLabel')}</Label>
                          <div className="mt-1 flex items-center gap-2">
                            <code className="rounded-lg bg-muted px-2.5 py-2 font-mono text-sm font-bold tracking-[0.35em] text-foreground">
                              {device.pairingCode}
                            </code>
                            <Button
                              variant="outline" size="sm" className="press shrink-0 gap-1.5"
                              onClick={() => void copyValue(device.pairingCode ?? '', t('s3PairingLabel'))}
                            >
                              <Copy className="h-3.5 w-3.5" /> {t('copy')}
                            </Button>
                          </div>
                        </div>
                      )}
                      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <KeyRound className="h-3 w-3 shrink-0" /> {t('s3LaterHint')}
                      </p>
                      <ul className="space-y-1.5 rounded-xl border bg-muted/30 p-3">
                        {(['s3Bullet1', 's3Bullet2', 's3Bullet3'] as const).map((k) => (
                          <li key={k} className="flex items-start gap-2 text-xs leading-relaxed text-foreground/80">
                            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                            {t(k)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* ── Step 4: Test checkout ── */}
          {step === 4 && (
            <Card className="anim-fade-up p-6 shadow-brand">
              <h2 className="text-lg font-bold text-foreground">{t('s4Title')}</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t('s4Description')}</p>

              {!checkout ? (
                <div className="mt-5 grid gap-4">
                  <div className="grid gap-1.5">
                    <Label htmlFor="wiz-co-title">{t('s4TitleLabel')} *</Label>
                    <Input
                      id="wiz-co-title"
                      value={coTitle}
                      onChange={(e) => setCoTitle(e.target.value)}
                      placeholder={t('s4TitlePh')}
                      autoFocus
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-1.5">
                      <Label htmlFor="wiz-co-amount">{t('s4AmountLabel')} *</Label>
                      <Input
                        id="wiz-co-amount"
                        type="number"
                        min="1"
                        step="0.01"
                        inputMode="decimal"
                        className="tabular"
                        value={coAmount}
                        onChange={(e) => setCoAmount(e.target.value)}
                        placeholder="500.00"
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="wiz-co-phone">{t('s4PhoneLabel')}</Label>
                      <Input
                        id="wiz-co-phone"
                        value={coPhone}
                        onChange={(e) => setCoPhone(e.target.value)}
                        placeholder={t('s4PhonePh')}
                        inputMode="tel"
                      />
                    </div>
                  </div>
                  <div>
                    <Button className="press gap-1.5" onClick={() => void submitStep4()} disabled={busy}>
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ReceiptText className="h-4 w-4" />}
                      {busy ? t('s4Creating') : t('s4Create')}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="anim-scale-in mt-5">
                  <div className="flex items-center gap-2">
                    <Check className="h-5 w-5 text-success" />
                    <p className="font-semibold text-foreground">{t('s4CreatedTitle')}</p>
                  </div>
                  <div className="mt-4 space-y-3">
                    <div>
                      <Label className="text-xs">{t('s4LinkLabel')}</Label>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <code className="min-w-0 flex-1 truncate rounded-lg bg-muted px-2.5 py-2 font-mono text-xs text-foreground">
                          {checkoutUrl}
                        </code>
                        <Button variant="outline" size="sm" className="press shrink-0 gap-1.5" onClick={() => void copyValue(checkoutUrl, t('s4LinkLabel'))}>
                          <Copy className="h-3.5 w-3.5" /> {t('copy')}
                        </Button>
                        <Button variant="outline" size="sm" className="press shrink-0 gap-1.5" onClick={() => window.open(checkoutUrl, '_blank', 'noopener')}>
                          <ExternalLink className="h-3.5 w-3.5" /> {t('s4Open')}
                        </Button>
                      </div>
                    </div>
                    <p className="text-[11px] leading-relaxed text-muted-foreground">{t('s4Hint')}</p>
                  </div>
                </div>
              )}
            </Card>
          )}
          </>
          )}
        </div>

        {/* Footer navigation */}
        {!done && (
        <div className="anim-fade-up mt-6 flex items-center justify-between gap-3 border-t pt-5">
          <Button
            variant="outline"
            className="press gap-1.5"
            disabled={step === 1 || busy}
            onClick={() => setStep((s) => Math.max(1, s - 1))}
          >
            <ChevronLeft className="h-4 w-4" /> {t('wizBack')}
          </Button>

          {step < 4 ? (
            <Button
              className="press gap-1.5"
              disabled={busy}
              onClick={() => {
                if (step === 1) void submitStep1()
                else if (step === 2) void submitStep2()
                else setStep((s) => Math.min(4, s + 1))
              }}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              {t('wizNext')}
            </Button>
          ) : (
            <Button className="press gap-1.5" onClick={() => setDone(true)}>
              <Check className="h-4 w-4" />
              {t('wizFinish')}
            </Button>
          )}
        </div>
        )}
      </div>

      {/* Skip confirm */}
      <AlertDialog open={skipOpen} onOpenChange={setSkipOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('wizSkip')}</AlertDialogTitle>
            <AlertDialogDescription>{t('wizSkipBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault()
                setSkipOpen(false)
                void post({ step: 'complete' })
                  .then(() => {
                    toast.info(t('wizSkipToast'))
                    router.push('/admin/dashboard')
                    router.refresh()
                  })
                  .catch((err: unknown) => toast.error(err instanceof Error ? err.message : 'Request failed'))
              }}
            >
              {t('wizSkipConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
