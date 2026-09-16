'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandSeparator,
} from '@/components/ui/command'
import {
  LayoutDashboard, ArrowLeftRight, BarChart3, CreditCard, FileText, Link2, Contact2, Network,
  Smartphone, Inbox, Store, Webhook, BookOpen, Users, Settings, Plus, Zap, LogIn,
} from 'lucide-react'
import { useLang } from '@/lib/i18n'
import { NAV_GROUPS } from './admin-shell'
import type { SessionUser } from '@/lib/auth'
import { isAdminRole } from '@/lib/roles'

interface RecentItem {
  type: 'transaction' | 'checkout' | 'customer'
  label: string
  href: string
}

export function CommandPalette({
  open, onOpenChange, user,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  user: SessionUser
}) {
  const { t } = useLang()
  const router = useRouter()
  const [recent, setRecent] = useState<RecentItem[]>([])

  useEffect(() => {
    const id = window.setTimeout(() => {
      try {
        const raw = localStorage.getItem('ilp_recent')
        if (raw) setRecent(JSON.parse(raw).slice(0, 5))
      } catch { /* ignore */ }
    }, 0)
    return () => window.clearTimeout(id)
  }, [open])

  const go = (href: string, label?: string, type?: RecentItem['type']) => {
    if (type && label && href) {
      try {
        const prev = JSON.parse(localStorage.getItem('ilp_recent') ?? '[]') as RecentItem[]
        const next = [{ type, label, href }, ...prev.filter((r) => r.href !== href)].slice(0, 8)
        localStorage.setItem('ilp_recent', JSON.stringify(next))
      } catch { /* ignore */ }
    }
    onOpenChange(false)
    router.push(href)
  }

  const isAdmin = isAdminRole(user.role)

  const createItems = useMemo(() => [
    { label: 'New checkout', href: '/admin/checkouts?new=1', icon: Plus },
    { label: 'New invoice', href: '/admin/invoices?new=1', icon: Plus },
    { label: 'New payment link', href: '/admin/links?new=1', icon: Plus },
    { label: 'New customer', href: '/admin/customers?new=1', icon: Plus },
  ], [])

  const quickItems = useMemo(() => [
    { label: 'SMS Simulator', href: '/admin/sms?tab=simulator', icon: Zap },
    { label: 'Setup wizard', href: '/admin/wizard', icon: LogIn },
    { label: 'Pair device', href: '/admin/devices?new=1', icon: Smartphone },
  ], [])

  const navGroups = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((n) => !n.adminOnly || isAdmin),
  }))

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder={t('searchPlaceholder')} />
      <CommandList className="nice-scroll">
        <CommandEmpty>{t('noResults')}</CommandEmpty>
        {recent.length > 0 && (
          <>
            <CommandGroup heading="Recent">
              {recent.map((r) => (
                <CommandItem key={r.href} onSelect={() => go(r.href)}>
                  <ArrowLeftRight className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span className="truncate font-mono text-xs">{r.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}
        <CommandGroup heading={t('create')}>
          {createItems.map((c) => (
            <CommandItem key={c.href} onSelect={() => go(c.href)}>
              <c.icon className="mr-2 h-4 w-4 text-primary" />
              {c.label}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading={t('groupMain')}>
          {navGroups[0].items.map((n) => (
            <CommandItem key={n.href} onSelect={() => go(n.href)}>
              {n.icon}
              {t(n.labelKey)}
            </CommandItem>
          ))}
        </CommandGroup>
        {quickItems.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Quick actions">
              {quickItems.map((c) => (
                <CommandItem key={c.href} onSelect={() => go(c.href)}>
                  <c.icon className="mr-2 h-4 w-4 text-amber-500" />
                  {c.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
        {navGroups.slice(1).map((g, gi) => (
          <div key={g.labelKey}>
            <CommandSeparator />
            <CommandGroup heading={t(g.labelKey)}>
              {g.items.map((n) => (
                <CommandItem key={n.href} onSelect={() => go(n.href)}>
                  {n.icon}
                  {t(n.labelKey)}
                </CommandItem>
              ))}
            </CommandGroup>
          </div>
        ))}
      </CommandList>
    </CommandDialog>
  )
}

export const _iconGuard = { LayoutDashboard, BarChart3, Contact2, Network, BookOpen }
