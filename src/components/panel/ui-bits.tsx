'use client'

import { useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Check, Copy, AlertTriangle, RefreshCw, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { MFS_META, STATUS_META } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useUrlState } from '@/hooks/use-url-state'

export function MfsBadge({ mfs, className }: { mfs: string; className?: string }) {
  const meta = MFS_META[mfs] ?? MFS_META.OTHER
  return (
    <span
      className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold', className)}
      style={{ color: meta.color, backgroundColor: meta.bg }}
    >
      {meta.label}
    </span>
  )
}

const TONE_MAP: Record<string, string> = {
  success: 'bg-success/10 text-success border-success/20',
  warning: 'bg-warning/15 text-amber-700 dark:text-amber-400 border-warning/30',
  destructive: 'bg-destructive/10 text-destructive border-destructive/25',
  secondary: 'bg-muted text-muted-foreground border-border',
  info: 'bg-primary/10 text-primary border-primary/25',
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const tone = STATUS_META[status]?.tone ?? 'secondary'
  const label = status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, ' ')
  return (
    <Badge variant="outline" className={cn('font-medium', TONE_MAP[tone], className)}>
      {label}
    </Badge>
  )
}

export function ToneDot({ status, className }: { status: string; className?: string }) {
  const color =
    STATUS_META[status]?.tone === 'success' ? 'bg-success'
    : STATUS_META[status]?.tone === 'destructive' ? 'bg-destructive'
    : STATUS_META[status]?.tone === 'warning' ? 'bg-warning'
    : 'bg-muted-foreground/50'
  return <span className={cn('inline-block h-2 w-2 rounded-full', color, status === 'ONLINE' && 'live-dot', className)} />
}

export async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = value
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      return true
    } catch {
      return false
    }
  }
}

export function CopyButton({ value, label, compact, className }: { value: string; label?: string; compact?: boolean; className?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn('press gap-1.5', compact ? 'h-7 px-2 text-xs' : 'h-8', className)}
      onClick={async () => {
        await copyText(value)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
      {label ?? (copied ? 'Copied!' : 'Copy')}
    </Button>
  )
}

export function BrandLogo({ size = 40, wordmark = true, brand = 'Invokeil Pay' }: { size?: number; wordmark?: boolean; brand?: string }) {
  const parts = brand.trim().split(' ')
  const first = parts.length <= 1 ? brand : parts.slice(0, -1).join(' ')
  const rest = parts.length <= 1 ? '' : ` ${parts[parts.length - 1]}`
  return (
    <span className="inline-flex select-none items-center gap-2.5">
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
        <rect width="48" height="48" rx="12" fill="#2563EB" />
        <path d="M15 24h14M22 17l7 7-7 7" stroke="white" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {wordmark && (
        <span className="text-[1.3rem] font-bold tracking-tight text-foreground">
          {first}<span className="text-primary">{rest}</span>
        </span>
      )}
    </span>
  )
}

export function EmptyState({
  icon, title, hint, action,
}: {
  icon?: React.ReactNode
  title: string
  hint?: string
  action?: React.ReactNode
}) {
  return (
    <div className="anim-fade-in flex flex-col items-center justify-center gap-2.5 py-14 text-center">
      {icon && (
        <div className="rounded-2xl bg-muted p-3.5 text-muted-foreground/60">
          {icon}
        </div>
      )}
      <p className="text-sm font-semibold text-foreground/80">{title}</p>
      {hint && <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function PageHeader({
  title, description, icon, actions,
}: {
  title: string
  description?: string
  icon?: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <div className="anim-fade-up mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        {icon && (
          <div className="rounded-xl bg-primary/10 p-2.5 text-primary">{icon}</div>
        )}
        <div className="min-w-0">
          <h1 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">{title}</h1>
          {description && <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function ErrorCard({ message, onRetry }: { message?: string; onRetry: () => void }) {
  return (
    <div className="anim-fade-in flex flex-col items-center gap-3 rounded-xl border border-warning/30 bg-warning/5 py-12 text-center">
      <AlertTriangle className="h-9 w-9 text-amber-500" />
      <p className="text-sm font-semibold text-foreground/80">Failed to load</p>
      {message && <p className="max-w-sm text-xs text-muted-foreground">{message}</p>}
      <Button size="sm" variant="outline" onClick={onRetry} className="press gap-1.5">
        <RefreshCw className="h-3.5 w-3.5" /> Retry
      </Button>
    </div>
  )
}

/** Sparkline: pure-SVG, no chart lib — cheap for stat cards. */
export function MiniSparkline({ data, color = '#2563EB', width = 120, height = 34 }: { data: number[]; color?: string; width?: number; height?: number }) {
  const gid = useMemo(() => `sg${Math.random().toString(36).slice(2, 8)}`, [])
  const path = useMemo(() => {
    if (!data || data.length < 2) return null
    const max = Math.max(...data, 1)
    const min = Math.min(...data, 0)
    const range = max - min || 1
    const step = width / (data.length - 1)
    const pts = data.map((v, i) => [i * step, height - 3 - ((v - min) / range) * (height - 8)] as const)
    const d = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
    const area = `${d} L${width},${height} L0,${height} Z`
    return { d, area }
  }, [data, width, height])
  if (!path) return <div style={{ width, height }} />
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" className="overflow-visible">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.28} />
          <stop offset="100%" stopColor={color} stopOpacity={0.02} />
        </linearGradient>
      </defs>
      <path d={path.area} fill={`url(#${gid})`} />
      <path d={path.d} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function StatCard({
  label, value, icon, tone = 'text-primary bg-primary/10', delta, deltaLabel, spark, sparkColor, loading,
}: {
  label: string
  value: string
  icon?: React.ReactNode
  tone?: string
  delta?: number | null
  deltaLabel?: string
  spark?: number[]
  sparkColor?: string
  loading?: boolean
}) {
  if (loading) {
    return (
      <div className="rounded-xl border bg-card p-5 shadow-brand">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-3 h-7 w-32" />
        <Skeleton className="mt-3 h-6 w-full" />
      </div>
    )
  }
  return (
    <div className="hover-lift rounded-xl border bg-card p-5 shadow-brand">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="tabular mt-1 truncate text-2xl font-bold text-foreground">{value}</p>
        </div>
        {icon && <div className={cn('rounded-lg p-2.5', tone)}>{icon}</div>}
      </div>
      <div className="mt-3 flex items-end justify-between gap-2">
        <div className="flex items-baseline gap-1.5">
          {delta != null && (
            <span className={cn('text-xs font-bold', delta >= 0 ? 'text-success' : 'text-destructive')}>
              {delta >= 0 ? '↑' : '↓'} {Math.abs(delta).toFixed(0)}%
            </span>
          )}
          {deltaLabel && <span className="truncate text-[11px] text-muted-foreground">{deltaLabel}</span>}
        </div>
        {spark && spark.length > 1 && <MiniSparkline data={spark} color={sparkColor ?? '#2563EB'} width={96} height={30} />}
      </div>
    </div>
  )
}

export function SearchInput({ paramKey = 'q', placeholder, className }: { paramKey?: string; placeholder?: string; className?: string }) {
  const { get, set } = useUrlState()
  const urlValue = get(paramKey)
  const [local, setLocal] = useState(urlValue)
  useEffect(() => {
    // Sync when the URL changes externally (pagination reset, clear filters)
    const id = window.setTimeout(() => setLocal(urlValue), 0)
    return () => window.clearTimeout(id)
  }, [urlValue])
  return (
    <form
      className={cn('relative', className)}
      onSubmit={(e) => {
        e.preventDefault()
        set({ [paramKey]: local, page: 1 })
      }}
    >
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder={placeholder ?? 'Search…'}
        className="h-9 pl-9"
        aria-label="Search"
      />
    </form>
  )
}

export function Pagination({ page, pages, total }: { page: number; pages: number; total: number }) {
  const { set } = useUrlState()
  if (pages <= 1) return total > 0 ? <p className="py-3 text-center text-xs text-muted-foreground">{total} result{total === 1 ? '' : 's'}</p> : null
  return (
    <div className="flex items-center justify-between gap-2 py-3">
      <p className="text-xs text-muted-foreground">
        Page <span className="font-semibold text-foreground">{page}</span> of {pages} · {total} results
      </p>
      <div className="flex items-center gap-1.5">
        <Button variant="outline" size="sm" className="press h-8 gap-1" disabled={page <= 1} onClick={() => set({ page: page - 1 })}>
          <ChevronLeft className="h-3.5 w-3.5" /> Prev
        </Button>
        <Button variant="outline" size="sm" className="press h-8 gap-1" disabled={page >= pages} onClick={() => set({ page: page + 1 })}>
          Next <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

export function DetailRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b py-2 last:border-0">
      <span className="shrink-0 text-xs font-medium text-muted-foreground">{label}</span>
      <span className={cn('break-all text-right text-xs font-semibold text-foreground', mono && 'font-mono')}>{value}</span>
    </div>
  )
}

export function LiveBadge({ online }: { online: boolean }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold',
      online ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'
    )}>
      <span className={cn('h-1.5 w-1.5 rounded-full', online ? 'live-dot bg-success' : 'bg-muted-foreground/50')} />
      {online ? 'LIVE' : 'PAUSED'}
    </span>
  )
}
