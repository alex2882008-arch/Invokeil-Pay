/**
 * Subscription billing-interval math (shared by the subscriptions routes).
 * Calendar-aware: adding 1 month to Jan 31 → Feb 28/29 (JS Date clamps).
 */
export function addInterval(from: Date, interval: string): Date {
  const d = new Date(from)
  switch (interval) {
    case 'WEEKLY': d.setDate(d.getDate() + 7); break
    case 'QUARTERLY': d.setMonth(d.getMonth() + 3); break
    case 'YEARLY': d.setFullYear(d.getFullYear() + 1); break
    case 'MONTHLY':
    default: d.setMonth(d.getMonth() + 1); break
  }
  return d
}

/** Monthly-normalized amount for MRR (WEEKLY ≈ ×52/12, QUARTERLY ÷3, YEARLY ÷12). */
export function monthlyNormalized(amount: number, interval: string): number {
  switch (interval) {
    case 'WEEKLY': return (amount * 52) / 12
    case 'QUARTERLY': return amount / 3
    case 'YEARLY': return amount / 12
    default: return amount
  }
}
