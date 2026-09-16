'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'
import { Store as StoreIcon, Send } from 'lucide-react'
import { formatDateTime } from '@/lib/format'
import { fetchApi } from '@/lib/api-client'
import { CopyButton, StatusBadge, EmptyState } from './ui-bits'
import { useLang } from '@/lib/i18n'

interface Delivery {
  id: string
  event: string
  status: string
  httpCode: number | null
  error: string | null
  createdAt: string
}

interface StoreItem {
  id: string
  name: string
  apiKey: string
  webhookUrl: string | null
  secret: string
  active: boolean
  webhookDeliveries?: Delivery[]
}

export function StoresView() {
  const { t } = useLang()
  const { toast } = useToast()
  const [items, setItems] = useState<StoreItem[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [webhookUrl, setWebhookUrl] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchApi<{ items?: StoreItem[] }>('/api/admin/stores')
      setItems(Array.isArray(data.items) ? data.items : [])
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function create() {
    setBusy(true)
    try {
      await fetchApi('/api/admin/stores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, webhookUrl: webhookUrl || undefined }),
      })
      setOpen(false)
      setName('')
      setWebhookUrl('')
      load()
    } catch (e) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'Failed', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    try {
      await fetchApi(`/api/admin/stores/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    } catch (e) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'Failed', variant: 'destructive' })
    }
    load()
  }

  async function testWebhook(id: string) {
    try {
      const data = await fetchApi<{ deliveries?: Array<{ status: string; httpCode: number | null; error: string | null }> }>(`/api/admin/stores/${id}/test`, { method: 'POST' })
      const latest = data.deliveries?.[0]
      toast({
        title: t('testWebhook'),
        description: latest?.status === 'SUCCESS' ? `✔ ${latest.httpCode ?? 200}` : `✖ ${latest?.error ?? 'Failed'}`,
        variant: latest?.status === 'SUCCESS' ? 'default' : 'destructive',
      })
    } catch (e) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'Failed', variant: 'destructive' })
    }
    load()
  }

  const echoUrl = typeof window !== 'undefined' ? `${window.location.origin}/api/dev/webhook-echo` : '/api/dev/webhook-echo'

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{items.length} {t('storesApi').toLowerCase()}</p>
        <Button onClick={() => setOpen(true)} className="bg-blue-600 hover:bg-blue-700">
          <StoreIcon className="mr-1.5 h-4 w-4" /> {t('newStore')}
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}</div>
      ) : items.length === 0 ? (
        <Card className="border-slate-200 shadow-sm">
          <CardContent>
            <EmptyState icon={<StoreIcon className="h-10 w-10" />} title={t('noData')} />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {items.map((s) => (
            <Card key={s.id} className="border-slate-200 shadow-sm">
              <CardContent className="space-y-4 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="rounded-lg bg-blue-50 p-2 text-blue-600"><StoreIcon className="h-4.5 w-4.5" /></div>
                    <p className="font-semibold text-slate-900">{s.name}</p>
                    <Switch checked={s.active} onCheckedChange={(v) => patch(s.id, { active: v })} aria-label={t('active')} />
                  </div>
                  <Button size="sm" variant="outline" onClick={() => testWebhook(s.id)} className="gap-1.5">
                    <Send className="h-3.5 w-3.5" /> {t('testWebhook')}
                  </Button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-400">{t('apiKey')}</Label>
                    <div className="flex items-center gap-2">
                      <code className="min-w-0 flex-1 truncate rounded-md bg-slate-50 px-2.5 py-2 font-mono text-xs text-slate-700">{s.apiKey}</code>
                      <CopyButton value={s.apiKey} />
                      <Button size="sm" variant="ghost" onClick={() => patch(s.id, { regenerateKey: true })}>{t('regenerateKey')}</Button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-400">{t('webhookSecret')}</Label>
                    <div className="flex items-center gap-2">
                      <code className="min-w-0 flex-1 truncate rounded-md bg-slate-50 px-2.5 py-2 font-mono text-xs text-slate-700">{s.secret}</code>
                      <CopyButton value={s.secret} />
                      <Button size="sm" variant="ghost" onClick={() => patch(s.id, { regenerateSecret: true })}>{t('regenerateKey')}</Button>
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-slate-400">{t('webhookUrl')}</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      defaultValue={s.webhookUrl ?? ''}
                      placeholder={echoUrl}
                      className="h-9 font-mono text-xs"
                      onBlur={(e) => {
                        if (e.target.value !== (s.webhookUrl ?? '')) patch(s.id, { webhookUrl: e.target.value })
                      }}
                    />
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Signed with HMAC-SHA256 header <code className="rounded bg-slate-100 px-1">X-Invokeil-Signature</code>. For a quick local test, paste the echo URL: <code className="rounded bg-slate-100 px-1">{echoUrl}</code>
                  </p>
                </div>

                <div className="space-y-1.5 border-t border-slate-100 pt-3">
                  <Label className="text-xs text-slate-400">{t('deliveries')}</Label>
                  {(s.webhookDeliveries ?? []).length === 0 ? (
                    <p className="text-xs text-slate-400">—</p>
                  ) : (
                    <div className="space-y-1.5">
                      {s.webhookDeliveries!.map((d) => (
                        <div key={d.id} className="flex items-center gap-2 text-xs">
                          <StatusBadge status={d.status} />
                          <span className="font-mono text-slate-500">{d.event}</span>
                          <span className="text-slate-400">{d.httpCode ?? ''} {d.error ?? ''}</span>
                          <span className="ml-auto text-slate-300">{formatDateTime(d.createdAt)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>{t('newStore')}</DialogTitle></DialogHeader>
          <div className="space-y-3.5">
            <div className="space-y-1.5">
              <Label>{t('storeName')} *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="My WooCommerce Shop" autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label>{t('webhookUrl')}</Label>
              <Input value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} placeholder="https://shop.example.com/wc-hook" className="font-mono text-xs" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{t('cancel')}</Button>
            <Button onClick={create} disabled={!name.trim() || busy} className="bg-blue-600 hover:bg-blue-700">{t('create')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
