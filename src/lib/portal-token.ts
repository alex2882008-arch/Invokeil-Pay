import { createHmac, timingSafeEqual } from 'crypto'

/**
 * Deterministic, stateless customer-portal tokens.
 *
 * token = base64url(HMAC-SHA256(secret, `portal:${customerId}`)).slice(0, 32)
 *
 * The token is derived from the customer id, so there is nothing to store —
 * the portal API can resolve a token back to a customer without a lookup
 * table (it iterates customers and recomputes the HMAC; acceptable at the
 * scale of a self-hosted personal gateway).
 */

const SECRET = process.env.APP_SECRET || 'invokeil-pay-portal-v3'

function hmac(customerId: string): string {
  return createHmac('sha256', SECRET).update(`portal:${customerId}`).digest('base64url')
}

/** Deterministic portal token for a customer (32 chars, URL-safe). */
export function portalTokenFor(customerId: string): string {
  return hmac(customerId).slice(0, 32)
}

/** Constant-time verification that `token` is the portal token of `customerId`. */
export function verifyPortalToken(customerId: string, token: string): boolean {
  if (!token || token.length !== 32) return false
  const expected = Buffer.from(portalTokenFor(customerId))
  const given = Buffer.from(token)
  if (expected.length !== given.length) return false
  return timingSafeEqual(expected, given)
}
