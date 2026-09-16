'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Users as UsersIcon, UserCheck, Plus, Pencil, Trash2, ShieldCheck, MonitorSmartphone, KeyRound, Activity,
  LogOut, RefreshCw, Shield, ChevronLeft, ChevronRight, BadgeCheck,
} from 'lucide-react'
import QRCode from 'qrcode'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { fetchApi } from '@/lib/api-client'
import { formatDateTime, timeAgo } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useUrlState } from '@/hooks/use-url-state'
import { useLang } from '@/lib/i18n'
import { isAdminRole, ROLE_LIST, ROLE_DESCRIPTIONS } from '@/lib/roles'
import {
  PageHeader, StatCard, EmptyState, ErrorCard, Pagination, SearchInput, CopyButton,
} from './ui-bits'

// ── Types ────────────────────────────────────────────────────────────────────

interface UserItem {
  id: string
  email: string
  name: string
  role: string
  active: boolean
  twoFaEnabled: boolean
  lastLoginAt: string | null
  createdAt: string
  _count?: { sessions: number; devices: number }
}

interface Me {
  id: string
  name: string
  email: string
  role: 'ADMIN' | 'AGENT' | 'VIEWER'
  twoFaEnabled?: boolean
}

interface SessionRow {
  id: string
  userId: string
  userName: string
  userEmail: string | null
  userRole: string | null
  browser: string | null
  ip: string | null
  lastSeenAt: string
  createdAt: string
  isCurrent: boolean
}

interface AttemptRow {
  id: string
  email: string
  ip: string | null
  success: boolean
  createdAt: string
}

interface ActivityRow {
  id: string
  actorName: string
  action: string
  target: string | null
  createdAt: string
}

interface SecurityData {
  sessions: SessionRow[]
  loginAttempts: AttemptRow[]
  activity: ActivityRow[]
  activityTotal: number
  activityPage: number
  activityPages: number
  scope: 'all' | 'own'
}

interface UsersData {
  users: UserItem[]
  total: number
  page: number
  pages: number
}

interface UsersSummary {
  summary: { total: number; active: number; admins: number }
}

interface TwoFaSetup {
  secret: string
  otpauthUrl: string
  qrDataUrl: string
}

const EMPTY_FORM = { name: '', email: '', password: '', role: 'AGENT', active: true }
type StaffForm = typeof EMPTY_FORM

const ROLE_TONE: Record<string, string> = {
  OWNER: 'bg-warning/15 text-amber-700 dark:text-amber-400 border-warning/30',
  ADMIN: 'bg-primary/10 text-primary border-primary/25',
  DEVELOPER: 'bg-primary/10 text-primary border-primary/25',
  FINANCE: 'bg-success/10 text-success border-success/20',
  SUPPORT: 'bg-success/10 text-success border-success/20',
  AGENT: 'bg-success/10 text-success border-success/20',
  VIEWER: 'bg-muted text-muted-foreground border-border',
}

/** team.* i18n keys per role (label + description). */
const ROLE_I18N: Record<string, string> = {
  OWNER: 'teamRoleOwner',
  ADMIN: 'teamRoleAdmin',
  DEVELOPER: 'teamRoleDeveloper',
  FINANCE: 'teamRoleFinance',
  SUPPORT: 'teamRoleSupport',
  AGENT: 'teamRoleAgent',
  VIEWER: 'teamRoleViewer',
}

const ACTION_TONE: Record<string, string> = {
  created: 'bg-success/10 text-success',
  enabled: 'bg-success/10 text-success',
  paid: 'bg-success/10 text-success',
  updated: 'bg-warning/15 text-amber-700 dark:text-amber-400',
  revoked: 'bg-destructive/10 text-destructive',
  deleted: 'bg-destructive/10 text-destructive',
  disabled: 'bg-destructive/10 text-destructive',
  purged: 'bg-destructive/10 text-destructive',
}

// ── Component ────────────────────────────────────────────────────────────────

export function UsersView() {
  const { t } = useLang()
  const { get, getNum, set } = useUrlState()
  const tab = get('tab', 'staff')
  const page = getNum('page', 1)
  const roleFilter = get('role', 'ALL')
  const activityPage = getNum('activityPage', 1)

  const [me, setMe] = useState<Me | null>(null)
  const [data, setData] = useState<UsersData | null>(null)
  const [summary, setSummary] = useState<UsersSummary['summary'] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Security datasets (sessions / attempts / activity)
  const [sec, setSec] = useState<SecurityData | null>(null)
  const [secLoading, setSecLoading] = useState(true)
  const [secError, setSecError] = useState<string | null>(null)

  // Staff dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<UserItem | null>(null)
  const [form, setForm] = useState<StaffForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<UserItem | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  // 2FA state
  const [twoFaSetup, setTwoFaSetup] = useState<TwoFaSetup | null>(null)
  const [twoFaBusy, setTwoFaBusy] = useState(false)
  const [twoFaCode, setTwoFaCode] = useState('')
  const [disableOpen, setDisableOpen] = useState(false)
  const [disablePassword, setDisablePassword] = useState('')

  const isAdmin = isAdminRole(me?.role)

  const roleLabel = useCallback((r: string) => {
    const key = ROLE_I18N[r]
    if (!key) return r
    const v = t(key)
    // until team.ts is wired into i18n.tsx, fall back to a readable role name
    return v === key ? r.charAt(0) + r.slice(1).toLowerCase() : v
  }, [t])

  const roleDesc = useCallback((r: string) => {
    const key = `teamRoleDesc${r.charAt(0)}${r.slice(1).toLowerCase()}`
    const v = t(key)
    if (v !== key) return v
    return (ROLE_DESCRIPTIONS as Record<string, string | undefined>)[r] ?? ''
  }, [t])

  // ── Data loading ──

  const loadMe = useCallback(async () => {
    try {
      const res = await fetchApi<{ user: Me | null }>('/api/auth/me')
      setMe(res.user)
    } catch { /* handled by fetchApi 401 */ }
  }, [])

  const loadUsers = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ page: String(page) })
      const q = get('q')
      if (q) params.set('q', q)
      if (roleFilter !== 'ALL') params.set('role', roleFilter)
      const res = await fetchApi<UsersData>(`/api/admin/users?${params}`)
      setData(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setLoading(false)
    }
  }, [get, page, roleFilter])

  const loadSummary = useCallback(async () => {
    try {
      const res = await fetchApi<UsersSummary>('/api/admin/users?summary=1')
      setSummary(res.summary)
    } catch { /* stat cards stay stale — non-fatal */ }
  }, [])

  const loadSecurity = useCallback(async () => {
    setSecLoading(true)
    setSecError(null)
    try {
      const res = await fetchApi<SecurityData>(`/api/admin/security?activityPage=${activityPage}`)
      setSec(res)
    } catch (e) {
      setSecError(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setSecLoading(false)
    }
  }, [activityPage])

  useEffect(() => { void loadMe() }, [loadMe])
  useEffect(() => { void loadUsers() }, [loadUsers])
  useEffect(() => { void loadSummary() }, [loadSummary])
  useEffect(() => {
    if (tab === 'sessions' || tab === 'attempts' || tab === 'activity') void loadSecurity()
  }, [tab, loadSecurity])

  // ── Staff CRUD ──

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setDialogOpen(true)
  }

  const openEdit = (u: UserItem) => {
    setEditing(u)
    setForm({ name: u.name, email: u.email, password: '', role: u.role, active: u.active })
    setDialogOpen(true)
  }

  const validate = (): string | null => {
    if (!form.name.trim()) return t('errStaffFields')
    if (!editing && !form.email.trim()) return t('errStaffFields')
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return t('errStaffEmail')
    if (!editing && form.password.length < 8) return t('errStaffPassword')
    if (editing && form.password && form.password.length < 8) return t('errStaffPassword')
    return null
  }

  const submitStaff = async () => {
    const err = validate()
    if (err) { toast.error(err); return }
    setSaving(true)
    try {
      if (editing) {
        await fetchApi(`/api/admin/users/${editing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.name.trim(),
            role: form.role,
            active: form.active,
            ...(form.password ? { password: form.password } : {}),
          }),
        })
        toast.success(t('staffUpdatedToast'))
      } else {
        await fetchApi('/api/admin/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.name.trim(),
            email: form.email.trim(),
            password: form.password,
            role: form.role,
          }),
        })
        toast.success(t('staffCreatedToast'))
      }
      setDialogOpen(false)
      await Promise.all([loadUsers(), loadSummary()])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (u: UserItem, next: boolean) => {
    try {
      await fetchApi(`/api/admin/users/${u.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: next }),
      })
      await Promise.all([loadUsers(), loadSummary()])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Request failed')
    }
  }

  const removeStaff = async () => {
    if (!deleting) return
    setDeleteBusy(true)
    try {
      await fetchApi(`/api/admin/users/${deleting.id}`, { method: 'DELETE' })
      toast.success(t('staffDeletedToast'))
      setDeleting(null)
      if (data && data.users.length === 1 && data.page > 1) set({ page: data.page - 1 })
      else await Promise.all([loadUsers(), loadSummary()])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setDeleteBusy(false)
    }
  }

  // ── 2FA flow ──

  const startTwoFa = async () => {
    setTwoFaBusy(true)
    try {
      const res = await fetchApi<{ secret: string; otpauthUrl: string }>('/api/admin/me/2fa', { method: 'POST' })
      const qr = await QRCode.toDataURL(res.otpauthUrl, { width: 220, margin: 1 })
      setTwoFaSetup({ ...res, qrDataUrl: qr })
      setTwoFaCode('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setTwoFaBusy(false)
    }
  }

  const verifyTwoFa = async () => {
    if (!twoFaCode.trim()) return
    setTwoFaBusy(true)
    try {
      await fetchApi('/api/admin/me/2fa', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: twoFaCode.trim() }),
      })
      toast.success(t('twoFaEnabledToast'))
      setTwoFaSetup(null)
      setTwoFaCode('')
      await loadMe()
    } catch (e) {
      toast.error(e instanceof Error && e.message === 'INVALID_CODE' ? t('twoFaInvalid') : e instanceof Error ? e.message : 'Request failed')
    } finally {
      setTwoFaBusy(false)
    }
  }

  const disableTwoFa = async () => {
    setTwoFaBusy(true)
    try {
      await fetchApi('/api/admin/me/2fa', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: disablePassword }),
      })
      toast.success(t('twoFaDisabledToast'))
      setDisableOpen(false)
      setDisablePassword('')
      await loadMe()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setTwoFaBusy(false)
    }
  }

  // ── Security actions ──

  const revokeSession = async (s: SessionRow) => {
    try {
      await fetchApi(`/api/admin/security?sessionId=${s.id}`, { method: 'DELETE' })
      toast.success(t('sessionRevokedToast'))
      await loadSecurity()
      if (s.isCurrent) await loadMe()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Request failed')
    }
  }

  const clearAttempts = async () => {
    try {
      await fetchApi('/api/admin/security?purgeAttempts=1', { method: 'DELETE' })
      toast.success(t('attemptsClearedToast'))
      await loadSecurity()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Request failed')
    }
  }

  // ── Render helpers ──

  const roleBadge = (r: string) => (
    <span className={cn('inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold', ROLE_TONE[r] ?? ROLE_TONE.VIEWER)}>
      {roleLabel(r)}
    </span>
  )

  const actionChip = (action: string) => {
    const tone = Object.entries(ACTION_TONE).find(([k]) => action.toLowerCase().includes(k))?.[1]
      ?? 'bg-muted text-muted-foreground'
    return (
      <span className={cn('inline-block rounded-md px-2 py-0.5 font-mono text-[11px] font-semibold', tone)}>
        {action}
      </span>
    )
  }

  const staffActions = (u: UserItem) => (
    <div className="flex items-center justify-end gap-1">
      <Button
        variant="ghost" size="icon" className="press h-7 w-7"
        title={t('edit')} aria-label={t('edit')} onClick={() => openEdit(u)}
      >
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost" size="icon"
        className="press h-7 w-7 text-destructive hover:text-destructive disabled:opacity-30"
        title={t('delete')} aria-label={t('delete')}
        disabled={u.id === me?.id}
        onClick={() => setDeleting(u)}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  )

  const activeSwitch = (u: UserItem) => (
    <Switch
      checked={u.active}
      disabled={u.id === me?.id}
      onCheckedChange={(v) => void toggleActive(u, v)}
      aria-label={t('activeCol')}
    />
  )

  const lastLoginText = (u: UserItem) =>
    u.lastLoginAt ? <span title={formatDateTime(u.lastLoginAt)}>{timeAgo(u.lastLoginAt)}</span> : <span className="text-muted-foreground/60">—</span>

  const twoFaChip = (u: UserItem) =>
    u.twoFaEnabled ? (
      <span className="inline-flex items-center gap-1 rounded-md bg-success/10 px-1.5 py-0.5 text-[10px] font-bold text-success">
        <ShieldCheck className="h-3 w-3" /> 2FA
      </span>
    ) : null

  return (
    <div>
      <PageHeader
        title={t('secTitle')}
        description={t('secDescription')}
        icon={<UsersIcon className="h-5 w-5" />}
        actions={
          tab === 'staff' && isAdmin ? (
            <Button onClick={openCreate} className="press gap-1.5">
              <Plus className="h-4 w-4" /> {t('secAddStaff')}
            </Button>
          ) : null
        }
      />

      <Tabs value={tab} onValueChange={(v) => set({ tab: v === 'staff' ? null : v, page: null, activityPage: null })}>
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 sm:grid sm:w-full sm:grid-cols-5">
          <TabsTrigger value="staff" className="gap-1.5 px-3">{t('tabStaff')}</TabsTrigger>
          <TabsTrigger value="twofa" className="gap-1.5 px-3">{t('tabTwoFa')}</TabsTrigger>
          <TabsTrigger value="sessions" className="gap-1.5 px-3">{t('tabSessions')}</TabsTrigger>
          <TabsTrigger value="attempts" className="gap-1.5 px-3">{t('tabLoginAttempts')}</TabsTrigger>
          <TabsTrigger value="activity" className="gap-1.5 px-3">{t('tabActivity')}</TabsTrigger>
        </TabsList>

        {/* ── Staff ── */}
        <TabsContent value="staff" className="mt-4">
          {/* Stat cards */}
          <div className="mb-4 grid gap-4 sm:grid-cols-3">
            <StatCard
              label={t('statTotal')}
              value={summary ? String(summary.total) : '—'}
              icon={<UsersIcon className="h-5 w-5" />}
              tone="text-primary bg-primary/10"
              loading={!summary}
            />
            <StatCard
              label={t('statActive')}
              value={summary ? String(summary.active) : '—'}
              icon={<UserCheck className="h-5 w-5" />}
              tone="text-success bg-success/10"
              loading={!summary}
            />
            <StatCard
              label={t('statAdmins')}
              value={summary ? String(summary.admins) : '—'}
              icon={<Shield className="h-5 w-5" />}
              tone="text-warning bg-warning/10"
              loading={!summary}
            />
          </div>

          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <SearchInput paramKey="q" placeholder={t('searchStaff')} className="sm:max-w-xs" />
            <Select value={roleFilter} onValueChange={(v) => set({ role: v === 'ALL' ? null : v, page: 1 })}>
              <SelectTrigger className="h-9 w-full sm:w-40" aria-label={t('roleCol')}>
                <SelectValue placeholder={t('roleCol')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t('filterRole')}</SelectItem>
                {ROLE_LIST.map((r) => (
                  <SelectItem key={r} value={r}>{roleLabel(r)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error && !data ? (
            <ErrorCard message={error} onRetry={() => { setLoading(true); void loadUsers() }} />
          ) : loading && !data ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
            </div>
          ) : !data || data.users.length === 0 ? (
            <Card className="border-dashed p-2 shadow-brand">
              {get('q') || roleFilter !== 'ALL' ? (
                <EmptyState
                  icon={<UsersIcon className="h-7 w-7" />}
                  title={t('noResults')}
                  action={
                    <Button variant="outline" size="sm" className="press" onClick={() => set({ q: null, role: null, page: 1 })}>
                      {t('clearFilters')}
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  icon={<UsersIcon className="h-7 w-7" />}
                  title={t('noStaffTitle')}
                  hint={t('noStaffHint')}
                  action={
                    <Button onClick={openCreate} className="press gap-1.5" disabled={!isAdmin}>
                      <Plus className="h-4 w-4" /> {t('noStaffCta')}
                    </Button>
                  }
                />
              )}
            </Card>
          ) : (
            <>
              {/* Desktop table */}
              <Card className="hidden overflow-hidden p-0 shadow-brand md:block">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50 text-left">
                        <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('staffCol')}</th>
                        <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('roleCol')}</th>
                        <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('activeCol')}</th>
                        <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('sessionsCol')}</th>
                        <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('lastLoginCol')}</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('actions')}</th>
                      </tr>
                    </thead>
                    <tbody className="stagger">
                      {data.users.map((u) => (
                        <tr key={u.id} className="border-b transition-colors last:border-0 hover:bg-muted/40">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <p className="truncate font-semibold text-foreground">{u.name}</p>
                              {u.id === me?.id && (
                                <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">{t('youBadge')}</span>
                              )}
                              {twoFaChip(u)}
                            </div>
                            <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                          </td>
                          <td className="px-4 py-3">{roleBadge(u.role)}</td>
                          <td className="px-4 py-3">{activeSwitch(u)}</td>
                          <td className="tabular px-4 py-3 text-foreground/80">{u._count?.sessions ?? 0}</td>
                          <td className="px-4 py-3 text-xs text-foreground/80">{lastLoginText(u)}</td>
                          <td className="px-4 py-3">{staffActions(u)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* Mobile cards */}
              <div className="stagger space-y-3 md:hidden">
                {data.users.map((u) => (
                  <Card key={u.id} className="hover-lift p-4 shadow-brand">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate font-semibold text-foreground">{u.name}</p>
                          {u.id === me?.id && (
                            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">{t('youBadge')}</span>
                          )}
                          {twoFaChip(u)}
                        </div>
                        <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                      </div>
                      {roleBadge(u.role)}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <p className="text-muted-foreground">{t('activeCol')}</p>
                        <div className="mt-1">{activeSwitch(u)}</div>
                      </div>
                      <div>
                        <p className="text-muted-foreground">{t('lastLoginCol')}</p>
                        <p className="mt-1 text-foreground/80">{lastLoginText(u)}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between border-t pt-3">
                      <span className="text-xs text-muted-foreground">
                        {u._count?.sessions ?? 0} {t('sessionsCol').toLowerCase()} · {u._count?.devices ?? 0} {t('devices').toLowerCase()}
                      </span>
                      {staffActions(u)}
                    </div>
                  </Card>
                ))}
              </div>

              <Pagination page={data.page} pages={data.pages} total={data.total} />
            </>
          )}
        </TabsContent>

        {/* ── My 2FA ── */}
        <TabsContent value="twofa" className="mt-4">
          <Card className="mx-auto max-w-xl p-6 shadow-brand">
            <div className="flex items-start gap-3">
              <div className={cn('rounded-xl p-2.5', me?.twoFaEnabled ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground')}>
                <Shield className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-bold text-foreground">{t('twoFaTitle')}</h2>
                  <Badge variant="outline" className={cn('font-semibold', me?.twoFaEnabled ? 'border-success/20 bg-success/10 text-success' : 'border-border bg-muted text-muted-foreground')}>
                    {me?.twoFaEnabled ? t('twoFaEnabledBadge') : t('twoFaDisabledBadge')}
                  </Badge>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {me?.twoFaEnabled ? t('twoFaEnabledHint') : t('twoFaDisabledHint')}
                </p>

                <div className="mt-4">
                  {me === null ? (
                    <Skeleton className="h-9 w-36" />
                  ) : me.twoFaEnabled ? (
                    <Button
                      variant="outline"
                      className="press gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setDisableOpen(true)}
                    >
                      <KeyRound className="h-4 w-4" /> {t('twoFaDisableBtn')}
                    </Button>
                  ) : !twoFaSetup ? (
                    <Button className="press gap-1.5" onClick={() => void startTwoFa()} disabled={twoFaBusy}>
                      <ShieldCheck className="h-4 w-4" /> {twoFaBusy ? t('twoFaGenerating') : t('twoFaEnableBtn')}
                    </Button>
                  ) : (
                    <div className="space-y-4">
                      <p className="text-sm font-semibold text-foreground">{t('twoFaSetupTitle')}</p>
                      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
                        <img
                          src={twoFaSetup.qrDataUrl}
                          alt={t('twoFaSetupTitle')}
                          className="h-[220px] w-[220px] shrink-0 rounded-xl border bg-white p-2"
                        />
                        <div className="w-full space-y-3">
                          <p className="text-xs leading-relaxed text-muted-foreground">{t('twoFaSetupStep1')}</p>
                          <div>
                            <Label className="text-xs">{t('twoFaSetupStep2')}</Label>
                            <div className="mt-1 flex items-center gap-2">
                              <code className="min-w-0 flex-1 break-all rounded-lg bg-muted px-2.5 py-2 font-mono text-xs text-foreground">
                                {twoFaSetup.secret}
                              </code>
                              <CopyButton value={twoFaSetup.secret} compact className="shrink-0" />
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="twofa-code" className="text-xs">{t('twoFaSetupStep3')}</Label>
                            <div className="flex gap-2">
                              <Input
                                id="twofa-code"
                                inputMode="numeric"
                                maxLength={6}
                                placeholder={t('twoFaCodePh')}
                                value={twoFaCode}
                                onChange={(e) => setTwoFaCode(e.target.value.replace(/\D/g, ''))}
                                className="tabular font-mono tracking-[0.3em]"
                                onKeyDown={(e) => { if (e.key === 'Enter') void verifyTwoFa() }}
                              />
                              <Button className="press shrink-0" onClick={() => void verifyTwoFa()} disabled={twoFaBusy || twoFaCode.length !== 6}>
                                <BadgeCheck className="mr-1.5 h-4 w-4" /> {t('twoFaVerifyBtn')}
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Card>
        </TabsContent>

        {/* ── Sessions ── */}
        <TabsContent value="sessions" className="mt-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">{t('sessionsDescription')}</p>
            <Button variant="outline" size="sm" className="press h-8 gap-1.5 shrink-0" onClick={() => void loadSecurity()}>
              <RefreshCw className={cn('h-3.5 w-3.5', secLoading && 'animate-spin')} /> {t('refresh')}
            </Button>
          </div>

          {secError && !sec ? (
            <ErrorCard message={secError} onRetry={() => void loadSecurity()} />
          ) : secLoading && !sec ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
          ) : !sec || sec.sessions.length === 0 ? (
            <Card className="border-dashed p-2 shadow-brand">
              <EmptyState icon={<MonitorSmartphone className="h-7 w-7" />} title={t('sessionsEmpty')} />
            </Card>
          ) : (
            <>
              {/* Desktop table */}
              <Card className="hidden overflow-hidden p-0 shadow-brand md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-left">
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('colDevice')}</th>
                      {isAdmin && <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('colUser')}</th>}
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('colIp')}</th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('colLastSeen')}</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="stagger">
                    {sec.sessions.map((s) => (
                      <tr key={s.id} className="border-b transition-colors last:border-0 hover:bg-muted/40">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <MonitorSmartphone className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span className="font-medium text-foreground">{s.browser ?? '—'}</span>
                            {s.isCurrent && (
                              <span className="rounded bg-success/10 px-1.5 py-0.5 text-[10px] font-bold text-success">{t('sessionCurrent')}</span>
                            )}
                          </div>
                        </td>
                        {isAdmin && (
                          <td className="px-4 py-3">
                            <p className="font-medium text-foreground">{s.userName}</p>
                            <p className="text-xs text-muted-foreground">{s.userEmail}</p>
                          </td>
                        )}
                        <td className="px-4 py-3 font-mono text-xs text-foreground/80">{s.ip ?? '—'}</td>
                        <td className="px-4 py-3 text-xs text-foreground/80" title={formatDateTime(s.lastSeenAt)}>{timeAgo(s.lastSeenAt)}</td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            variant="ghost" size="sm"
                            className="press h-8 gap-1.5 text-destructive hover:text-destructive"
                            onClick={() => void revokeSession(s)}
                          >
                            <LogOut className="h-3.5 w-3.5" /> {t('sessionRevoke')}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>

              {/* Mobile cards */}
              <div className="stagger space-y-3 md:hidden">
                {sec.sessions.map((s) => (
                  <Card key={s.id} className="hover-lift p-4 shadow-brand">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <MonitorSmartphone className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <p className="truncate font-semibold text-foreground">{s.browser ?? '—'}</p>
                      </div>
                      {s.isCurrent && (
                        <span className="shrink-0 rounded bg-success/10 px-1.5 py-0.5 text-[10px] font-bold text-success">{t('sessionCurrent')}</span>
                      )}
                    </div>
                    {isAdmin && <p className="mt-1 truncate text-xs text-muted-foreground">{s.userName} · {s.userEmail}</p>}
                    <div className="mt-3 flex items-center justify-between border-t pt-3 text-xs">
                      <div>
                        <p className="font-mono text-foreground/80">{s.ip ?? '—'}</p>
                        <p className="text-muted-foreground">{timeAgo(s.lastSeenAt)}</p>
                      </div>
                      <Button
                        variant="outline" size="sm"
                        className="press h-8 gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => void revokeSession(s)}
                      >
                        <LogOut className="h-3.5 w-3.5" /> {t('sessionRevoke')}
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            </>
          )}
        </TabsContent>

        {/* ── Login attempts ── */}
        <TabsContent value="attempts" className="mt-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">{t('attemptsDescription')}</p>
            <Button
              variant="outline" size="sm"
              className="press h-8 shrink-0 gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={!isAdmin || !sec || sec.loginAttempts.length === 0}
              onClick={() => void clearAttempts()}
            >
              <Trash2 className="h-3.5 w-3.5" /> {t('attemptsClear')}
            </Button>
          </div>

          {secError && !sec ? (
            <ErrorCard message={secError} onRetry={() => void loadSecurity()} />
          ) : secLoading && !sec ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}</div>
          ) : !sec || sec.loginAttempts.length === 0 ? (
            <Card className="border-dashed p-2 shadow-brand">
              <EmptyState icon={<KeyRound className="h-7 w-7" />} title={t('attemptsEmpty')} />
            </Card>
          ) : (
            <>
              {/* Desktop table */}
              <Card className="hidden overflow-hidden p-0 shadow-brand md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-left">
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('colEmail')}</th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('colIp')}</th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('colSuccess')}</th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('colWhen')}</th>
                    </tr>
                  </thead>
                  <tbody className="stagger">
                    {sec.loginAttempts.map((a) => (
                      <tr key={a.id} className="border-b transition-colors last:border-0 hover:bg-muted/40">
                        <td className="px-4 py-3 font-medium text-foreground">{a.email}</td>
                        <td className="px-4 py-3 font-mono text-xs text-foreground/80">{a.ip ?? '—'}</td>
                        <td className="px-4 py-3">
                          <span className={cn(
                            'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold',
                            a.success ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'
                          )}>
                            {a.success ? t('resultSuccess') : t('resultFailed')}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-foreground/80" title={formatDateTime(a.createdAt)}>{timeAgo(a.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>

              {/* Mobile cards */}
              <div className="stagger space-y-2 md:hidden">
                {sec.loginAttempts.map((a) => (
                  <Card key={a.id} className="hover-lift p-3.5 shadow-brand">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate font-semibold text-foreground">{a.email}</p>
                      <span className={cn(
                        'shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold',
                        a.success ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'
                      )}>
                        {a.success ? t('resultSuccess') : t('resultFailed')}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
                      <span className="font-mono">{a.ip ?? '—'}</span>
                      <span>{timeAgo(a.createdAt)}</span>
                    </div>
                  </Card>
                ))}
              </div>
            </>
          )}
        </TabsContent>

        {/* ── Activity ── */}
        <TabsContent value="activity" className="mt-4">
          <p className="mb-3 text-xs text-muted-foreground">{t('activityDescription')}</p>

          {secError && !sec ? (
            <ErrorCard message={secError} onRetry={() => void loadSecurity()} />
          ) : secLoading && !sec ? (
            <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}</div>
          ) : !sec || sec.activity.length === 0 ? (
            <Card className="border-dashed p-2 shadow-brand">
              <EmptyState icon={<Activity className="h-7 w-7" />} title={t('activityEmpty')} />
            </Card>
          ) : (
            <>
              {/* Desktop table */}
              <Card className="hidden overflow-hidden p-0 shadow-brand md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-left">
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('colActor')}</th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('colAction')}</th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('colTarget')}</th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('colWhen')}</th>
                    </tr>
                  </thead>
                  <tbody className="stagger">
                    {sec.activity.map((a) => (
                      <tr key={a.id} className="border-b transition-colors last:border-0 hover:bg-muted/40">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                              {(a.actorName || '?').charAt(0).toUpperCase()}
                            </span>
                            <span className="font-medium text-foreground">{a.actorName}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">{actionChip(a.action)}</td>
                        <td className="max-w-[220px] truncate px-4 py-3 font-mono text-xs text-muted-foreground">{a.target ?? '—'}</td>
                        <td className="px-4 py-3 text-xs text-foreground/80" title={formatDateTime(a.createdAt)}>{timeAgo(a.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>

              {/* Mobile cards */}
              <div className="stagger space-y-2 md:hidden">
                {sec.activity.map((a) => (
                  <Card key={a.id} className="hover-lift p-3.5 shadow-brand">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                          {(a.actorName || '?').charAt(0).toUpperCase()}
                        </span>
                        <p className="truncate font-semibold text-foreground">{a.actorName}</p>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(a.createdAt)}</span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      {actionChip(a.action)}
                      {a.target && <span className="truncate font-mono text-[11px] text-muted-foreground">{a.target}</span>}
                    </div>
                  </Card>
                ))}
              </div>

              {sec.activityPages > 1 && (
                <div className="flex items-center justify-between gap-2 py-3">
                  <p className="text-xs text-muted-foreground">
                    {t('page')} <span className="font-semibold text-foreground">{sec.activityPage}</span> {t('of')} {sec.activityPages} · {sec.activityTotal}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline" size="sm" className="press h-8 gap-1"
                      disabled={sec.activityPage <= 1}
                      onClick={() => set({ activityPage: sec.activityPage - 1 })}
                    >
                      <ChevronLeft className="h-3.5 w-3.5" /> {t('previous')}
                    </Button>
                    <Button
                      variant="outline" size="sm" className="press h-8 gap-1"
                      disabled={sec.activityPage >= sec.activityPages}
                      onClick={() => set({ activityPage: sec.activityPage + 1 })}
                    >
                      {t('next')} <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* Create / edit staff dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="nice-scroll max-h-[92vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? t('editStaffTitle') : t('createStaffTitle')}</DialogTitle>
            <DialogDescription className="sr-only">{t('secDescription')}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="staff-name">{t('staffName')} *</Label>
              <Input
                id="staff-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                autoFocus
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="staff-email">{t('staffEmail')} *</Label>
              <Input
                id="staff-email"
                type="email"
                value={form.email}
                disabled={!!editing}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="staff-password">{editing ? `${t('staffPasswordNew')} ${t('optional')}` : `${t('staffPassword')} *`}</Label>
              <Input
                id="staff-password"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="••••••••"
              />
              {editing && <p className="text-[11px] text-muted-foreground">{t('staffPasswordHint')}</p>}
            </div>

            <div className="grid gap-1.5">
              <Label>{t('roleCol')}</Label>
              <Select
                value={form.role}
                onValueChange={(v) => setForm({ ...form, role: v })}
                disabled={!!editing && editing.id === me?.id}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLE_LIST.map((r) => (
                    <SelectItem key={r} value={r}>
                      <span className="flex flex-col items-start">
                        <span className="font-semibold">{roleLabel(r)}</span>
                        <span className="text-[11px] font-normal leading-snug text-muted-foreground">{roleDesc(r)}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] leading-relaxed text-muted-foreground">{t('teamRoleHint')}</p>
            </div>

            {editing && (
              <div className="flex items-center justify-between rounded-xl border p-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">{t('staffActiveLabel')}</p>
                  <p className="text-[11px] text-muted-foreground">{t('staffActiveHint')}</p>
                </div>
                <Switch
                  checked={form.active}
                  disabled={editing.id === me?.id}
                  onCheckedChange={(v) => setForm({ ...form, active: v })}
                  aria-label={t('staffActiveLabel')}
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('cancel')}</Button>
            <Button className="press" onClick={() => void submitStaff()} disabled={saving}>
              {editing ? t('saveChanges') : t('create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete staff confirm */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteStaffTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.name} · {deleting?.email} — {t('deleteStaffBody')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={deleteBusy}
              onClick={(e) => { e.preventDefault(); void removeStaff() }}
            >
              {t('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Disable 2FA confirm */}
      <Dialog open={disableOpen} onOpenChange={setDisableOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('twoFaDisableTitle')}</DialogTitle>
            <DialogDescription>{t('twoFaDisableBody')}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="twofa-disable-password">{t('twoFaPasswordLabel')}</Label>
            <Input
              id="twofa-disable-password"
              type="password"
              value={disablePassword}
              onChange={(e) => setDisablePassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && disablePassword) void disableTwoFa() }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisableOpen(false)}>{t('cancel')}</Button>
            <Button
              className="press bg-destructive text-white hover:bg-destructive/90"
              disabled={twoFaBusy || !disablePassword}
              onClick={() => void disableTwoFa()}
            >
              {t('twoFaConfirmDisable')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
