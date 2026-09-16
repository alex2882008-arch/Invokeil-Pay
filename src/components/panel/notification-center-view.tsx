'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { toast } from 'sonner'
import { Bell, Mail, MessageSquare, Webhook, BellRing, RotateCcw, User, Search } from 'lucide-react'
import { fetchApi } from '@/lib/api-client'
import { PageHeader, EmptyState, ErrorCard } from './ui-bits'
import { useLang } from '@/lib/i18n'
import { useUrlState } from '@/hooks/use-url-state'
import { NTC_EN, NTC_BN } from '@/lib/i18n/notif-center'

// Module-local i18n resolver (main agent wires NTC_* into the global dicts later)
function useNtcT() {
  const { t, lang } = useLang()
  return useCallback(
    (k: string) => {
      const g = t(k)
      if (g !== k) return g
      return (lang === 'bn' ? NTC_BN[k] : NTC_EN[k]) ?? k
    },
    [t, lang],
  )
}

type ChannelKey = 'email' | 'sms' | 'webhook' | 'inapp'

interface PrefRow {
  event: string
  email: boolean
  sms: boolean
  webhook: boolean
  inapp: boolean
  custom: boolean
}

interface CustomerRow {
  id: string
  name: string
  phone: string
  email: string | null
}

const CHANNELS: Array<{ key: ChannelKey; i18n: string; icon: React.ReactNode }> = [
  { key: 'email', i18n: 'ntcColEmail', icon: <Mail className="h-3.5 w-3.5" /> },
  { key: 'sms', i18n: 'ntcColSms', icon: <MessageSquare className="h-3.5 w-3.5" /> },
  { key: 'webhook', i18n: 'ntcColWebhook', icon: <Webhook className="h-3.5 w-3.5" /> },
  { key: 'inapp', i18n: 'ntcColInapp', icon: <BellRing className="h-3.5 w-3.5" /> },
]

export function NotificationCenterView() {
  const tr = useNtcT()
  const { get, set } = useUrlState()
  const audience = get('aud', 'MERCHANT') === 'CUSTOMER' ? 'CUSTOMER' : 'MERCHANT'

  const [rows, setRows] = useState<PrefRow[] | null>(null)
  const [err, setErr] = useState('')
  const [savingKey, setSavingKey] = useState<string | null>(null)

  // customer picker state
  const [custQ, setCustQ] = useState('')
  const [custs, setCusts] = useState<CustomerRow[]>([])
  const [custLoading, setCustLoading] = useState(false)
  const customerId = get('customer', '')

  const selectedCustomer = custs.find((c) => c.id === customerId) ?? null

  const loadMatrix = useCallback(async () => {
    try {
      const p = new URLSearchParams({ audience })
      if (audience === 'CUSTOMER' && customerId) p.set('customerRef', customerId)
      const d = await fetchApi<{ rows: PrefRow[] }>(`/api/admin/notification-prefs?${p.toString()}`)
      setRows(d.rows)
      setErr('')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed')
    }
  }, [audience, customerId])

  useEffect(() => { loadMatrix() }, [loadMatrix])

  // Customer search (debounced) — only for the customer-override audience
  useEffect(() => {
    if (audience !== 'CUSTOMER') return
    setCustLoading(true)
    const id = window.setTimeout(() => {
      fetchApi<{ customers: CustomerRow[] }>(`/api/admin/customers${custQ ? `?q=${encodeURIComponent(custQ)}` : ''}`)
        .then((d) => setCusts(Array.isArray(d.customers) ? d.customers : []))
        .catch(() => setCusts([]))
        .finally(() => setCustLoading(false))
    }, 350)
    return () => window.clearTimeout(id)
  }, [custQ, audience])

  const toggle = async (row: PrefRow, key: ChannelKey, value: boolean) => {
    const snapshot = rows
    setSavingKey(`${row.event}:${key}`)
    // optimistic
    setRows((rs) => (rs ?? []).map((r) => (r.event === row.event ? { ...r, [key]: value } : r)))
    try {
      await fetchApi('/api/admin/notification-prefs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audience,
          ...(audience === 'CUSTOMER' && customerId ? { customerRef: customerId } : {}),
          event: row.event,
          // send the full row so unrelated channels never drift
          email: key === 'email' ? value : row.email,
          sms: key === 'sms' ? value : row.sms,
          webhook: key === 'webhook' ? value : row.webhook,
          inapp: key === 'inapp' ? value : row.inapp,
        }),
      })
      setRows((rs) => (rs ?? []).map((r) => (r.event === row.event ? { ...r, custom: true } : r)))
      toast.success(tr('ntcSaved'))
    } catch (e) {
      setRows(snapshot) // revert on failure
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setSavingKey(null)
    }
  }

  const resetRow = async (event: string) => {
    try {
      const p = new URLSearchParams({ audience, event })
      if (audience === 'CUSTOMER' && customerId) p.set('subjectRef', customerId)
      await fetchApi(`/api/admin/notification-prefs?${p.toString()}`, { method: 'DELETE' })
      await loadMatrix()
      toast.success(tr('ntcResetDone'))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tr('ntcResetFail'))
    }
  }

  const resetAll = async () => {
    const customs = (rows ?? []).filter((r) => r.custom)
    if (customs.length === 0) return
    try {
      await Promise.all(
        customs.map((r) => {
          const p = new URLSearchParams({ audience, event: r.event })
          if (audience === 'CUSTOMER' && customerId) p.set('subjectRef', customerId)
          return fetchApi(`/api/admin/notification-prefs?${p.toString()}`, { method: 'DELETE' })
        }),
      )
      await loadMatrix()
      toast.success(tr('ntcResetDone'))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tr('ntcResetFail'))
    }
  }

  const overridesCount = (rows ?? []).filter((r) => r.custom).length

  return (
    <div>
      <PageHeader
        title={tr('ntcTitle')}
        description={tr('ntcDesc')}
        icon={<Bell className="h-5 w-5" />}
        actions={
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            {savingKey ? tr('ntcSaving') : tr('ntcHint')}
          </p>
        }
      />

      {/* Audience tabs */}
      <div className="mb-4 flex w-full flex-wrap gap-1 rounded-lg border bg-muted/40 p-1 sm:w-auto">
        {[
          { v: 'MERCHANT', label: tr('ntcAudMerchant') },
          { v: 'CUSTOMER', label: tr('ntcAudCustomer') },
        ].map((a) => (
          <button
            key={a.v}
            type="button"
            onClick={() => set({ aud: a.v, customer: null })}
            className={`press h-9 flex-1 rounded-md px-4 text-xs font-semibold sm:flex-none ${
              audience === a.v ? 'bg-background text-foreground shadow-brand' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {a.label}
            {a.v === 'CUSTOMER' && overridesCount > 0 && (
              <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold text-primary">{overridesCount}</span>
            )}
          </button>
        ))}
      </div>

      {audience === 'MERCHANT' ? (
        <>
          <p className="mb-3 text-xs text-muted-foreground">{tr('ntcMerchantDesc')}</p>
          <MatrixTable tr={tr} rows={rows} err={err} reload={loadMatrix} onToggle={toggle} onReset={resetRow} />
        </>
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">{tr('ntcCustomerDesc')}</p>

          {/* Customer picker */}
          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={custQ}
                  onChange={(e) => setCustQ(e.target.value)}
                  placeholder={tr('ntcSearchCustomers')}
                  className="h-10 pl-9"
                  aria-label={tr('ntcSelectCustomer')}
                />
              </div>
              {custLoading ? (
                <div className="h-10 animate-pulse rounded-lg bg-muted/60" />
              ) : custs.length === 0 ? (
                <p className="py-2 text-center text-xs text-muted-foreground">{tr('ntcNoCustomer')}</p>
              ) : (
                <Select
                  value={customerId || undefined}
                  onValueChange={(v) => set({ customer: v })}
                >
                  <SelectTrigger className="h-10 w-full sm:w-96">
                    <SelectValue placeholder={tr('ntcSelectCustomer')} />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {custs.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                        {c.phone ? ` · ${c.phone}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </CardContent>
          </Card>

          {!customerId ? (
            <EmptyState
              icon={<User className="h-7 w-7" />}
              title={tr('ntcPickTitle')}
              hint={tr('ntcPickHint')}
            />
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="font-semibold text-foreground">{selectedCustomer?.name ?? customerId}</span>
                  {selectedCustomer?.phone && <span className="font-mono text-muted-foreground">{selectedCustomer.phone}</span>}
                  <Badge variant="outline" className="bg-primary/5 text-[10px]">{tr('ntcOverride')} · {overridesCount}</Badge>
                </p>
                {overridesCount > 0 && (
                  <Button size="sm" variant="outline" className="press h-8 gap-1.5" onClick={resetAll}>
                    <RotateCcw className="h-3.5 w-3.5" /> {tr('ntcResetAll')}
                  </Button>
                )}
              </div>
              <MatrixTable tr={tr} rows={rows} err={err} reload={loadMatrix} onToggle={toggle} onReset={resetRow} />
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Shared event × channel matrix ────────────────────────────────────────────

function MatrixTable({
  tr, rows, err, reload, onToggle, onReset,
}: {
  tr: (k: string) => string
  rows: PrefRow[] | null
  err: string
  reload: () => Promise<void>
  onToggle: (row: PrefRow, key: ChannelKey, value: boolean) => Promise<void>
  onReset: (event: string) => Promise<void>
}) {
  if (err) return <ErrorCard message={err} onRetry={reload} />
  if (!rows) {
    return (
      <Card className="overflow-hidden p-0">
        <CardContent className="space-y-2 p-4">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-muted/60" />)}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-44">{tr('ntcColEvent')}</TableHead>
              {CHANNELS.map((c) => (
                <TableHead key={c.key} className="w-20 text-center">
                  <span className="inline-flex items-center gap-1.5">{c.icon}{tr(c.i18n)}</span>
                </TableHead>
              ))}
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.event}>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{tr(`ntcEv${row.event}`)}</span>
                    {row.custom ? (
                      <Badge variant="outline" className="bg-primary/5 text-[9px] uppercase">{tr('ntcOverride')}</Badge>
                    ) : (
                      <span className="text-[9px] uppercase tracking-wide text-muted-foreground">{tr('ntcDefaultRow')}</span>
                    )}
                  </div>
                </TableCell>
                {CHANNELS.map((c) => (
                  <TableCell key={c.key} className="text-center">
                    <Switch
                      checked={row[c.key]}
                      onCheckedChange={(v) => onToggle(row, c.key, v)}
                      disabled={false}
                      aria-label={`${tr(`ntcEv${row.event}`)} — ${tr(c.i18n)}`}
                      className="mx-auto"
                    />
                  </TableCell>
                ))}
                <TableCell>
                  {row.custom ? (
                    <Button
                      size="sm" variant="ghost"
                      className="press h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                      onClick={() => onReset(row.event)}
                      title={tr('ntcResetRow')}
                      aria-label={tr('ntcResetRow')}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  )
}

export default NotificationCenterView
