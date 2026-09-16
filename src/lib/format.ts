/** Shared client-safe formatting helpers */

export const MFS_META: Record<string, { label: string; color: string; bg: string }> = {
  BKASH: { label: 'bKash', color: '#E2136E', bg: 'rgba(226,19,110,0.10)' },
  NAGAD: { label: 'Nagad', color: '#F6921E', bg: 'rgba(246,146,30,0.12)' },
  ROCKET: { label: 'Rocket', color: '#8C3494', bg: 'rgba(140,52,148,0.10)' },
  UPAY: { label: 'Upay', color: '#00A99D', bg: 'rgba(0,169,157,0.10)' },
  BANK: { label: 'Bank', color: '#475569', bg: 'rgba(71,85,105,0.10)' },
  OTHER: { label: 'Other', color: '#64748B', bg: 'rgba(100,116,139,0.10)' },
  ANY: { label: 'Any', color: '#2563EB', bg: 'rgba(37,99,235,0.10)' },
}

export const STATUS_META: Record<string, { tone: 'success' | 'warning' | 'destructive' | 'secondary' | 'info' }> = {
  PAID: { tone: 'success' },
  MATCHED: { tone: 'info' },
  UNMATCHED: { tone: 'warning' },
  REVERSED: { tone: 'destructive' },
  PENDING: { tone: 'secondary' },
  AWAITING: { tone: 'warning' },
  CANCELLED: { tone: 'destructive' },
  EXPIRED: { tone: 'secondary' },
  ONLINE: { tone: 'success' },
  OFFLINE: { tone: 'secondary' },
  BLOCKED: { tone: 'destructive' },
  SUCCESS: { tone: 'success' },
  FAILED: { tone: 'destructive' },
}

export function formatBDT(n: number, withSymbol = true): string {
  const formatted = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
  return withSymbol ? `৳ ${formatted}` : formatted
}

export function formatDateTime(d: string | Date | null | undefined): string {
  if (d === null || d === undefined || d === '') return '—'
  const date = typeof d === 'string' ? new Date(d) : d
  if (isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    hour12: true,
  }).format(date)
}

export function timeAgo(d: string | Date | null | undefined): string {
  if (!d) return '—'
  const date = typeof d === 'string' ? new Date(d) : d
  if (isNaN(date.getTime())) return '—'
  const s = Math.floor((Date.now() - date.getTime()) / 1000)
  if (s < 5) return 'just now'
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export function maskNumber(n?: string | null): string {
  if (!n) return '—'
  if (n.length < 6) return n
  return `${n.slice(0, 5)}****${n.slice(-3)}`
}
