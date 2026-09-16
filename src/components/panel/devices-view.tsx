'use client'

import { useCallback, useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import {
  Smartphone, Plus, BatteryMedium, BatteryLow, Signal, Eye, EyeOff, QrCode, Trash2,
  RefreshCw, KeyRound, Wallet, Copy, BookOpen, PowerOff, Wifi, RotateCw,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { timeAgo, formatBDT } from '@/lib/format'
import { fetchApi } from '@/lib/api-client'
import { PageHeader, StatCard, EmptyState, ErrorCard, CopyButton, MfsBadge, ToneDot, copyText } from './ui-bits'
import { useLang } from '@/lib/i18n'

interface BalanceRow {
  id: string
  mfs: string
  simNumber: string | null
  accountType: string
  balance: number
  verifiedAt: string
}

interface DeviceItem {
  id: string
  name: string
  deviceKey: string
  pairingCode: string | null
  model: string | null
  androidVersion: string | null
  appVersion: string | null
  battery: number | null
  signal: string | null
  sims: string | null
  status: string
  lastSeen: string | null
  ownerId: string | null
  owner?: { id: string; name: string } | null
  sms24h?: number
  computedOnline?: boolean
  balances?: BalanceRow[]
}

interface UserOpt { id: string; name: string; role: string; active: boolean }

const STATUS_TONE: Record<string, string> = {
  ONLINE: 'border-success/25 bg-success/10 text-success',
  OFFLINE: 'bg-muted text-muted-foreground border-border',
  BLOCKED: 'border-destructive/25 bg-destructive/10 text-destructive',
}

function DeviceStatusBadge({ status }: { status: string }) {
  const { t } = useLang()
  const label = status === 'ONLINE' ? t('online') : status === 'BLOCKED' ? t('blocked') : t('offline')
  return (
    <Badge variant="outline" className={cn('gap-1.5 font-medium', STATUS_TONE[status] ?? STATUS_TONE.OFFLINE)}>
      <ToneDot status={status} /> {label}
    </Badge>
  )
}

/** Device key shown masked by default with an eye toggle to reveal. */
function KeyField({ device }: { device: DeviceItem }) {
  const { t } = useLang()
  const [show, setShow] = useState(false)
  const key = device.deviceKey ?? ''
  return (
    <div className="flex items-center gap-1.5">
      <code className="min-w-0 flex-1 truncate rounded-md bg-muted px-2 py-1.5 font-mono text-[11px] text-muted-foreground" title={show ? key : t('keyHidden')}>
        {show ? key : `${key.slice(0, 10)}${key.length > 10 ? '…' : ''}`}
      </code>
      <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0" aria-label={show ? 'Hide' : 'Show'} onClick={() => setShow((s) => !s)}>
        {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </Button>
      <CopyButton value={key} compact className="shrink-0" />
    </div>
  )
}

/** QR pairing dialog: QR encodes { url, key, code }; falls back to a big pairing code. */
function QrPairingDialog({ device, open, onClose }: { device: DeviceItem; open: boolean; onClose: () => void }) {
  const { t } = useLang()
  const [qr, setQr] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!open) return
    let alive = true
    const payload = JSON.stringify({
      url: window.location.origin,
      key: device.deviceKey,
      code: device.pairingCode,
    })
    QRCode.toDataURL(payload, { width: 340, margin: 1 })
      .then((d) => { if (alive) setQr(d) })
      .catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [open, device.deviceKey, device.pairingCode])

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><QrCode className="h-4 w-4 text-primary" /> {t('scanToPair')}</DialogTitle>
          <DialogDescription>{device.name}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-2">
          {qr && (
            <img src={qr} alt={t('scanToPair')} className="anim-scale-in rounded-xl border bg-white p-2" />
          )}
          {failed && <QrCode className="h-24 w-24 text-muted-foreground/40" />}
          {!qr && !failed && <Skeleton className="h-[340px] w-[340px] max-w-full rounded-xl" />}
          <p className="text-xs text-muted-foreground">{t('orEnterCode')}</p>
          <div className="flex items-center gap-2">
            <span className="rounded-lg border bg-muted px-4 py-2 font-mono text-2xl font-bold tracking-[0.35em] text-foreground">
              {device.pairingCode ?? '—'}
            </span>
            {device.pairingCode && <CopyButton value={device.pairingCode} />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Inline balance editor (add or update a per-MFS balance row). */
function BalanceEditor({ device, balance, onSaved }: { device: DeviceItem; balance?: BalanceRow; onSaved: () => void }) {
  const { t } = useLang()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [mfs, setMfs] = useState(balance?.mfs ?? 'BKASH')
  const [sim, setSim] = useState(balance?.simNumber ?? '')
  const [accType, setAccType] = useState(balance?.accountType ?? 'PERSONAL')
  const [amount, setAmount] = useState(balance ? String(balance.balance) : '')

  async function save() {
    setBusy(true)
    try {
      await fetchApi(`/api/admin/devices/${device.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ balance: { mfs, simNumber: sim || undefined, accountType: accType, balance: Number(amount) } }),
      })
      toast.success(t('balanceUpdated'))
      setOpen(false)
      onSaved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" size="sm" variant={balance ? 'ghost' : 'outline'} className="h-7 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground">
          {balance ? <RotateCw className="h-3 w-3" /> : <><Plus className="h-3 w-3" /> {t('updateBalance')}</>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 space-y-3">
        <p className="text-xs font-semibold text-foreground">{t('updateBalance')} · {balance?.mfs ?? t('balance')}</p>
        <div className="space-y-1.5">
          <Label className="text-[11px]">MFS</Label>
          <Select value={mfs} onValueChange={setMfs} disabled={!!balance}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {['BKASH', 'NAGAD', 'ROCKET', 'UPAY'].map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label className="text-[11px]">{t('simNumber')}</Label>
            <Input value={sim} onChange={(e) => setSim(e.target.value)} placeholder="01711…" className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px]">{t('accountType')}</Label>
            <Select value={accType} onValueChange={setAccType}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {['PERSONAL', 'AGENT', 'MERCHANT'].map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-[11px]">{t('balance')} (৳)</Label>
          <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-9" />
        </div>
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>{t('cancel')}</Button>
          <Button size="sm" onClick={save} disabled={busy || amount === ''}>{t('save')}</Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function DevicesView() {
  const { t } = useLang()
  const [items, setItems] = useState<DeviceItem[]>([])
  const [summary, setSummary] = useState<{ total: number; online: number; blocked: number } | null>(null)
  const [users, setUsers] = useState<UserOpt[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newOwner, setNewOwner] = useState('')
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState<DeviceItem | null>(null)
  const [qrFor, setQrFor] = useState<DeviceItem | null>(null)

  const load = useCallback(async (silent = false) => {
    if (!silent) setErr(null)
    try {
      const [list, sum] = await Promise.all([
        fetchApi<{ items: DeviceItem[] }>('/api/admin/devices'),
        fetchApi<{ total: number; online: number; blocked: number }>('/api/admin/devices?summary=1'),
      ])
      setItems(Array.isArray(list.items) ? list.items : [])
      setSummary(sum ?? null)
    } catch (e) {
      if (!silent) setErr(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const iv = setInterval(() => load(true), 20_000)
    return () => clearInterval(iv)
  }, [load])

  useEffect(() => {
    let alive = true
    fetchApi<{ items: UserOpt[] }>('/api/admin/users')
      .then((d) => { if (alive) setUsers((d.items ?? []).filter((u) => u.active)) })
      .catch(() => { /* AGENTs cannot list users — owner select stays empty */ })
    return () => { alive = false }
  }, [])

  async function createDevice() {
    if (!newName.trim()) { toast.error(t('nameRequired')); return }
    setBusy(true)
    try {
      const data = await fetchApi<{ device: DeviceItem }>('/api/admin/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, ownerId: newOwner && newOwner !== '__none' ? newOwner : null }),
      })
      setCreated(data.device)
      setCreateOpen(false)
      setNewName('')
      setNewOwner('')
      load(true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  async function patch(id: string, body: Record<string, unknown>, opts?: { showCreated?: boolean; successMsg?: string }) {
    try {
      const data = await fetchApi<{ device: DeviceItem }>(`/api/admin/devices/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (opts?.successMsg) toast.success(opts.successMsg)
      if (opts?.showCreated) setCreated(data.device)
      load(true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    }
  }

  async function remove(id: string) {
    try {
      await fetchApi(`/api/admin/devices/${id}`, { method: 'DELETE' })
      toast.success(t('deviceDeleted'))
      load(true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    }
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const ingestUrl = `${origin}/api/v1/sms`

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('devices')}
        description={t('devicesSub')}
        icon={<Smartphone className="h-5 w-5" />}
        actions={
          <Button onClick={() => setCreateOpen(true)} className="press gap-1.5">
            <Plus className="h-4 w-4" /> {t('addDevice')}
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard loading={!summary && loading} label={t('devStatTotal')} value={String(summary?.total ?? items.length)} icon={<Smartphone className="h-4 w-4" />} />
        <StatCard
          loading={!summary && loading}
          label={t('devStatOnline')}
          value={String(summary?.online ?? 0)}
          icon={<Wifi className="h-4 w-4" />}
          tone="text-success bg-success/10"
        />
        <StatCard
          loading={!summary && loading}
          label={t('blocked')}
          value={String(summary?.blocked ?? 0)}
          icon={<PowerOff className="h-4 w-4" />}
          tone="text-destructive bg-destructive/10"
        />
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-72 rounded-xl" />)}
        </div>
      ) : err ? (
        <ErrorCard message={err} onRetry={() => load()} />
      ) : items.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={<Smartphone className="h-10 w-10" />}
              title={t('noDevices')}
              hint={t('noDevicesHint')}
              action={
                <Button onClick={() => setCreateOpen(true)} className="press gap-1.5">
                  <Plus className="h-4 w-4" /> {t('addDevice')}
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 stagger">
          {items.map((d) => {
            const balances = Array.isArray(d.balances) ? d.balances : []
            return (
              <Card key={d.id} className="hover-lift flex flex-col">
                <CardContent className="flex flex-1 flex-col gap-3 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-foreground">{d.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {d.model ?? '—'}{d.androidVersion ? ` · Android ${d.androidVersion}` : ''}{d.appVersion ? ` · v${d.appVersion}` : ''}
                      </p>
                    </div>
                    <DeviceStatusBadge status={d.status} />
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      {d.battery != null && d.battery < 30
                        ? <BatteryLow className="h-3.5 w-3.5 text-destructive" />
                        : <BatteryMedium className="h-3.5 w-3.5 text-success" />}
                      {t('battery')} {d.battery != null ? `${d.battery}%` : '—'}
                    </span>
                    <span className="inline-flex items-center gap-1"><Signal className="h-3.5 w-3.5" /> {d.signal ?? '—'}</span>
                    <span>{t('lastSeen')}: {d.lastSeen ? timeAgo(d.lastSeen) : t('never')}</span>
                    {d.sms24h != null && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                        {d.sms24h} {t('smsLast24h')}
                      </span>
                    )}
                  </div>

                  <KeyField device={d} />

                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-muted-foreground">{t('pairingCode')}:</span>
                    <code className="font-mono text-xs font-semibold text-foreground">{d.pairingCode ?? '—'}</code>
                    {d.pairingCode && <CopyButton value={d.pairingCode} compact />}
                    <Button
                      type="button" size="sm" variant="outline"
                      className="press h-7 gap-1 px-2 text-[11px]"
                      onClick={() => setQrFor(d)}
                    >
                      <QrCode className="h-3 w-3" /> {t('showQr')}
                    </Button>
                  </div>

                  {d.owner && (
                    <p className="text-xs text-muted-foreground">
                      {t('owner')}: <span className="font-medium text-foreground/80">{d.owner.name}</span>
                    </p>
                  )}

                  {/* Balances */}
                  <div className="rounded-lg border bg-muted/30 p-2.5">
                    <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <Wallet className="h-3 w-3" /> {t('balances')}
                    </p>
                    {balances.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground/70">{t('noBalances')}</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {balances.map((b) => (
                          <li key={b.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                            <MfsBadge mfs={b.mfs} />
                            <span className="font-mono text-[11px] text-muted-foreground">{b.simNumber ?? '—'}</span>
                            <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-normal">{b.accountType}</Badge>
                            <span className="tabular font-semibold text-foreground">{formatBDT(b.balance)}</span>
                            <span className="text-[10px] text-muted-foreground/70">({t('verifiedAt')} {timeAgo(b.verifiedAt)})</span>
                            <BalanceEditor device={d} balance={b} onSaved={() => load(true)} />
                          </li>
                        ))}
                      </ul>
                    )}
                    {balances.length === 0 && (
                      <div className="mt-1"><BalanceEditor device={d} onSaved={() => load(true)} /></div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="mt-auto flex flex-wrap items-center gap-1.5 border-t pt-3">
                    {d.status === 'BLOCKED' ? (
                      <Button size="sm" variant="outline" className="press h-9" onClick={() => patch(d.id, { blocked: false }, { successMsg: t('unblockedToast') })}>
                        {t('unblock')}
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" className="press h-9" onClick={() => patch(d.id, { blocked: true }, { successMsg: t('blockedToast') })}>
                        {t('block')}
                      </Button>
                    )}

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost" className="press h-9 gap-1 text-xs text-muted-foreground">
                          <KeyRound className="h-3.5 w-3.5" /> {t('regenerateKey')}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t('regenerateKey')}?</AlertDialogTitle>
                          <AlertDialogDescription>{t('regenConfirm')}</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
                          <AlertDialogAction onClick={() => patch(d.id, { regenerateKey: true }, { showCreated: true, successMsg: t('keyRegenerated') })}>
                            {t('regenerateKey')}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost" className="press h-9 gap-1 text-xs text-muted-foreground">
                          <RotateCw className="h-3.5 w-3.5" /> {t('rotatePairing')}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t('rotatePairing')}?</AlertDialogTitle>
                          <AlertDialogDescription>{t('rotateConfirm')}</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
                          <AlertDialogAction onClick={() => patch(d.id, { rotatePairing: true }, { successMsg: t('pairingRotated') })}>
                            {t('rotatePairing')}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>

                    <span className="mx-auto" />

                    <Button
                      size="sm" variant="ghost" className="press h-9 gap-1 text-xs text-muted-foreground"
                      onClick={async () => { await copyText(ingestUrl); toast.success(t('copiedKey')) }}
                      title={t('ingestUrl')}
                    >
                      <Copy className="h-3.5 w-3.5" /> {t('ingestUrl')}
                    </Button>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-9 w-9 text-muted-foreground hover:text-destructive" aria-label={t('delete')}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t('deleteDeviceTitle')}</AlertDialogTitle>
                          <AlertDialogDescription>{t('confirmDelete')}</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
                          <AlertDialogAction onClick={() => remove(d.id)} className="bg-destructive text-white hover:bg-destructive/90">
                            {t('delete')}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Create device dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('addDevice')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>{t('deviceName')} *</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Agent Phone — Sylhet" autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label>{t('assignTo')} ({t('optional')})</Label>
              <Select value={newOwner} onValueChange={setNewOwner}>
                <SelectTrigger className="h-9"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">—</SelectItem>
                  {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name} · {u.role}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>{t('cancel')}</Button>
            <Button onClick={createDevice} disabled={!newName.trim() || busy}>{t('create')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Created-once dialog: key + pairing code + setup steps */}
      <Dialog open={!!created} onOpenChange={(o) => !o && setCreated(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('createdDeviceTitle')}</DialogTitle>
            <DialogDescription>{t('createdDeviceHint')}</DialogDescription>
          </DialogHeader>
          {created && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">{t('deviceKey')}</Label>
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 break-all rounded-lg bg-muted px-3 py-2.5 font-mono text-xs text-foreground">{created.deviceKey}</code>
                  <CopyButton value={created.deviceKey} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t('pairingCode')}</Label>
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 rounded-lg bg-muted px-3 py-2.5 font-mono text-lg font-bold tracking-[0.3em] text-foreground">{created.pairingCode}</span>
                  {created.pairingCode && <CopyButton value={created.pairingCode} />}
                  <Button size="sm" variant="outline" className="press gap-1" onClick={() => { setQrFor(created); setCreated(null) }}>
                    <QrCode className="h-3.5 w-3.5" /> {t('showQr')}
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t('panelUrl')}</Label>
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 break-all rounded-lg bg-muted px-3 py-2.5 font-mono text-xs text-foreground">{origin}</code>
                  <CopyButton value={origin} />
                </div>
              </div>
              <ol className="list-decimal space-y-2 rounded-lg border bg-muted/40 p-3.5 pl-8 text-xs leading-relaxed text-foreground/80">
                <li>{t('setupStep1')}</li>
                <li>{t('setupStep2')}</li>
                <li>{t('setupStep3')}</li>
                <li>{t('setupStep4')}</li>
                <li>{t('setupStep5')}</li>
              </ol>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setCreated(null)}>{t('close')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QR pairing */}
      {qrFor && (
        <QrPairingDialog
          key={qrFor.id + (qrFor.pairingCode ?? '')}
          device={qrFor}
          open={!!qrFor}
          onClose={() => setQrFor(null)}
        />
      )}

      {/* Floating setup hint icon for discoverability */}
      {items.length === 0 && !loading && (
        <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-muted-foreground/70">
          <BookOpen className="h-3 w-3" /> {t('setupStep1')}
        </p>
      )}
    </div>
  )
}
