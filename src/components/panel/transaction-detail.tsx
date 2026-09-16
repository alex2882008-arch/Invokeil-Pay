'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  ArrowLeft, Undo2, Trash2, SendHorizontal, LinkIcon, Inbox, MessageSquareText,
  ExternalLink, ReceiptText, UserRound,
} from 'lucide-react'
import { formatBDT, formatDateTime, timeAgo } from '@/lib/format'
import { fetchApi, ApiError } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import { useLang } from '@/lib/i18n'
import { MfsBadge, StatusBadge, EmptyState, ErrorCard, DetailRow, CopyButton } from './ui-bits'
import { GatewayLogo } from './gateway-logo'
import { isAdminRole } from '@/lib/roles'

// ── Types / guards ───────────────────────────────────────────────────────────

interface TxDetail {
  id: string
  trxId: string | null
  mfs: string
  gatewayCode: string | null
  method: string | null
  bankName: string | null
  amount: number
  charge: number
  discount: number
  netAmount: number | null
  fee: number
  balance: number | null
  senderNumber: string | null
  senderName: string | null
  status: string
  occurredAt: string
  createdAt: string
  ipnSentAt: string | null
  rawSms?: { id: string; sender: string; body: string; receivedAt: string; simNumber: string | null } | null
  device?: { id: string; name: string | null } | null
  checkout?: { id: string; token: string; title: string; status: string; amount: number } | null
  link?: { id: string; slug: string; title: string } | null
  invoice?: { id: string; number: string; token: string; title: string } | null
  customer?: { id: string; name: string; phone: string | null } | null
}

interface CheckoutOption {
  id: string
  token: string
  title: string
  amount: number
  status: string
}

function isTxDetail(d: unknown): d is { transaction: TxDetail } {
  if (!d || typeof d !== 'object') return false
  const tx = (d as { transaction?: unknown }).transaction
  if (!tx || typeof tx !== 'object') return false
  const o = tx as Partial<TxDetail>
  return typeof o.id === 'string' && typeof o.mfs === 'string' && typeof o.amount === 'number' && typeof o.status === 'string'
}

// ── View ─────────────────────────────────────────────────────────────────────

export function TransactionDetailPage() {
  const { t } = useLang()
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const id = typeof params?.id === 'string' ? params.id : ''

  const [tx, setTx] = useState<TxDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [role, setRole] = useState<string>('VIEWER')
  const [busy, setBusy] = useState(false)

  // dialogs
  const [matchOpen, setMatchOpen] = useState(false)
  const [checkouts, setCheckouts] = useState<CheckoutOption[] | null>(null)
  const [checkoutsLoading, setCheckoutsLoading] = useState(false)
  const [pickedCheckout, setPickedCheckout] = useState('')
  const [reverseOpen, setReverseOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const d = await fetchApi<unknown>(`/api/admin/transactions/${id}`)
      if (!isTxDetail(d)) throw new Error('Unexpected response from server')
      setTx(d.transaction)
      setNotFound(false)
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setNotFound(true)
      else setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    if (id) load()
  }, [id, load])

  useEffect(() => {
    const tid = window.setTimeout(() => {
      fetchApi<{ user: { role: string } | null }>('/api/auth/me')
        .then((d) => setRole(d.user?.role ?? 'VIEWER'))
        .catch(() => { /* stays VIEWER */ })
    }, 0)
    return () => window.clearTimeout(tid)
  }, [])

  const isAdmin = isAdminRole(role)

  const loadOpenCheckouts = useCallback(async () => {
    setCheckoutsLoading(true)
    try {
      let list: CheckoutOption[] = []
      try {
        const r = await fetchApi<{ items?: CheckoutOption[] }>('/api/admin/checkouts?status=open&page=1')
        list = Array.isArray(r.items) ? r.items : []
      } catch { /* fall through to explicit statuses */ }
      if (list.length === 0) {
        const [a, b] = await Promise.all([
          fetchApi<{ items?: CheckoutOption[] }>('/api/admin/checkouts?status=AWAITING&page=1'),
          fetchApi<{ items?: CheckoutOption[] }>('/api/admin/checkouts?status=PENDING&page=1'),
        ])
        list = [...(a.items ?? []), ...(b.items ?? [])]
      }
      setCheckouts(list.filter((c) => c.status !== 'PAID' && c.status !== 'CANCELLED' && c.status !== 'EXPIRED'))
    } catch {
      setCheckouts([])
    } finally {
      setCheckoutsLoading(false)
    }
  }, [])

  const openMatch = () => {
    setPickedCheckout('')
    setCheckouts(null)
    setMatchOpen(true)
    loadOpenCheckouts()
  }

  const patch = async (body: Record<string, unknown>, successMsg: string): Promise<boolean> => {
    setBusy(true)
    try {
      await fetchApi(`/api/admin/transactions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      toast.success(successMsg)
      setMatchOpen(false)
      setReverseOpen(false)
      load()
      return true
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed')
      return false
    } finally {
      setBusy(false)
    }
  }

  const doDelete = async () => {
    setBusy(true)
    try {
      await fetchApi(`/api/admin/transactions/${id}`, { method: 'DELETE' })
      toast.success(t('deletedDone'))
      router.push('/admin/transactions')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setBusy(false)
    }
  }

  const doResend = async () => {
    setBusy(true)
    try {
      const r = await fetchApi<{ dispatched: number; deliveries: Array<{ status: string; httpCode: number | null; error: string | null }> }>(
        `/api/admin/transactions/${id}/resend`,
        { method: 'POST' }
      )
      const ok = r.deliveries.some((d) => d.status === 'SUCCESS')
      if (r.dispatched === 0) toast.error(t('ipnNoStore'))
      else if (ok) toast.success(t('ipnResent'))
      else toast.warning(t('ipnResentFailed'))
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('ipnNoStore'))
    } finally {
      setBusy(false)
    }
  }

  // ── Loading skeleton ───────────────────────────────────────────────────────
  if (loading && !tx && !notFound) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-44 rounded-lg" />
        <Skeleton className="h-28 rounded-xl" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    )
  }

  // ── 404 ────────────────────────────────────────────────────────────────────
  if (notFound) {
    return (
      <Card className="border-dashed p-2 shadow-brand">
        <EmptyState
          icon={<Inbox className="h-7 w-7" />}
          title={t('notFoundTitle')}
          hint={t('notFoundHint')}
          action={
            <Link href="/admin/transactions">
              <Button variant="outline" className="press gap-1.5">
                <ArrowLeft className="h-4 w-4" /> {t('backToTransactions')}
              </Button>
            </Link>
          }
        />
      </Card>
    )
  }

  if (error && !tx) {
    return <ErrorCard message={error} onRetry={load} />
  }
  if (!tx) return null

  const feePresent = tx.charge > 0 || tx.discount > 0 || tx.netAmount != null
  const hasSms = !!tx.rawSms

  return (
    <div className="space-y-5">
      {/* Back + header */}
      <div className="anim-fade-up">
        <Link
          href="/admin/transactions"
          className="press inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> {t('backToTransactions')}
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <p className="tabular text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{formatBDT(tx.amount)}</p>
          <span className="inline-flex items-center gap-1.5">
            <GatewayLogo code={tx.gatewayCode} mfs={tx.mfs} size={28} rounded="rounded-lg" />
            <MfsBadge mfs={tx.mfs} className="text-sm" />
          </span>
          <StatusBadge status={tx.status} className="text-sm" />
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          {t('occurredAt')}: {formatDateTime(tx.occurredAt)} · {timeAgo(tx.occurredAt)}
        </p>
      </div>

      {/* Actions */}
      <div className="anim-fade-up flex flex-wrap items-center gap-2">
        <Button size="sm" className="press gap-1.5" onClick={openMatch} disabled={busy}>
          <LinkIcon className="h-3.5 w-3.5" /> {t('matchToCheckout')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="press gap-1.5 border-warning/40 text-amber-700 hover:bg-warning/10 dark:text-amber-400"
          onClick={() => setReverseOpen(true)}
          disabled={busy || tx.status === 'REVERSED'}
        >
          <Undo2 className="h-3.5 w-3.5" /> {t('reverse')}
        </Button>
        <Button size="sm" variant="outline" className="press gap-1.5" onClick={doResend} disabled={busy}>
          <SendHorizontal className="h-3.5 w-3.5" /> {t('resendIpn')}
        </Button>
        {isAdmin && (
          <Button
            size="sm"
            variant="outline"
            className="press gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10"
            onClick={() => setDeleteOpen(true)}
            disabled={busy}
          >
            <Trash2 className="h-3.5 w-3.5" /> {t('delete')}
          </Button>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Details */}
        <Card className="anim-fade-up p-4 shadow-brand sm:p-5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-foreground">{t('detailsSection')}</h2>
            {tx.trxId && <CopyButton value={tx.trxId} compact label={t('copyTrxId')} />}
          </div>
          <div className="grid gap-x-6 sm:grid-cols-2">
            <DetailRow label={t('trxId')} value={tx.trxId ?? '—'} mono />
            <DetailRow label={t('mfs')} value={<span className="inline-flex items-center gap-1.5"><GatewayLogo code={tx.gatewayCode} mfs={tx.mfs} size={28} rounded="rounded-lg" /><MfsBadge mfs={tx.mfs} /></span>} />
            <DetailRow label={t('method')} value={tx.method ?? tx.gatewayCode ?? '—'} />
            <DetailRow label={t('bankName')} value={tx.bankName ?? '—'} />
            <DetailRow label={t('senderName')} value={tx.senderName ?? '—'} />
            <DetailRow label={t('senderNumber')} value={tx.senderNumber ?? '—'} mono />
            <DetailRow label={t('balanceAfter')} value={tx.balance != null ? formatBDT(tx.balance) : '—'} mono />
            <DetailRow label={t('fee')} value={formatBDT(tx.fee)} />
            <DetailRow
              label={t('deviceCol')}
              value={tx.device?.name ? <Link href="/admin/devices" className="text-primary hover:underline">{tx.device.name}</Link> : '—'}
            />
            <DetailRow label={t('occurredAt')} value={formatDateTime(tx.occurredAt)} />
            <DetailRow label={t('createdAt')} value={formatDateTime(tx.createdAt)} />
          </div>
        </Card>

        <div className="space-y-4">
          {/* Fee breakdown */}
          <Card className="anim-fade-up p-4 shadow-brand sm:p-5">
            <h2 className="mb-2 text-sm font-bold text-foreground">{t('feeBreakdown')}</h2>
            <DetailRow label={t('amount')} value={formatBDT(tx.amount)} mono />
            <DetailRow label={t('charge')} value={formatBDT(tx.charge)} mono />
            <DetailRow label={t('discount')} value={formatBDT(tx.discount)} mono />
            {tx.netAmount != null && <DetailRow label={t('net')} value={formatBDT(tx.netAmount)} mono />}
            {!feePresent && <p className="pt-2 text-xs text-muted-foreground">{t('notLinked')}</p>}
          </Card>

          {/* Linked entity */}
          <Card className="anim-fade-up p-4 shadow-brand sm:p-5">
            <h2 className="mb-2 text-sm font-bold text-foreground">{t('linkedTo')}</h2>
            {tx.checkout && (
              <DetailRow
                label={t('linkedCheckout')}
                value={
                  <span className="inline-flex items-center gap-2">
                    <span className="font-mono">{tx.checkout.token}</span>
                    <Link href={`/pay/${tx.checkout.token}`} className="press inline-flex items-center gap-1 text-primary hover:underline">
                      {t('publicPage')} <ExternalLink className="h-3 w-3" />
                    </Link>
                    <Link href="/admin/checkouts" className="text-primary hover:underline">{t('viewDetails')}</Link>
                  </span>
                }
                mono
              />
            )}
            {tx.link && (
              <DetailRow
                label={t('linkedLink')}
                value={
                  <span className="inline-flex items-center gap-2">
                    <span>{tx.link.title}</span>
                    <Link href={`/link/${tx.link.slug}`} className="press inline-flex items-center gap-1 text-primary hover:underline">
                      /link/{tx.link.slug} <ExternalLink className="h-3 w-3" />
                    </Link>
                  </span>
                }
              />
            )}
            {tx.invoice && (
              <DetailRow
                label={t('linkedInvoice')}
                value={
                  <span className="inline-flex items-center gap-2">
                    <span className="font-mono">{tx.invoice.number}</span>
                    <Link href={`/invoice/${tx.invoice.token}`} className="press inline-flex items-center gap-1 text-primary hover:underline">
                      {t('publicPage')} <ExternalLink className="h-3 w-3" />
                    </Link>
                    <Link href="/admin/invoices" className="inline-flex items-center gap-1 text-primary hover:underline">
                      <ReceiptText className="h-3 w-3" /> {t('viewDetails')}
                    </Link>
                  </span>
                }
                mono
              />
            )}
            {tx.customer && (
              <DetailRow
                label={t('customerCol')}
                value={
                  <span className="inline-flex items-center gap-2">
                    <UserRound className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{tx.customer.name}{tx.customer.phone ? ` · ${tx.customer.phone}` : ''}</span>
                    <Link href="/admin/customers" className="text-primary hover:underline">{t('viewDetails')}</Link>
                  </span>
                }
              />
            )}
            {!tx.checkout && !tx.link && !tx.invoice && !tx.customer && (
              <p className="pt-1 text-xs text-muted-foreground">{t('notLinked')}</p>
            )}
          </Card>
        </div>
      </div>

      {/* Raw SMS */}
      <Card className="anim-fade-up p-4 shadow-brand sm:p-5">
        <div className="mb-2 flex items-center gap-2">
          <MessageSquareText className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-bold text-foreground">{t('rawSms')}</h2>
        </div>
        {hasSms && tx.rawSms ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="rounded bg-muted px-1.5 py-0.5 font-semibold text-foreground/80">{tx.rawSms.sender}</span>
              <span>{t('receivedAt')}: {formatDateTime(tx.rawSms.receivedAt)}</span>
            </div>
            <pre className={cn(
              'nice-scroll max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-xl border bg-muted/40 p-3.5',
              'font-mono text-xs leading-relaxed text-foreground/90'
            )}>
              {tx.rawSms.body}
            </pre>
          </div>
        ) : (
          <p className="pt-1 text-xs text-muted-foreground">{t('notLinked')}</p>
        )}
      </Card>

      {/* Match dialog */}
      <Dialog open={matchOpen} onOpenChange={setMatchOpen}>
        <DialogContent className="nice-scroll max-h-[92vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('matchToCheckout')}</DialogTitle>
            <DialogDescription>{t('matchDialogDesc')}</DialogDescription>
          </DialogHeader>
          {checkoutsLoading ? (
            <div className="space-y-2 py-2">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
              <p className="text-center text-xs text-muted-foreground">{t('openCheckoutsLoading')}</p>
            </div>
          ) : !checkouts || checkouts.length === 0 ? (
            <div className="py-4">
              <EmptyState icon={<Inbox className="h-6 w-6" />} title={t('noOpenCheckouts')} hint={t('createCheckoutFirst')} />
            </div>
          ) : (
            <div className="nice-scroll max-h-72 space-y-2 overflow-y-auto pr-1">
              {checkouts.map((c) => (
                <Label
                  key={c.id}
                  htmlFor={`dck-${c.id}`}
                  className={cn(
                    'press flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors',
                    pickedCheckout === c.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                  )}
                >
                  <input
                    id={`dck-${c.id}`}
                    type="radio"
                    name="detail-checkout"
                    className="accent-[hsl(var(--primary))]"
                    checked={pickedCheckout === c.id}
                    onChange={() => setPickedCheckout(c.id)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-foreground">{c.title}</span>
                    <span className="block truncate font-mono text-[11px] text-muted-foreground">{c.token}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="tabular block text-sm font-bold text-foreground">{formatBDT(c.amount)}</span>
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{c.status}</span>
                  </span>
                </Label>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setMatchOpen(false)}>{t('cancel')}</Button>
            <Button
              className="press"
              disabled={!pickedCheckout || busy}
              onClick={() => patch({ action: 'match', checkoutId: pickedCheckout }, t('matchDone'))}
            >
              {t('applyMatch')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reverse confirm */}
      <AlertDialog open={reverseOpen} onOpenChange={setReverseOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('reversedTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('reversedDesc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="press bg-warning text-warning-foreground hover:bg-warning/90"
              disabled={busy}
              onClick={(e) => { e.preventDefault(); patch({ action: 'reverse' }, t('reverseDone')) }}
            >
              {t('reverse')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirm */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteTxTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('bulkDeleteConfirm').replace('{n}', '1')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="press bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={busy}
              onClick={(e) => { e.preventDefault(); doDelete() }}
            >
              {t('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}