// ── Charge engine: fixed + percentage charges & discounts per gateway ───────

export interface ChargeResult {
  amount: number
  charge: number
  discount: number
  net: number // amount + charge - discount (what the customer pays)
  merchantReceives: number // amount - discount (what lands on the MFS number)
}

export function computeCharges(
  amount: number,
  gw?: { chargeFixed?: number | null; chargePercent?: number | null; discountFixed?: number | null; discountPercent?: number | null } | null
): ChargeResult {
  const amt = Number.isFinite(amount) ? amount : 0
  const charge = round2((gw?.chargeFixed ?? 0) + (amt * (gw?.chargePercent ?? 0)) / 100)
  const discount = round2((gw?.discountFixed ?? 0) + (amt * (gw?.discountPercent ?? 0)) / 100)
  return {
    amount: amt,
    charge,
    discount,
    net: round2(amt + charge - discount),
    merchantReceives: round2(amt - discount),
  }
}

/** Tolerance-aware amount comparison (PipraPay-style payment tolerance). */
export function withinTolerance(expected: number, received: number, tolerance: number): boolean {
  return received >= expected - tolerance
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
