'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { Inbox, Send, WandSparkles } from 'lucide-react'
import { formatDateTime, timeAgo } from '@/lib/format'
import { fetchApi } from '@/lib/api-client'
import { MfsBadge, EmptyState } from './ui-bits'
import { useLang } from '@/lib/i18n'

interface SmsItem {
  id: string
  sender: string
  body: string
  simNumber: string | null
  receivedAt: string
  parsed: boolean
  note: string | null
  device?: { name: string | null } | null
}

const SAMPLES: Array<{ label: string; sender: string; body: string }> = [
  { label: 'bKash received', sender: 'bKash', body: 'You have received Tk 1,500.00 from 01712345678. Ref None. Fee Tk 0.00. Balance Tk 25,430.50. TrxID 8G7A6B5C4D' },
  { label: 'Nagad received', sender: 'NAGAD', body: 'Money Received! Amount: Tk 750.50 Sender: 01898765432 Ref: INV102 Balance: Tk 9,120.75 TrxID: 4NF9K2QW7P' },
  { label: 'Rocket received', sender: '8446', body: 'You have received Tk320.00 from 01812345678. TxnId: 992F1B4477. Balance: Tk3,204.11' },
  { label: 'Upay received', sender: 'UPAY', body: 'You have received Tk 99.00 from 01611223344. Fee Tk 0.00. Balance Tk 1,410.00. TrxID UP99A1B2C3' },
  { label: 'Bank BEFTN', sender: 'BRACBank', body: 'Txn of BDT 12,000.00 credited to A/C **4432 via BEFTN from 01712009988. Ref: FTN229911. Balance: BDT 84,000.00' },
  { label: 'Google Pay', sender: 'CityBank', body: 'You have received BDT 2,499.00 via Google Pay on your A/C **7781. UTR: CBL9X8Y7Z6. Balance BDT 31,200.00' },
  { label: 'bKash (noise)', sender: 'bKash', body: 'You have sent Tk 250.00 to 01811223344. Fee Tk 5.00. Balance Tk 4,320.50. TrxID 9KK11A2B3C' },
]

export function SmsInboxView() {
  const { t } = useLang()
  const { toast } = useToast()
  const [items, setItems] = useState<SmsItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [filter, setFilter] = useState('ALL')
  const [loading, setLoading] = useState(true)

  // Simulator
  const [simOpen, setSimOpen] = useState(false)
  const [simSender, setSimSender] = useState('bKash')
  const [simBody, setSimBody] = useState(SAMPLES[0].body)
  const [simBusy, setSimBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page) })
      if (filter !== 'ALL') params.set('parsed', filter === 'PARSED' ? 'true' : 'false')
      const data = await fetchApi<{ items?: SmsItem[]; total?: number; pageSize?: number }>(`/api/admin/sms?${params}`)
      setItems(Array.isArray(data.items) ? data.items : [])
      setTotal(data.total ?? 0)
      setPages(Math.max(1, Math.ceil((data.total ?? 0) / (data.pageSize ?? 25))))
    } catch {
      setItems([])
      setTotal(0)
      setPages(1)
    } finally {
      setLoading(false)
    }
  }, [page, filter])

  useEffect(() => { load() }, [load])

  async function simulate() {
    setSimBusy(true)
    try {
      // pick first device as the simulated source
      const devs = await fetchApi<{ items?: Array<{ deviceKey: string }> }>('/api/admin/devices')
      const dev = (devs.items ?? [])[0]
      if (!dev) {
        toast({ title: 'No device', description: t('noDevicesYet'), variant: 'destructive' })
        return
      }
      const data = await fetchApi<{ results?: Array<{ matched?: boolean; note?: string }> }>('/api/v1/sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Device-Key': dev.deviceKey },
        body: JSON.stringify({ sender: simSender, body: simBody }),
      })
      toast({
        title: t('simulated'),
        description: data.results?.[0]?.matched ? 'Auto-matched ✔' : data.results?.[0]?.note ?? '',
      })
      load()
    } catch (e) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'Failed', variant: 'destructive' })
    } finally {
      setSimBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Simulator (admin tool to exercise the real pipeline) */}
      <Card className="border-blue-100 bg-blue-50/40 shadow-sm">
        <CardContent className="p-5">
          <button className="flex w-full items-center justify-between gap-2 text-left" onClick={() => setSimOpen((s) => !s)}>
            <span className="flex items-center gap-2 text-sm font-semibold text-blue-800">
              <WandSparkles className="h-4 w-4" /> {t('smsSimulator')}
            </span>
            <span className="text-xs text-blue-500">{simOpen ? '▲' : '▼'}</span>
          </button>
          {simOpen && (
            <div className="mt-4 space-y-3">
              <p className="text-xs text-slate-500">{t('simHint')}</p>
              <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('smsSender')}</Label>
                  <Select value={simSender} onValueChange={setSimSender}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['bKash', 'NAGAD', '8446', 'UPAY', 'BRACBank', 'CityBank', 'GP'].map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('body')}</Label>
                  <Textarea value={simBody} onChange={(e) => setSimBody(e.target.value)} rows={3} className="font-mono text-xs" />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-slate-400">{t('chooseSample')}:</span>
                {SAMPLES.map((s) => (
                  <button
                    key={s.label}
                    type="button"
                    onClick={() => { setSimSender(s.sender); setSimBody(s.body) }}
                    className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:border-blue-300 hover:text-blue-700"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <Button onClick={simulate} disabled={simBusy} className="bg-blue-600 hover:bg-blue-700">
                <Send className="mr-1.5 h-4 w-4" /> {simBusy ? '…' : t('simulate')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <Select value={filter} onValueChange={(v) => { setFilter(v); setPage(1) }}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('all')}: {total || '…'}</SelectItem>
            <SelectItem value="PARSED">{t('parsed')}</SelectItem>
            <SelectItem value="SKIP">{t('notParsed')}</SelectItem>
          </SelectContent>
        </Select>
        <span className="ml-auto text-xs text-slate-400">{total} SMS</span>
      </div>

      <Card className="border-slate-200 shadow-sm">
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-5">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
          ) : items.length === 0 ? (
            <EmptyState icon={<Inbox className="h-10 w-10" />} title={t('noData')} />
          ) : (
            <div className="divide-y divide-slate-50">
              {items.map((s) => (
                <div key={s.id} className="flex gap-3 px-5 py-3.5 transition-colors hover:bg-slate-50/60">
                  <div className="mt-0.5 flex shrink-0 flex-col items-start gap-1.5">
                    <Badge variant="outline" className={s.parsed ? 'border-emerald-200 bg-emerald-50 text-[10px] text-emerald-700' : 'border-slate-200 bg-slate-50 text-[10px] text-slate-500'}>
                      {s.parsed ? t('parsed') : t('notParsed')}
                    </Badge>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-sm font-semibold text-slate-800">{s.sender}</span>
                      <span className="text-[11px] text-slate-400">{s.device?.name ?? '—'} · {s.simNumber ?? ''} · {formatDateTime(s.receivedAt)} ({timeAgo(s.receivedAt)})</span>
                    </div>
                    <p className="mt-0.5 break-words font-mono text-xs leading-relaxed text-slate-600">{s.body}</p>
                    {s.note && <p className="mt-0.5 text-[11px] text-slate-400">{s.note}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>←</Button>
          <span className="text-xs text-slate-500">{page} / {pages}</span>
          <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>→</Button>
        </div>
      )}
    </div>
  )
}
