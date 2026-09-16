'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, ShieldCheck, Lock, Mail, ArrowRight, Eye, EyeOff } from 'lucide-react'
import { useLang } from '@/lib/i18n'
import { BrandLogo } from './ui-bits'
import { toast } from 'sonner'

export function LoginClient({ brandName }: { brandName: string }) {
  const { t } = useLang()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<'creds' | 'twofa'>('creds')
  const [twoFa, setTwoFa] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function submit(e?: React.FormEvent) {
    e?.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, twoFaCode: step === 'twofa' ? twoFa : undefined }),
      })
      const data = await res.json().catch(() => null)
      if (res.ok && data?.user) {
        toast.success(data.user.twoFaEnabled ? 'Signed in' : 'Welcome back!')
        router.push('/admin/dashboard')
        router.refresh()
        return
      }
      if (res.status === 428 && data?.error === '2FA_REQUIRED') {
        setStep('twofa')
        setError(null)
        return
      }
      if (res.status === 429) setError(t('tooManyAttempts'))
      else setError(data?.error === 'INVALID_2FA' ? t('twoFaInvalid') : (data?.error ?? t('invalidCredentials')))
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="aurora flex min-h-screen items-center justify-center p-4 safe-top safe-bottom">
      <div className="anim-scale-in w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <BrandLogo size={52} wordmark={false} />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{brandName}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t('signInSub')}</p>
          </div>
        </div>

        <form onSubmit={submit} className="rounded-2xl border bg-card p-6 shadow-brand-lg sm:p-8">
          {step === 'creds' ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs font-semibold">{t('emailAddress')}</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="email" type="email" autoComplete="email" required
                    value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@admin.com"
                    className="h-11 pl-9"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs font-semibold">{t('password')}</Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="password" type={showPw ? 'text' : 'password'} autoComplete="current-password" required
                    value={password} onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="h-11 pl-9 pr-10"
                  />
                  <button
                    type="button" onClick={() => setShowPw((s) => !s)} aria-label="Toggle password visibility"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-primary">
                <ShieldCheck className="h-5 w-5" />
                <p className="text-sm font-semibold">{t('twoFaCode')}</p>
              </div>
              <p className="text-xs text-muted-foreground">{t('twoFaHint')}</p>
              <Input
                inputMode="numeric" maxLength={6} autoFocus
                value={twoFa} onChange={(e) => setTwoFa(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                className="h-12 text-center font-mono text-xl tracking-[0.5em]"
              />
            </div>
          )}

          {error && (
            <p className="anim-fade-in mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
              {error}
            </p>
          )}

          <Button type="submit" disabled={loading} className="press mt-6 h-11 w-full gap-2 text-sm font-semibold">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            {loading ? t('signingIn').replace('…', '') : step === 'twofa' ? t('signIn') : t('signIn')}
          </Button>

          <p className="mt-4 rounded-lg bg-muted/70 px-3 py-2.5 text-center text-[11px] leading-relaxed text-muted-foreground">
            Demo access — <span className="font-mono font-semibold text-foreground">admin@admin.com</span> · <span className="font-mono font-semibold text-foreground">12345678</span>
          </p>
        </form>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          {brandName} · {t('brandTagline')}
        </p>
      </div>
    </div>
  )
}
