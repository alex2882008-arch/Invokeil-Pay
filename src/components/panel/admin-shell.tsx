'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  LayoutDashboard, ArrowLeftRight, Smartphone, Inbox, CreditCard, Store, Users, Settings, Menu,
  LogOut, FileText, Link2, Contact2, Waypoints, Webhook, BookOpen, BarChart3, Network, Search,
  Command as CommandIcon, Monitor, Moon, Sun, Signpost, Loader2, Mail, MessageSquareText, Bell,
  Workflow, Undo2, Landmark, Calculator, Repeat, ShieldAlert, BadgeCheck, IdCard, ShieldCheck,
  Activity, Radar, DatabaseBackup, Blocks, Building2, TerminalSquare, UserRound,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLang, Lang } from '@/lib/i18n'
import { BrandLogo } from './ui-bits'
import { CommandPalette } from './command-palette'
import { ProfileDialog } from './profile-dialog'
import type { SessionUser } from '@/lib/auth'
import { useTheme } from '@/hooks/use-theme'
import { isAdminRole } from '@/lib/roles'

export interface NavItem {
  href: string
  labelKey: string
  icon: React.ReactNode
  adminOnly?: boolean
}

export interface NavGroup {
  labelKey: string
  items: NavItem[]
}

export const NAV_GROUPS: NavGroup[] = [
  {
    labelKey: 'groupMain',
    items: [
      { href: '/admin/dashboard', labelKey: 'dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
      { href: '/admin/transactions', labelKey: 'transactions', icon: <ArrowLeftRight className="h-4 w-4" /> },
      { href: '/admin/reports', labelKey: 'reports', icon: <BarChart3 className="h-4 w-4" /> },
    ],
  },
  {
    labelKey: 'groupMoney',
    items: [
      { href: '/admin/checkouts', labelKey: 'checkoutPages', icon: <CreditCard className="h-4 w-4" /> },
      { href: '/admin/invoices', labelKey: 'invoices', icon: <FileText className="h-4 w-4" /> },
      { href: '/admin/links', labelKey: 'paymentLinks', icon: <Link2 className="h-4 w-4" /> },
      { href: '/admin/subscriptions', labelKey: 'subscriptions', icon: <Repeat className="h-4 w-4" /> },
      { href: '/admin/customers', labelKey: 'customers', icon: <Contact2 className="h-4 w-4" /> },
    ],
  },
  {
    labelKey: 'groupComms',
    items: [
      { href: '/admin/email', labelKey: 'emailAutomation', icon: <Mail className="h-4 w-4" /> },
      { href: '/admin/sms-gateway', labelKey: 'smsGatewayPlus', icon: <MessageSquareText className="h-4 w-4" /> },
      { href: '/admin/notifications', labelKey: 'notificationCenter', icon: <Bell className="h-4 w-4" /> },
      { href: '/admin/automations', labelKey: 'automations', icon: <Workflow className="h-4 w-4" /> },
    ],
  },
  {
    labelKey: 'groupAutomation',
    items: [
      { href: '/admin/gateways', labelKey: 'gateways', icon: <Network className="h-4 w-4" /> },
      { href: '/admin/devices', labelKey: 'devices', icon: <Smartphone className="h-4 w-4" /> },
      { href: '/admin/sms', labelKey: 'smsInbox', icon: <Inbox className="h-4 w-4" /> },
    ],
  },
  {
    labelKey: 'groupFinance',
    items: [
      { href: '/admin/refunds', labelKey: 'refundsDisputes', icon: <Undo2 className="h-4 w-4" /> },
      { href: '/admin/settlements', labelKey: 'settlements', icon: <Landmark className="h-4 w-4" /> },
      { href: '/admin/accounting', labelKey: 'accounting', icon: <Calculator className="h-4 w-4" /> },
    ],
  },
  {
    labelKey: 'groupTrust',
    items: [
      { href: '/admin/risk', labelKey: 'riskEngine', icon: <ShieldAlert className="h-4 w-4" /> },
      { href: '/admin/approvals', labelKey: 'approvals', icon: <BadgeCheck className="h-4 w-4" /> },
      { href: '/admin/kyc', labelKey: 'kyc', icon: <IdCard className="h-4 w-4" /> },
      { href: '/admin/security-center', labelKey: 'securityCenter', icon: <ShieldCheck className="h-4 w-4" /> },
    ],
  },
  {
    labelKey: 'groupOperations',
    items: [
      { href: '/admin/operations', labelKey: 'operations', icon: <Activity className="h-4 w-4" /> },
      { href: '/admin/incidents', labelKey: 'incidents', icon: <Radar className="h-4 w-4" /> },
      { href: '/admin/imports', labelKey: 'importsCenter', icon: <DatabaseBackup className="h-4 w-4" /> },
      { href: '/admin/marketplace', labelKey: 'marketplace', icon: <Blocks className="h-4 w-4" /> },
      { href: '/admin/brands', labelKey: 'brands', icon: <Building2 className="h-4 w-4" /> },
    ],
  },
  {
    labelKey: 'groupDevelopers',
    items: [
      { href: '/admin/developers', labelKey: 'developerConsole', icon: <TerminalSquare className="h-4 w-4" /> },
      { href: '/admin/merchants', labelKey: 'merchants', icon: <Store className="h-4 w-4" />, adminOnly: true },
      { href: '/admin/webhooks', labelKey: 'webhookCenter', icon: <Webhook className="h-4 w-4" />, adminOnly: true },
      { href: '/admin/docs', labelKey: 'apiDocs', icon: <BookOpen className="h-4 w-4" /> },
    ],
  },
  {
    labelKey: 'groupAdministration',
    items: [
      { href: '/admin/users', labelKey: 'usersRoles', icon: <Users className="h-4 w-4" />, adminOnly: true },
      { href: '/admin/settings', labelKey: 'settings', icon: <Settings className="h-4 w-4" /> },
    ],
  },
]

const BOTTOM_NAV: NavItem[] = [
  { href: '/admin/dashboard', labelKey: 'dashboard', icon: <LayoutDashboard className="h-5 w-5" /> },
  { href: '/admin/transactions', labelKey: 'transactions', icon: <ArrowLeftRight className="h-5 w-5" /> },
  { href: '/admin/checkouts', labelKey: 'checkoutPages', icon: <CreditCard className="h-5 w-5" /> },
  { href: '/admin/devices', labelKey: 'devices', icon: <Smartphone className="h-5 w-5" /> },
]

export function allNavItems(user?: { role: string } | null): NavItem[] {
  return NAV_GROUPS.flatMap((g) => g.items).filter((n) => !n.adminOnly || isAdminRole(user?.role))
}

export function navLabelKeyForPath(path: string): string {
  // Label lookup includes admin-only items — the page itself is already auth-gated,
  // so the topbar title must resolve for merchants/webhooks/users too.
  const item = NAV_GROUPS.flatMap((g) => g.items).find((n) => path === n.href || path.startsWith(n.href + '/'))
  return item?.labelKey ?? 'dashboard'
}

function LangToggle() {
  const { lang, setLang } = useLang()
  const opts: Array<{ k: Lang; label: string }> = [
    { k: 'en', label: 'EN' },
    { k: 'bn', label: 'বাংলা' },
  ]
  return (
    <div className="flex items-center rounded-lg border bg-card p-0.5" role="group" aria-label="Language">
      {opts.map((o) => (
        <button
          key={o.k}
          type="button"
          onClick={() => setLang(o.k)}
          className={cn(
            'press rounded-md px-2 py-1 text-xs font-semibold',
            lang === o.k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function ThemeToggle() {
  const { t } = useLang()
  const { theme, setTheme } = useTheme()
  const cycle = useCallback(() => {
    setTheme(theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light')
  }, [theme, setTheme])
  return (
    <Button variant="outline" size="icon" onClick={cycle} aria-label={t('theme')} title={`${t('theme')}: ${theme}`}>
      {theme === 'dark' ? <Moon className="h-4 w-4" /> : theme === 'light' ? <Sun className="h-4 w-4" /> : <Monitor className="h-4 w-4" />}
    </Button>
  )
}

function SidebarContent({
  user, onNavigate, brandName, pathname,
}: {
  user: SessionUser
  onNavigate: () => void
  brandName: string
  pathname: string
}) {
  const { t } = useLang()
  const groups = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((n) => !n.adminOnly || isAdminRole(user.role)),
  })).filter((g) => g.items.length > 0)

  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pb-4 pt-6">
        <Link href="/admin/dashboard" onClick={onNavigate} className="inline-flex items-center gap-2.5">
          <BrandLogo size={34} wordmark={false} />
          <span>
            <span className="block text-base font-bold leading-tight text-foreground">{brandName}</span>
            <span className="block text-[11px] text-muted-foreground">{t('brandTagline')}</span>
          </span>
        </Link>
      </div>
      <nav className="nice-scroll flex-1 space-y-4 overflow-y-auto px-3 pb-4" aria-label="Admin">
        {groups.map((g) => (
          <div key={g.labelKey}>
            <p className="mb-1 px-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
              {t(g.labelKey)}
            </p>
            <div className="space-y-0.5">
              {g.items.map((n) => {
                const active = pathname === n.href || pathname.startsWith(n.href + '/')
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    onClick={onNavigate}
                    className={cn(
                      'press flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium',
                      active
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                    aria-current={active ? 'page' : undefined}
                  >
                    <span className={cn('transition-transform duration-150', active && 'scale-110')}>{n.icon}</span>
                    {t(n.labelKey)}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t p-4">
        <p className="truncate text-sm font-semibold text-foreground">{user.name}</p>
        <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        <p className="mt-1 inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
          {user.role}
        </p>
      </div>
    </div>
  )
}

export function AdminShell({
  user, brandName, children,
}: {
  user: SessionUser
  brandName: string
  children: React.ReactNode
}) {
  const { t } = useLang()
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [online, setOnline] = useState(true)
  const [appMode, setAppMode] = useState<string | null>(null)

  // Global Ctrl+K / Cmd+K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Reset scroll on navigation so sticky topbar never covers page headers
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [pathname])

  useEffect(() => {
    const upd = () => setOnline(navigator.onLine)
    upd()
    window.addEventListener('online', upd)
    window.addEventListener('offline', upd)
    return () => {
      window.removeEventListener('online', upd)
      window.removeEventListener('offline', upd)
    }
  }, [])

  // Sandbox/Production mode chip — deferred so it never blocks hydration
  useEffect(() => {
    const id = window.setTimeout(() => {
      fetch('/api/admin/settings')
        .then((r) => (r.ok ? r.json() : null))
        .then((j: { settings?: Record<string, string> } | null) => {
          if (j?.settings?.appMode) setAppMode(j.settings.appMode)
        })
        .catch(() => {})
    }, 400)
    return () => window.clearTimeout(id)
  }, [])

  const signOut = useCallback(async () => {
    setSigningOut(true)
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch { /* ignore */ }
    router.push('/login')
    router.refresh()
  }, [router])

  const activeLabel = useMemo(() => t(navLabelKeyForPath(pathname)), [pathname, t])

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r bg-sidebar lg:block">
        <SidebarContent user={user} onNavigate={() => {}} brandName={brandName} pathname={pathname} />
      </aside>

      {/* Mobile drawer */}
      <div
        className={cn(
          'fixed inset-0 z-40 lg:hidden',
          mobileOpen ? 'pointer-events-auto' : 'pointer-events-none'
        )}
        aria-hidden={!mobileOpen}
      >
        <div
          className={cn('absolute inset-0 bg-black/40 transition-opacity duration-200', mobileOpen ? 'opacity-100' : 'opacity-0')}
          onClick={() => setMobileOpen(false)}
        />
        <aside
          className={cn(
            'absolute inset-y-0 left-0 w-72 border-r bg-sidebar transition-transform duration-300',
            mobileOpen ? 'translate-x-0' : '-translate-x-full'
          )}
          style={{ transitionTimingFunction: 'var(--ease-spring)' }}
        >
          <SidebarContent user={user} onNavigate={() => setMobileOpen(false)} brandName={brandName} pathname={pathname} />
        </aside>
      </div>

      <div className="lg:pl-64">
        {/* Topbar */}
        <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur-md safe-top">
          <div className="flex h-14 items-center gap-2 px-3 sm:px-6">
            <Button variant="outline" size="icon" className="lg:hidden" aria-label={t('openPanel')} onClick={() => setMobileOpen(true)}>
              <Menu className="h-5 w-5" />
            </Button>
            <h2 className="flex-1 truncate text-sm font-semibold text-foreground sm:text-base">
              {activeLabel}
            </h2>
            {!online && (
              <span className="rounded-full bg-destructive/10 px-2 py-1 text-xs font-semibold text-destructive">
                Offline
              </span>
            )}
            {appMode === 'SANDBOX' && (
              <span
                className="animate-pulse rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-bold tracking-wide text-amber-600 dark:text-amber-400"
                title="Sandbox mode — outbound email/SMS/gateway calls are simulated"
              >
                SANDBOX
              </span>
            )}
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="press hidden items-center gap-2 rounded-lg border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted md:flex"
            >
              <Search className="h-3.5 w-3.5" />
              {t('searchPlaceholder')}
              <kbd className="ml-2 flex items-center gap-0.5 rounded border bg-background px-1.5 py-0.5 font-mono text-[10px]">
                <CommandIcon className="h-2.5 w-2.5" />K
              </kbd>
            </button>
            <Button variant="outline" size="icon" className="md:hidden" onClick={() => setPaletteOpen(true)} aria-label={t('search')}>
              <Search className="h-4 w-4" />
            </Button>
            <ThemeToggle />
            <LangToggle />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setProfileOpen(true)}
              aria-label={t('profile')}
              title={t('profile')}
            >
              <UserRound className="h-4.5 w-4.5 text-muted-foreground" />
            </Button>
            <Button variant="ghost" size="icon" onClick={signOut} disabled={signingOut} aria-label={t('signOut')} title={t('signOut')}>
              {signingOut ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : <LogOut className="h-4.5 w-4.5 text-muted-foreground" />}
            </Button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl scroll-mt-20 px-3 pb-24 pt-4 sm:px-6 sm:pt-6 lg:pb-10">{children}</main>

        <footer className="hidden border-t py-4 text-center text-xs text-muted-foreground lg:block">
          {brandName} — {t('brandTagline')}
        </footer>
      </div>

      {/* Mobile bottom nav */}
      <nav
        className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur-md lg:hidden"
        aria-label="Primary mobile"
      >
        <div className="grid grid-cols-5">
          {BOTTOM_NAV.map((n) => {
            const active = pathname === n.href || pathname.startsWith(n.href + '/')
            return (
              <Link
                key={n.href}
                href={n.href}
                className={cn(
                  'flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors',
                  active ? 'text-primary' : 'text-muted-foreground'
                )}
                aria-current={active ? 'page' : undefined}
              >
                <span className={cn('rounded-full px-3 py-1 transition-all duration-200', active && 'bg-primary/10')}>
                  {n.icon}
                </span>
                {t(n.labelKey)}
              </Link>
            )
          })}
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium text-muted-foreground"
          >
            <span className="rounded-full px-3 py-1">
              <Menu className="h-5 w-5" />
            </span>
            More
          </button>
        </div>
      </nav>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} user={user} />

      {/* Profile management — own account, password & 2FA status */}
      <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
    </div>
  )
}

/** Hidden helper icon import guard (Signpost used by wizard links elsewhere) */
export const _icons = { Signpost }
