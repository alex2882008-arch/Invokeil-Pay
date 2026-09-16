'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { KeyRound, Loader2, ShieldCheck, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { fetchApi } from '@/lib/api-client'
import { useLang } from '@/lib/i18n'
import { formatDateTime } from '@/lib/format'

// ── Profile management dialog — the signed-in user manages their own account:
// name/email update + password change (re-auth) + 2FA status. ────────────────

interface ProfileUser {
  id: string
  name: string
  email: string
  role: string
  twoFaEnabled?: boolean
  lastLoginAt?: string | null
  createdAt?: string | null
}

export function ProfileDialog({
  open, onOpenChange, onUpdated,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onUpdated?: (u: ProfileUser) => void
}) {
  const { t } = useLang()
  const [user, setUser] = useState<ProfileUser | null>(null)
  const [loading, setLoading] = useState(false)

  // profile form
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)

  // password form
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    fetchApi<{ user?: ProfileUser }>('/api/auth/me')
      .then((d) => {
        const u = d.user ?? null
        setUser(u)
        if (u) {
          setName(u.name)
          setEmail(u.email)
        }
      })
      .catch(() => toast.error(t('cpubClaimFailed')))
      .finally(() => setLoading(false))
  }, [open, t])

  async function saveProfile() {
    if (!user) return
    if (!name.trim()) { toast.error(t('profName')); return }
    setSavingProfile(true)
    try {
      const d = await fetchApi<{ user?: ProfileUser }>('/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim() }),
      })
      if (d.user) {
        setUser((prev) => (prev ? { ...prev, ...d.user } : d.user ?? prev))
        onUpdated?.(d.user)
      }
      toast.success(t('profUpdatedMsg'))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setSavingProfile(false)
    }
  }

  async function changePassword() {
    if (newPassword !== confirmPassword) { toast.error(t('profPasswordMismatch')); return }
    if (newPassword.length < 8) { toast.error(t('profPasswordShort')); return }
    setSavingPassword(true)
    try {
      await fetchApi('/api/auth/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      toast.success(t('profPasswordChanged'))
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setSavingPassword(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserRound className="h-4 w-4 text-primary" /> {t('profileTitle')}
          </DialogTitle>
          <DialogDescription>{t('profileDesc')}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-3 pb-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : user ? (
          <div className="nice-scroll max-h-[64vh] space-y-4 overflow-y-auto pr-1">
            {/* Account section */}
            <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">{t('profAccount')}</p>
              <div className="grid gap-1.5">
                <Label htmlFor="prof-name" className="text-xs font-semibold text-foreground/85">{t('profName')}</Label>
                <Input id="prof-name" value={name} onChange={(e) => setName(e.target.value)} className="h-10" autoComplete="name" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="prof-email" className="text-xs font-semibold text-foreground/85">{t('profEmail')}</Label>
                <Input id="prof-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-10" autoComplete="email" />
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-0.5 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  {t('profRole')}:
                  <Badge variant="outline" className="font-bold">{user.role}</Badge>
                </span>
                {user.createdAt && <span>· {t('profMemberSince')}: {formatDateTime(user.createdAt)}</span>}
                {user.lastLoginAt && <span>· {t('profLastLogin')}: {formatDateTime(user.lastLoginAt)}</span>}
              </div>
              <Button className="press min-h-10 w-full sm:w-auto" disabled={savingProfile} onClick={saveProfile}>
                {savingProfile && <Loader2 className="h-4 w-4 animate-spin" />}
                {t('profUpdateProfile')}
              </Button>
            </div>

            {/* Security section */}
            <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
              <p className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">
                <KeyRound className="h-3.5 w-3.5" /> {t('profSecurity')}
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="prof-cur" className="text-xs font-semibold text-foreground/85">{t('profCurrentPassword')}</Label>
                  <Input
                    id="prof-cur" type="password" value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="h-10" autoComplete="current-password"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="prof-new" className="text-xs font-semibold text-foreground/85">{t('profNewPassword')}</Label>
                  <Input
                    id="prof-new" type="password" value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="h-10" autoComplete="new-password"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="prof-conf" className="text-xs font-semibold text-foreground/85">{t('profConfirmPassword')}</Label>
                  <Input
                    id="prof-conf" type="password" value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="h-10" autoComplete="new-password"
                  />
                </div>
              </div>
              <Button
                variant="outline"
                className="press min-h-10 w-full sm:w-auto"
                disabled={savingPassword || !currentPassword || !newPassword}
                onClick={changePassword}
              >
                {savingPassword && <Loader2 className="h-4 w-4 animate-spin" />}
                {t('profChangePassword')}
              </Button>

              <div className="flex items-center justify-between gap-3 rounded-lg border bg-card px-3.5 py-2.5">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                    <ShieldCheck className="h-3.5 w-3.5 text-success" /> {t('profTwoFa')}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{t('profTwoFaHint')}</p>
                </div>
                <Badge className={user.twoFaEnabled ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'}>
                  {user.twoFaEnabled ? t('on') : t('off')}
                </Badge>
              </div>
            </div>
          </div>
        ) : (
          <p className="pb-4 text-center text-sm text-muted-foreground">{t('cpubClaimFailed')}</p>
        )}
      </DialogContent>
    </Dialog>
  )
}
