// ── TOTP (RFC 6238) — zero-dependency 2FA ───────────────────────────────────
import { createHmac, randomBytes } from 'crypto'

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function generateTotpSecret(bytes = 20): string {
  const buf = randomBytes(bytes)
  let bits = ''
  for (const b of buf) bits += b.toString(2).padStart(8, '0')
  let out = ''
  for (let i = 0; i + 5 <= bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)]
  return out
}

function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, '')
  let bits = ''
  for (const c of clean) {
    const idx = B32.indexOf(c)
    if (idx < 0) continue
    bits += idx.toString(2).padStart(5, '0')
  }
  const bytes: number[] = []
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2))
  return Buffer.from(bytes)
}

export function totpCode(secret: string, timeStep = 30, offset = 0): string {
  const counter = Math.floor(Date.now() / 1000 / timeStep) + offset
  const buf = Buffer.alloc(8)
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0)
  buf.writeUInt32BE(counter % 2 ** 32, 4)
  const hmac = createHmac('sha1', base32Decode(secret)).update(buf).digest()
  const o = hmac[19] & 0xf
  const code = ((hmac[o] & 0x7f) << 24) | (hmac[o + 1] << 16) | (hmac[o + 2] << 8) | hmac[o + 3]
  return String(code % 1_000_000).padStart(6, '0')
}

/** Verify with ±1 step window for clock drift. */
export function verifyTotp(secret: string, code: string): boolean {
  const c = code.replace(/\D/g, '')
  if (c.length !== 6) return false
  for (const off of [-1, 0, 1]) {
    if (totpCode(secret, 30, off) === c) return true
  }
  return false
}

export function otpAuthUrl(secret: string, email: string, issuer = 'Invokeil Pay'): string {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`
}
