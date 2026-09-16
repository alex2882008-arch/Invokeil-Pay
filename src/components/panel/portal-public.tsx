'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle, CalendarClock, FileText, Gavel, Repeat, ShieldCheck, Wallet,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { MfsBadge } from '@/components/panel/ui-bits'
import { POR_EN, POR_BN } from '@/lib/i18n/portal'
import { formatBDT, formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'

type PortalData = {
  customer: { name: string; emailMasked: string | null; since: string }
  invoices: Array<{
    id: string; number: string; title: string; status: string; total: number
    currency: string; dueDate: string | null; token: string; createdAt: string
  }>
  transactions: Array<{
    id: string; mfs: string; amount: number; status: string; occurredAt: string
    senderMasked: string | null; trxIdMasked: string | null
  }>
  subscriptions: Array<{
    id: string; planName: string; amount: number; interval: string; status: string
    nextBillingAt: string | null; trialEndsAt: string | null; cycles: number
  }>
}

const TONE: Record<string, string> = {
  PAID: 'border-success/30 bg-success/10 text-success',
  SENT: 'border-primary/25 bg-primary/10 text-primary',
  DRAFT: 'border-border bg-muted text-muted-foreground',
  OVERDUE: 'border-destructive/30 bg-destructive/10 text-destructive',
  CANCELLED: 'border-destructive/30 bg-destructive/10 text-destructive',
  REFUNDED: 'border-warning/40 bg-warning/10 text-amber-700 dark:text-amber-400',
  ACTIVE: 'border-success/30 bg-success/10 text-success',
  TRIALING: 'border-primary/25 bg-primary/10 text-primary',
  PAST_DUE: 'border-destructive/30 bg-destructive/10 text-destructive',
  MATCHED: 'border-primary/25 bg-primary/10 text-primary',
  UNMATCHED: 'border-warning/40 bg-warning/10 text-amber-700 dark:text-amber-400',
  REVERSED: 'border-destructive/30 bg-destructive/10 text-destructive',
}

function StatusChip({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={cn('font-medium', TONE[status] ?? 'border-border bg-muted text-muted-foreground')}>
      {status.replaceAll('_', ' ')}
    </Badge>
  )
}

// ── Public Customer Portal (token = the only credential — no login) ──────────
export function PortalPublicView({ token }: { token: string }) {
  const [lang, setLang] = useState<'en' | 'bn'>('en')
  const t = useCallback((k: string) => (lang === 'bn' ? POR_BN[k] ?? POR_EN[k] ?? k : POR_EN[k] ?? k), [lang])

  const [data, setData] = useState<PortalData | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [tab, setTab] = useState<'invoices' | 'payments' | 'subs'>('invoices')

  // dispute dialog
  const [disputeFor, setDisputeFor] = useState<{ id: string; number: string } | null>(null)
  const [disputeMsg, setDisputeMsg] = useState('')
  const [disputeBusy, setDisputeBusy] = useState(false)

  useEffect(() => {
    // Restore the visitor's language choice (same storage key as the panel)
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

  const load = useCallback(async () => {
    setLoading(true)
    setNotFound(false)
    try {
      const res = await fetch(`/api/portal/${encodeURIComponent(token)}`)
      if (res.status === 404) { setNotFound(true); return }
      if (!res.ok) throw new Error('Failed')
      setData((await res.json()) as PortalData)
    } catch {
      setNotFound(true)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { void load() }, [load])

  const submitDispute = async () => {
    if (!disputeFor) return
    const message = disputeMsg.trim()
    if (!message) return
    setDisputeBusy(true)
    try {
      const res = await fetch(`/api/portal/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dispute', invoiceId: disputeFor.id, message }),
      })
      if (!res.ok) {
        const body: { error?: string } | null = await res.json().catch(() => null)
        throw new Error(body?.error ?? 'Failed')
      }
      toast.success(t('porDisputeSent'))
      setDisputeFor(null)
      setDisputeMsg('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('porDisputeFail'))
    } finally {
      setDisputeBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4 py-4">
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-10 w-72 rounded-lg" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    )
  }

  if (notFound || !data) {
    return (
      <Card className="anim-fade-up mx-auto mt-10 max-w-md p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-lg font-bold text-foreground">{t('porNotFoundTitle')}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t('porNotFoundHint')}</p>
      </Card>
    )
  }

  const tabs: Array<{ key: 'invoices' | 'payments' | 'subs'; label: string; icon: React.ElementType; count: number }> = [
    { key: 'invoices', label: t('porInvoices'), icon: FileText, count: data.invoices.length },
    { key: 'payments', label: t('porPayments'), icon: Wallet, count: data.transactions.length },
    { key: 'subs', label: t('porSubscriptions'), icon: Repeat, count: data.subscriptions.length },
  ]

  return (
    <div className="space-y-5">
      {/* Welcome card */}
      <Card className="ilp-fade-up p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">{t('porPortal')}</p>
            <h1 className="mt-0.5 text-xl font-bold text-foreground sm:text-2xl">
              {t('porWelcome')}, {data.customer.name}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {data.customer.emailMasked ? `${data.customer.emailMasked} · ` : ''}{t('porWelcomeHint')}
            </p>
          </div>
          <Button variant="outline" size="sm" className="press h-8 gap-1 text-xs" onClick={toggleLang}>
            {lang === 'en' ? 'বাংলা' : 'EN'}
          </Button>
        </div>
        <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" /> {t('porTrust')}
        </p>
      </Card>

      {/* Tabs */}
      <div className="flex w-full gap-1.5 overflow-x-auto rounded-xl border bg-card p-1.5" role="tablist">
        {tabs.map(({ key, label, icon: Icon, count }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              'press flex min-h-[40px] flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm font-semibold transition-colors',
              tab === key ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
            <span className={cn('rounded-full px-1.5 text-[10px] font-bold', tab === key ? 'bg-primary-foreground/20' : 'bg-muted')}>{count}</span>
          </button>
        ))}
      </div>

      {/* ── Invoices ── */}
      {tab === 'invoices' && (
        <div className="ilp-fade-up space-y-3">
          {data.invoices.length === 0 && (
            <Card className="p-8 text-center text-sm text-muted-foreground">{t('porNoInvoices')}</Card>
          )}
          {data.invoices.map((inv) => (
            <Card key={inv.id} className="p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-bold text-foreground">{inv.number}</span>
                    <StatusChip status={inv.status} />
                  </div>
                  <p className="mt-1 truncate text-sm text-muted-foreground">{inv.title}</p>
                  {inv.dueDate && (
                    <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                      <CalendarClock className="h-3 w-3" /> {t('porColDue')}: {formatDateTime(inv.dueDate)}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold tabular text-foreground">{formatBDT(inv.total)}</p>
                  <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
                    <a
                      href={`/invoice/${inv.token}`}
                      className="press inline-flex h-9 items-center rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                    >
                      {inv.status === 'PAID' ? t('porOpenInvoice') : t('porViewInvoice')}
                    </a>
                    <Button
                      variant="outline"
                      size="sm"
                      className="press h-9 gap-1 text-xs"
                      onClick={() => setDisputeFor({ id: inv.id, number: inv.number })}
                    >
                      <Gavel className="h-3.5 w-3.5" /> {t('porDisputeTitle')}
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* ── Payments ── */}
      {tab === 'payments' && (
        <div className="ilp-fade-up space-y-3">
          {data.transactions.length === 0 && (
            <Card className="p-8 text-center text-sm text-muted-foreground">{t('porNoPayments')}</Card>
          )}
          {data.transactions.map((tx) => (
            <Card key={tx.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="flex min-w-0 items-center gap-3">
                <MfsBadge mfs={tx.mfs} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{tx.trxIdMasked ?? '—'}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {tx.senderMasked ? `${tx.senderMasked} · ` : ''}{formatDateTime(tx.occurredAt)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-bold tabular text-foreground">{formatBDT(tx.amount)}</span>
                <StatusChip status={tx.status} />
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* ── Subscriptions ── */}
      {tab === 'subs' && (
        <div className="ilp-fade-up space-y-3">
          {data.subscriptions.length === 0 && (
            <Card className="p-8 text-center text-sm text-muted-foreground">{t('porNoSubs')}</Card>
          )}
          {data.subscriptions.map((s) => (
            <Card key={s.id} className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-bold text-foreground">{s.planName}</p>
                  <StatusChip status={s.status} />
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {s.cycles} {t('porCycles')}
                  {s.nextBillingAt ? ` · ${t('porNextBilling')}: ${formatDateTime(s.nextBillingAt)}` : ''}
                  {s.trialEndsAt && s.status === 'TRIALING' ? ` · ${t('porTrial')}: ${formatDateTime(s.trialEndsAt)}` : ''}
                </p>
              </div>
              <p className="font-bold tabular text-foreground">{formatBDT(s.amount)} <span className="text-[11px] font-normal text-muted-foreground">/ {s.interval.toLowerCase()}</span></p>
            </Card>
          ))}
        </div>
      )}

      <p className="pt-2 text-center text-[11px] text-muted-foreground">{t('porContact')}</p>

      {/* ── Dispute dialog ── */}
      <Dialog open={!!disputeFor} onOpenChange={(open) => { if (!open) setDisputeFor(null) }}>
        <DialogContent className="max-h-[85vh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('porDisputeFor')} {disputeFor?.number}</DialogTitle>
            <DialogDescription>{t('porDisputeMsg')}</DialogDescription>
          </DialogHeader>
          <Textarea
            rows={4}
            value={disputeMsg}
            onChange={(e) => setDisputeMsg(e.target.value)}
            placeholder={t('porDisputePlaceholder')}
            aria-label={t('porDisputeMsg')}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisputeFor(null)}>{lang === 'en' ? 'Close' : 'বন্ধ করুন'}</Button>
            <Button className="press" disabled={disputeBusy || !disputeMsg.trim()} onClick={() => void submitDispute()}>
              {t('porDisputeSubmit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
