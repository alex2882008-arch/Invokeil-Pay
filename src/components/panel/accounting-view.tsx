'use client'

import { useCallback, useEffect, useState } from 'react'
import { Calculator, ChevronLeft, ChevronRight, Download } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { fetchApi } from '@/lib/api-client'
import { formatBDT } from '@/lib/format'
import { useUrlState } from '@/hooks/use-url-state'
import { useLang } from '@/lib/i18n'
import { ACC_EN, ACC_BN } from '@/lib/i18n/accounting'
import { MfsBadge, PageHeader, StatCard, EmptyState, ErrorCard } from './ui-bits'

// ── Types ────────────────────────────────────────────────────────────────────

interface AccSummary {
  revenue: number
  fees: number
  refunds: number
  net: number
  vat: number
  vatRate: number
  trxCount: number
  refundCount: number
}

interface DailyRow {
  day: string
  count: number
  gross: number
  fees: number
  refunds: number
  net: number
}

interface GatewayRow {
  mfs: string
  count: number
  gross: number
  fees: number
  net: number
}

interface AccData {
  month: string
  summary: AccSummary
  daily: DailyRow[]
  byGateway: GatewayRow[]
}

function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function shiftMonth(m: string, delta: number): string {
  const [y, mo] = m.split('-').map(Number)
  const d = new Date(y, mo - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// ── View ─────────────────────────────────────────────────────────────────────

export function AccountingView() {
  const { t, lang } = useLang()
  const tt = useCallback((k: string) => (lang === 'bn' ? ACC_BN[k] : ACC_EN[k]) ?? t(k), [lang, t])
  const { get, set } = useUrlState()

  const month = /^\d{4}-\d{2}$/.test(get('month')) ? (get('month') as string) : currentMonth()
  const [data, setData] = useState<AccData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const d = await fetchApi<AccData>(`/api/admin/accounting?month=${encodeURIComponent(month)}`)
      setData(d)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [month])

  useEffect(() => { void load() }, [load])

  const s = data?.summary
  const maxGross = data?.daily.length ? Math.max(...data.daily.map((r) => r.gross), 1) : 1

  return (
    <div>
      <PageHeader
        title={tt('accTitle')}
        description={tt('accSubtitle')}
        icon={<Calculator className="h-5 w-5" />}
        actions={
          <a
            href={`/api/admin/accounting/export?month=${encodeURIComponent(month)}`}
            download
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 press"
          >
            <Download className="h-4 w-4" /> {tt('accExport')}
          </a>
        }
      />

      {/* Month navigation */}
      <div className="mb-4 flex items-center gap-2">
        <Button variant="outline" size="sm" className="press h-9 w-9 p-0" aria-label={tt('accPrevMonth')} onClick={() => set({ month: shiftMonth(month, -1) })}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Input
          type="month"
          value={month}
          max={currentMonth()}
          onChange={(e) => { if (/^\d{4}-\d{2}$/.test(e.target.value)) set({ month: e.target.value }) }}
          className="h-9 w-40"
          aria-label={tt('accMonth')}
        />
        <Button
          variant="outline"
          size="sm"
          className="press h-9 w-9 p-0"
          aria-label={tt('accNextMonth')}
          disabled={month >= currentMonth()}
          onClick={() => set({ month: shiftMonth(month, 1) })}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        {s && (
          <p className="ml-2 text-xs text-muted-foreground">
            {s.trxCount} {tt('accTrxCount')} · {s.refundCount} {tt('accStatRefunds').toLowerCase()}
          </p>
        )}
      </div>

      {error ? (
        <ErrorCard message={error} onRetry={() => void load()} />
      ) : (
        <>
          {/* P&L cards */}
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatCard label={tt('accStatGross')} value={formatBDT(s?.revenue ?? 0)} deltaLabel={tt('accGrossHint')} loading={loading} />
            <StatCard label={tt('accStatFees')} value={formatBDT(s?.fees ?? 0)} tone="text-warning bg-warning/10" deltaLabel={tt('accFeesHint')} loading={loading} />
            <StatCard label={tt('accStatRefunds')} value={formatBDT(s?.refunds ?? 0)} tone="text-destructive bg-destructive/10" deltaLabel={tt('accRefundsHint')} loading={loading} />
            <StatCard label={tt('accStatNet')} value={formatBDT(s?.net ?? 0)} tone="text-success bg-success/10" deltaLabel={tt('accNetHint')} loading={loading} />
            <StatCard
              label={tt('accStatVat')}
              value={formatBDT(s?.vat ?? 0)}
              tone="text-primary bg-primary/10"
              deltaLabel={s ? `${tt('accVatRateSuffix')} ${s.vatRate}%` : tt('accVatHint')}
              loading={loading}
            />
          </div>

          {loading ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <Skeleton className="h-72 w-full" />
              <Skeleton className="h-72 w-full" />
            </div>
          ) : !data || (data.daily.length === 0 && data.byGateway.length === 0) ? (
            <Card className="p-4">
              <EmptyState icon={<Calculator className="h-7 w-7" />} title={tt('accNoData')} hint={tt('accNoDataHint')} />
            </Card>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {/* Daily table */}
              <Card className="p-4">
                <h2 className="text-sm font-bold text-foreground">{tt('accDaily')}</h2>
                <p className="mb-3 text-xs text-muted-foreground">{tt('accDailyHint')}</p>
                <div className="max-h-96 overflow-y-auto nice-scroll">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-card">
                      <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-2 py-2 font-semibold">{tt('accColDay')}</th>
                        <th className="px-2 py-2 text-right font-semibold">{tt('accColCount')}</th>
                        <th className="px-2 py-2 text-right font-semibold">{tt('accColGross')}</th>
                        <th className="px-2 py-2 text-right font-semibold">{tt('accColFees')}</th>
                        <th className="px-2 py-2 text-right font-semibold">{tt('accColRefunds')}</th>
                        <th className="px-2 py-2 text-right font-semibold">{tt('accColNet')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.daily.map((r) => (
                        <tr key={r.day} className="border-b last:border-0 hover:bg-muted/40">
                          <td className="px-2 py-2">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs">{r.day.slice(8)}</span>
                              <span className="hidden rounded-full bg-primary/10 text-[10px] font-bold text-primary sm:inline">
                                {r.day}
                              </span>
                            </div>
                          </td>
                          <td className="px-2 py-2 text-right text-xs tabular text-muted-foreground">{r.count}</td>
                          <td className="px-2 py-2 text-right text-xs tabular">{formatBDT(r.gross, false)}</td>
                          <td className="px-2 py-2 text-right text-xs tabular text-muted-foreground">{formatBDT(r.fees, false)}</td>
                          <td className={`px-2 py-2 text-right text-xs tabular ${r.refunds > 0 ? 'font-semibold text-destructive' : 'text-muted-foreground'}`}>{r.refunds > 0 ? formatBDT(r.refunds, false) : '—'}</td>
                          <td className="px-2 py-2 text-right text-xs font-bold tabular">{formatBDT(r.net, false)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* mini bars */}
                <div className="mt-3 flex h-10 items-end gap-1">
                  {data.daily.map((r) => (
                    <div
                      key={r.day}
                      className="flex-1 rounded-t bg-primary/70 transition-all hover:bg-primary"
                      style={{ height: `${Math.max(6, (r.gross / maxGross) * 100)}%` }}
                      title={`${r.day}: ${formatBDT(r.gross)}`}
                    />
                  ))}
                </div>
              </Card>

              {/* By gateway */}
              <Card className="p-4">
                <h2 className="text-sm font-bold text-foreground">{tt('accByGateway')}</h2>
                <p className="mb-3 text-xs text-muted-foreground">{tt('accByGatewayHint')}</p>
                <div className="max-h-96 overflow-y-auto nice-scroll">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-card">
                      <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-2 py-2 font-semibold">{tt('accColGateway')}</th>
                        <th className="px-2 py-2 text-right font-semibold">{tt('accColCount')}</th>
                        <th className="px-2 py-2 text-right font-semibold">{tt('accColGross')}</th>
                        <th className="px-2 py-2 text-right font-semibold">{tt('accColFees')}</th>
                        <th className="px-2 py-2 text-right font-semibold">{tt('accColNet')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.byGateway.map((g) => (
                        <tr key={g.mfs} className="border-b last:border-0 hover:bg-muted/40">
                          <td className="px-2 py-2.5"><MfsBadge mfs={g.mfs} /></td>
                          <td className="px-2 py-2.5 text-right text-xs tabular text-muted-foreground">{g.count}</td>
                          <td className="px-2 py-2.5 text-right text-xs tabular">{formatBDT(g.gross, false)}</td>
                          <td className="px-2 py-2.5 text-right text-xs tabular text-muted-foreground">{formatBDT(g.fees, false)}</td>
                          <td className="px-2 py-2.5 text-right text-xs font-bold tabular">{formatBDT(g.net, false)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Month totals strip */}
                {s && (
                  <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg border bg-muted/30 p-3 text-xs sm:grid-cols-4">
                    <div>
                      <p className="text-muted-foreground">{tt('accStatGross')}</p>
                      <p className="mt-0.5 font-bold tabular">{formatBDT(s.revenue)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">{tt('accStatFees')}</p>
                      <p className="mt-0.5 font-bold tabular">{formatBDT(s.fees)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">{tt('accStatRefunds')}</p>
                      <p className="mt-0.5 font-bold tabular text-destructive">{formatBDT(s.refunds)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">{tt('accStatNet')}</p>
                      <p className="mt-0.5 font-bold tabular text-success">{formatBDT(s.net)}</p>
                    </div>
                  </div>
                )}
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  )
}
