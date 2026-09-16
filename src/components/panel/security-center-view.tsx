'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ShieldCheck, Fingerprint, Globe2, RefreshCw, RotateCw, LogOut, MonitorSmartphone, Activity,
  KeyRound, Plus, Trash2, Lock,
} from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { fetchApi } from '@/lib/api-client'
import { formatDateTime, timeAgo } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useUrlState } from '@/hooks/use-url-state'
import { useLang } from '@/lib/i18n'
import { PageHeader, EmptyState, ErrorCard, Pagination, CopyButton } from './ui-bits'

// ── Types ────────────────────────────────────────────────────────────────────

interface Passkey {
  id: string
  label: string
  credentialId: string
  lastUsedAt: string | null
  createdAt: string
}

interface SessionRow {
  id: string
  userId: string
  userName: string
  userEmail: string | null
  browser: string | null
  ip: string | null
  lastSeenAt: string
  createdAt: string
  isCurrent: boolean
}

interface ScoreCheck {
  id: string
  enabled: boolean
  points: number
  max: number
}

interface SecurityData {
  sessions: SessionRow[]
  passkeys: Passkey[]
  ipAllowlist: string[]
  securityScore: { score: number; max: number; checks: ScoreCheck[] }
}

interface StoreRow {
  id: string
  name: string
  active: boolean
}

interface ApiKeyRow {
  id: string
  name: string
  key: string
  scopes: string
  locked: boolean
  lastUsedAt: string | null
  createdAt: string
}

interface RotateResult {
  key: { id: string; name: string; key: string; scopes: string; createdAt: string }
  oldKey: { id: string; locked: boolean; expiresAt: string }
  graceHours: number
}

interface AuditRow {
  id: string
  actorName: string
  action: string
  target: string | null
  createdAt: string
}

interface AuditData {
  items: AuditRow[]
  total: number
  page: number
  pages: number
}

interface Me {
  id: string
  name: string
  twoFaEnabled?: boolean
}

// ── Score ring (pure SVG, animated stroke-dashoffset) ───────────────────────

function ScoreRing({ score, label }: { score: number; label: string }) {
  const [shown, setShown] = useState(0)
  useEffect(() => {
    const id = window.setTimeout(() => setShown(score), 80)
    return () => window.clearTimeout(id)
  }, [score])

  const r = 52
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(100, shown)) / 100
  const color = score >= 80 ? 'hsl(142 71% 45%)' : score >= 50 ? 'hsl(38 92% 50%)' : 'hsl(0 84% 60%)'

  return (
    <div className="relative flex h-[140px] w-[140px] items-center justify-center">
      <svg width="140" height="140" viewBox="0 0 140 140" className="-rotate-90" aria-hidden="true">
        <circle cx="70" cy="70" r={r} fill="none" strokeWidth="11" className="stroke-muted" />
        <circle
          cx="70" cy="70" r={r} fill="none" strokeWidth="11" strokeLinecap="round"
          stroke={color}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          style={{ transition: 'stroke-dashoffset 900ms cubic-bezier(0.22,1,0.36,1), stroke 300ms' }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="tabular text-3xl font-extrabold text-foreground">{score}</span>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      </div>
    </div>
  )
}

// ── Component ────────────────────────────────────────────────────────────────

export function SecurityCenterView() {
  const { t } = useLang()
  const { getNum } = useUrlState()
  const auditPage = getNum('auditPage', 1)

  const [me, setMe] = useState<Me | null>(null)
  const [sec, setSec] = useState<SecurityData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Passkeys
  const [pkLabel, setPkLabel] = useState('')
  const [pkBusy, setPkBusy] = useState(false)
  const [deletingPk, setDeletingPk] = useState<Passkey | null>(null)
  const [pkDeleteBusy, setPkDeleteBusy] = useState(false)

  // IP allowlist
  const [allowItems, setAllowItems] = useState<string[] | null>(null)
  const [allowDraft, setAllowDraft] = useState('')
  const [allowSaving, setAllowSaving] = useState(false)

  // Key rotation
  const [stores, setStores] = useState<StoreRow[] | null>(null)
  const [storeId, setStoreId] = useState<string>('')
  const [keys, setKeys] = useState<ApiKeyRow[] | null>(null)
  const [keyId, setKeyId] = useState<string>('')
  const [rotating, setRotating] = useState(false)
  const [rotateResult, setRotateResult] = useState<RotateResult | null>(null)
  const [rotateConfirm, setRotateConfirm] = useState(false)

  // Audit
  const [audit, setAudit] = useState<AuditData | null>(null)
  const [auditLoading, setAuditLoading] = useState(true)

  // ── Data loading ──

  const loadSec = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchApi<SecurityData>('/api/admin/security')
      setSec(res)
      setAllowItems(res.ipAllowlist)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadMe = useCallback(async () => {
    try {
      const res = await fetchApi<{ user: Me | null }>('/api/auth/me')
      setMe(res.user)
    } catch { /* non-fatal */ }
  }, [])

  const loadStores = useCallback(async () => {
    try {
      const res = await fetchApi<{ stores: StoreRow[] }>('/api/admin/stores')
      setStores(res.stores)
    } catch { /* rotation card shows error on action */ }
  }, [])

  const loadKeys = useCallback(async (sid: string) => {
    if (!sid) { setKeys(null); setKeyId(''); return }
    try {
      const res = await fetchApi<{ keys: ApiKeyRow[] }>(`/api/admin/stores/${sid}/keys`)
      setKeys(res.keys)
      setKeyId('')
    } catch {
      setKeys(null)
      setKeyId('')
    }
  }, [])

  const loadAudit = useCallback(async () => {
    setAuditLoading(true)
    try {
      const res = await fetchApi<AuditData>(`/api/admin/security/audit?page=${auditPage}`)
      setAudit(res)
    } catch { /* audit tail is best-effort */ }
    finally {
      setAuditLoading(false)
    }
  }, [auditPage])

  useEffect(() => {
    void loadSec()
    void loadMe()
    void loadStores()
  }, [loadSec, loadMe, loadStores])
  useEffect(() => { void loadKeys(storeId) }, [storeId, loadKeys])
  useEffect(() => { void loadAudit() }, [loadAudit])

  // ── Score helpers ──

  const checkLabel = (id: string) =>
    id === 'twoFa' ? t('seccCheck2fa')
      : id === 'passkeys' ? t('seccCheckPasskeys')
      : id === 'allowlist' ? t('seccCheckAllowlist')
      : id === 'logins' ? t('seccCheckLogins')
      : id === 'risk' ? t('seccCheckRisk')
      : id

  const scoreBand = useMemo(() => {
    const s = sec?.securityScore.score ?? 0
    return s >= 80 ? t('seccScoreHigh') : s >= 50 ? t('seccScoreMedium') : t('seccScoreLow')
  }, [sec, t])

  // ── Passkeys ──

  const generateFallbackId = (): string => {
    try {
      if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
    } catch { /* fall through */ }
    return `pk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
  }

  const registerPasskey = async () => {
    if (!pkLabel.trim()) { toast.error(t('seccNeedLabel')); return }
    setPkBusy(true)
    let credentialId = ''
    let usedFallback = false
    try {
      // Try the real WebAuthn flow first; fall back to a device-label passkey id.
      try {
        if (typeof window !== 'undefined' && 'PublicKeyCredential' in window && navigator.credentials) {
          const challenge = new Uint8Array(32)
          const userId = new Uint8Array(16)
          crypto.getRandomValues(challenge)
          crypto.getRandomValues(userId)
          const cred = await navigator.credentials.create({
            publicKey: {
              challenge,
              rp: { name: 'Invokeil Pay' },
              user: {
                id: userId,
                name: me?.name ?? 'panel-user',
                displayName: me?.name ?? 'Panel user',
              },
              pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
              timeout: 30_000,
            },
          })
          if (cred && 'rawId' in cred) {
            const raw = new Uint8Array((cred as PublicKeyCredential).rawId)
            credentialId = Array.from(raw, (b) => b.toString(16).padStart(2, '0')).join('')
          }
        }
      } catch {
        usedFallback = true
      }
      if (!credentialId) {
        usedFallback = true
        credentialId = generateFallbackId()
      }
      await fetchApi('/api/admin/security/passkeys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: pkLabel.trim(), credentialId }),
      })
      toast.success(t('seccPkRegisteredToast'))
      if (usedFallback) toast.info(t('seccPkBrowserFail'))
      setPkLabel('')
      await loadSec()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setPkBusy(false)
    }
  }

  const removePasskey = async () => {
    if (!deletingPk) return
    setPkDeleteBusy(true)
    try {
      await fetchApi(`/api/admin/security/passkeys/${deletingPk.id}`, { method: 'DELETE' })
      toast.success(t('seccPkRemovedToast'))
      setDeletingPk(null)
      await loadSec()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setPkDeleteBusy(false)
    }
  }

  // ── IP allowlist ──

  const addAllowDraft = () => {
    const v = allowDraft.trim()
    if (!v) return
    if (allowItems && allowItems.includes(v)) { setAllowDraft(''); return }
    setAllowItems([...(allowItems ?? []), v])
    setAllowDraft('')
  }

  const saveAllowlist = async () => {
    setAllowSaving(true)
    try {
      const res = await fetchApi<{ items: string[] }>('/api/admin/security/ip-allowlist', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: allowItems ?? [] }),
      })
      setAllowItems(res.items)
      toast.success(t('seccAllowSavedToast'))
      await loadSec()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setAllowSaving(false)
    }
  }

  // ── Key rotation ──

  const rotateKey = async () => {
    if (!storeId || !keyId) return
    setRotating(true)
    try {
      const res = await fetchApi<RotateResult>('/api/admin/security/rotate-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyId, storeId }),
      })
      setRotateResult(res)
      setRotateConfirm(false)
      toast.success(t('seccRotatedToast'))
      await loadKeys(storeId)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setRotating(false)
    }
  }

  // ── Sessions ──

  const revokeSession = async (s: SessionRow) => {
    try {
      await fetchApi(`/api/admin/security?sessionId=${s.id}`, { method: 'DELETE' })
      toast.success(t('seccSessionRevokedToast'))
      await loadSec()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Request failed')
    }
  }

  const ACTION_TONE: Record<string, string> = {
    created: 'bg-success/10 text-success',
    enabled: 'bg-success/10 text-success',
    approved: 'bg-success/10 text-success',
    updated: 'bg-warning/15 text-amber-700 dark:text-amber-400',
    revoked: 'bg-destructive/10 text-destructive',
    deleted: 'bg-destructive/10 text-destructive',
    removed: 'bg-destructive/10 text-destructive',
    rejected: 'bg-destructive/10 text-destructive',
  }

  const actionChip = (action: string) => {
    const tone = Object.entries(ACTION_TONE).find(([k]) => action.toLowerCase().includes(k))?.[1]
      ?? 'bg-muted text-muted-foreground'
    return (
      <span className={cn('inline-block rounded-md px-2 py-0.5 font-mono text-[11px] font-semibold', tone)}>
        {action}
      </span>
    )
  }

  const twoFaOn = me?.twoFaEnabled ?? false

  return (
    <div>
      <PageHeader
        title={t('seccTitle')}
        description={t('seccSubtitle')}
        icon={<ShieldCheck className="h-5 w-5" />}
        actions={
          <Button variant="outline" size="icon" className="press h-9 w-9" onClick={() => void loadSec()} aria-label={t('refresh')}>
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </Button>
        }
      />

      {error && !sec ? (
        <ErrorCard message={error} onRetry={() => void loadSec()} />
      ) : loading && !sec ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-64 rounded-xl" />)}
        </div>
      ) : sec ? (
        <div className="space-y-4">
          {/* ── Row 1: score + 2FA ── */}
          <div className="grid gap-4 lg:grid-cols-3">
            {/* Score ring card */}
            <Card className="hover-lift p-6 shadow-brand lg:col-span-2">
              <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
                <ScoreRing score={sec.securityScore.score} label={scoreBand} />
                <div className="min-w-0 flex-1">
                  <h2 className="font-bold text-foreground">{t('seccScore')}</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">{t('seccImproveHint')}</p>
                  <ul className="mt-3 space-y-1.5">
                    {sec.securityScore.checks.map((c, i) => (
                      <li
                        key={c.id}
                        className="ilp-fade-up flex items-center justify-between gap-3 text-xs"
                        style={{ animationDelay: `${i * 40}ms` }}
                      >
                        <span className={cn('flex min-w-0 items-center gap-2', c.enabled ? 'text-foreground' : 'text-muted-foreground')}>
                          <span className={cn(
                            'flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white',
                            c.enabled ? 'bg-success' : 'bg-muted-foreground/40',
                          )}>
                            {c.enabled ? '✓' : ''}
                          </span>
                          <span className="truncate">{checkLabel(c.id)}</span>
                        </span>
                        <span className={cn('shrink-0 tabular text-[11px] font-bold', c.enabled ? 'text-success' : 'text-muted-foreground/60')}>
                          {c.points}/{c.max}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Card>

            {/* 2FA status card */}
            <Card className="hover-lift p-6 shadow-brand">
              <div className="flex items-start justify-between gap-2">
                <div className={cn('rounded-xl p-2.5', twoFaOn ? 'bg-success/10 text-success' : 'bg-warning/15 text-amber-700 dark:text-amber-400')}>
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <Badge variant="outline" className={cn(
                  'font-bold',
                  twoFaOn ? 'border-success/20 bg-success/10 text-success' : 'border-warning/30 bg-warning/15 text-amber-700 dark:text-amber-400',
                )}>
                  {twoFaOn ? t('secc2faOn') : t('secc2faOff')}
                </Badge>
              </div>
              <h2 className="mt-3 font-bold text-foreground">{t('secc2faTitle')}</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {twoFaOn ? t('secc2faOnHint') : t('secc2faOffHint')}
              </p>
              <Button asChild variant="outline" size="sm" className="press mt-4 gap-1.5">
                <Link href="/admin/users?tab=twofa">
                  <KeyRound className="h-3.5 w-3.5" /> {t('secc2faManage')}
                </Link>
              </Button>
            </Card>
          </div>

          {/* ── Row 2: passkeys + IP allowlist ── */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Passkeys */}
            <Card className="hover-lift p-6 shadow-brand">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
                  <Fingerprint className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="font-bold text-foreground">{t('seccPasskeysTitle')}</h2>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{t('seccPasskeysDesc')}</p>
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <Input
                  value={pkLabel}
                  onChange={(e) => setPkLabel(e.target.value)}
                  placeholder={t('seccPkLabelPh')}
                  aria-label={t('seccPkLabel')}
                  className="h-9 flex-1"
                />
                <Button className="press h-9 gap-1.5" onClick={() => void registerPasskey()} disabled={pkBusy}>
                  <Fingerprint className="h-4 w-4" /> {pkBusy ? t('seccRegistering') : t('seccRegister')}
                </Button>
              </div>

              {sec.passkeys.length === 0 ? (
                <EmptyState icon={<Fingerprint className="h-6 w-6" />} title={t('seccPkEmpty')} hint={t('seccPkEmptyHint')} />
              ) : (
                <ul className="stagger mt-4 space-y-2">
                  {sec.passkeys.map((p, i) => (
                    <li
                      key={p.id}
                      className="ilp-fade-up flex items-center justify-between gap-2 rounded-xl border p-3"
                      style={{ animationDelay: `${i * 40}ms` }}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">{p.label}</p>
                        <p className="truncate font-mono text-[10px] text-muted-foreground">{p.credentialId.slice(0, 24)}…</p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          {t('seccPkLastUsed')}: {p.lastUsedAt ? timeAgo(p.lastUsedAt) : t('seccPkNever')}
                        </p>
                      </div>
                      <Button
                        variant="ghost" size="icon"
                        className="press h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                        title={t('delete')} aria-label={t('delete')}
                        onClick={() => setDeletingPk(p)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {/* IP allowlist */}
            <Card className="hover-lift p-6 shadow-brand">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
                  <Globe2 className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="font-bold text-foreground">{t('seccAllowTitle')}</h2>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{t('seccAllowDesc')}</p>
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <Input
                  value={allowDraft}
                  onChange={(e) => setAllowDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAllowDraft() } }}
                  placeholder={t('seccAllowPh')}
                  aria-label={t('seccAllowAdd')}
                  className="h-9 flex-1 font-mono text-xs"
                />
                <Button variant="outline" className="press h-9 gap-1.5" onClick={addAllowDraft}>
                  <Plus className="h-4 w-4" /> {t('seccAllowAdd')}
                </Button>
              </div>

              {(!allowItems || allowItems.length === 0) ? (
                <p className="mt-4 rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">{t('seccAllowEmpty')}</p>
              ) : (
                <ul className="nice-scroll mt-4 max-h-44 space-y-1.5 overflow-y-auto">
                  {allowItems.map((ip) => (
                    <li key={ip} className="flex items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-1.5">
                      <span className="truncate font-mono text-xs text-foreground">{ip}</span>
                      <button
                        type="button"
                        className="press rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        aria-label={`${t('delete')} ${ip}`}
                        onClick={() => setAllowItems(allowItems.filter((x) => x !== ip))}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-4 flex items-center justify-between gap-2">
                <p className="text-[11px] text-muted-foreground">{t('seccAllowHint')}</p>
                <Button className="press h-9 shrink-0" onClick={() => void saveAllowlist()} disabled={allowSaving || !allowItems}>
                  {t('save')}
                </Button>
              </div>
            </Card>
          </div>

          {/* ── Row 3: key rotation ── */}
          <Card className="hover-lift p-6 shadow-brand">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
                <RotateCw className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-bold text-foreground">{t('seccRotateTitle')}</h2>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{t('seccRotateDesc')}</p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
              <div className="grid gap-1.5">
                <Label className="text-xs">{t('seccSelectStore')}</Label>
                <Select value={storeId} onValueChange={setStoreId}>
                  <SelectTrigger className="h-9"><SelectValue placeholder={t('seccSelectStorePh')} /></SelectTrigger>
                  <SelectContent>
                    {(stores ?? []).map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">{t('seccSelectKey')}</Label>
                <Select value={keyId} onValueChange={setKeyId} disabled={!storeId || !keys || keys.length === 0}>
                  <SelectTrigger className="h-9"><SelectValue placeholder={t('seccSelectKeyPh')} /></SelectTrigger>
                  <SelectContent>
                    {(keys ?? []).map((k) => (
                      <SelectItem key={k.id} value={k.id} disabled={k.locked}>
                        {k.name} · {k.locked ? t('seccKeyLocked') : t('seccKeyActive')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button
                  className="press h-9 gap-1.5"
                  disabled={!storeId || !keyId || rotating}
                  onClick={() => setRotateConfirm(true)}
                >
                  <RotateCw className="h-4 w-4" /> {rotating ? t('seccRotating') : t('seccRotateBtn')}
                </Button>
              </div>
            </div>

            {storeId && keys && keys.length === 0 && (
              <p className="mt-3 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">{t('seccNoKeys')}</p>
            )}

            {rotateResult && (
              <div className="anim-fade-up mt-4 rounded-xl border border-success/30 bg-success/5 p-4">
                <p className="flex items-center gap-1.5 text-sm font-bold text-foreground">
                  <Lock className="h-4 w-4 text-success" /> {t('seccNewKeyTitle')}
                </p>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <code className="nice-scroll min-w-0 flex-1 overflow-x-auto rounded-lg bg-muted px-3 py-2 font-mono text-xs text-foreground">
                    {rotateResult.key.key}
                  </code>
                  <CopyButton value={rotateResult.key.key} className="shrink-0" />
                </div>
                <p className="mt-2 text-[11px] font-medium text-destructive">{t('seccNewKeyWarning')}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{t('seccGraceNote')}</p>
              </div>
            )}
          </Card>

          {/* ── Row 4: sessions ── */}
          <Card className="overflow-hidden p-0 shadow-brand">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4">
              <div>
                <h2 className="font-bold text-foreground">{t('seccSessionsTitle')}</h2>
                <p className="text-xs text-muted-foreground">{t('seccSessionsDesc')}</p>
              </div>
              <Button variant="outline" size="sm" className="press h-8 gap-1.5" onClick={() => void loadSec()}>
                <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} /> {t('refresh')}
              </Button>
            </div>
            {sec.sessions.length === 0 ? (
              <EmptyState icon={<MonitorSmartphone className="h-6 w-6" />} title={t('seccSessionsEmpty')} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-left">
                      <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('seccColDevice')}</th>
                      <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('seccColIp')}</th>
                      <th className="hidden px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:table-cell">{t('seccColLastSeen')}</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="stagger">
                    {sec.sessions.map((s, i) => (
                      <tr key={s.id} className="border-b transition-colors last:border-0 hover:bg-muted/40" style={{ animationDelay: `${i * 40}ms` }}>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <MonitorSmartphone className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <div className="min-w-0">
                              <p className="truncate font-medium text-foreground">{s.browser ?? '—'}</p>
                              <p className="truncate text-[11px] text-muted-foreground">{s.userName}</p>
                            </div>
                            {s.isCurrent && (
                              <span className="shrink-0 rounded bg-success/10 px-1.5 py-0.5 text-[10px] font-bold text-success">{t('seccSessionCurrent')}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs text-foreground/80">{s.ip ?? '—'}</td>
                        <td className="hidden px-4 py-2.5 text-xs text-foreground/70 sm:table-cell" title={formatDateTime(s.lastSeenAt)}>
                          {timeAgo(s.lastSeenAt)}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <Button
                            variant="ghost" size="sm"
                            className="press h-8 gap-1.5 text-destructive hover:text-destructive"
                            onClick={() => void revokeSession(s)}
                          >
                            <LogOut className="h-3.5 w-3.5" /> {t('seccRevoke')}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* ── Row 5: audit tail ── */}
          <Card className="overflow-hidden p-0 shadow-brand">
            <div className="border-b p-4">
              <h2 className="font-bold text-foreground">{t('seccAuditTitle')}</h2>
              <p className="text-xs text-muted-foreground">{t('seccAuditDesc')}</p>
            </div>
            {auditLoading && !audit ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 rounded-lg" />)}
              </div>
            ) : !audit || audit.items.length === 0 ? (
              <EmptyState icon={<Activity className="h-6 w-6" />} title={t('seccAuditEmpty')} />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50 text-left">
                        <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('seccColActor')}</th>
                        <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('seccColAction')}</th>
                        <th className="hidden px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:table-cell">{t('seccColTarget')}</th>
                        <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('seccColWhen')}</th>
                      </tr>
                    </thead>
                    <tbody className="stagger">
                      {audit.items.map((a, i) => (
                        <tr key={a.id} className="border-b transition-colors last:border-0 hover:bg-muted/40" style={{ animationDelay: `${i * 40}ms` }}>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                                {(a.actorName || '?').charAt(0).toUpperCase()}
                              </span>
                              <span className="font-medium text-foreground">{a.actorName}</span>
                            </div>
                          </td>
                          <td className="px-4 py-2.5">{actionChip(a.action)}</td>
                          <td className="hidden max-w-[220px] truncate px-4 py-2.5 font-mono text-xs text-muted-foreground sm:table-cell">{a.target ?? '—'}</td>
                          <td className="px-4 py-2.5 text-xs text-foreground/70" title={formatDateTime(a.createdAt)}>{timeAgo(a.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 pb-2">
                  <Pagination page={audit.page} pages={audit.pages} total={audit.total} />
                </div>
              </>
            )}
          </Card>
        </div>
      ) : null}

      {/* Rotate confirm */}
      <AlertDialog open={rotateConfirm} onOpenChange={setRotateConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('seccRotateConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('seccRotateConfirmBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="press"
              disabled={rotating}
              onClick={(e) => { e.preventDefault(); void rotateKey() }}
            >
              <RotateCw className="mr-1.5 inline h-4 w-4" />
              {rotating ? t('seccRotating') : t('seccRotateBtn')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete passkey confirm */}
      <AlertDialog open={!!deletingPk} onOpenChange={(o) => !o && setDeletingPk(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('seccPkDeleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingPk?.label} — {t('seccPkDeleteBody')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={pkDeleteBusy}
              onClick={(e) => { e.preventDefault(); void removePasskey() }}
            >
              {t('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
