/**
 * Provider credential vault — AES-256-GCM encryption for provider configs.
 * Secrets are NEVER returned in plain text through APIs; only masked previews.
 */
import crypto from 'crypto'

const KEY_SOURCE = process.env.APP_SECRET || process.env.NEXTAUTH_SECRET || 'invokeil-pay-local-vault-v3'

function vaultKey(): Buffer {
  return crypto.createHash('sha256').update(`ilp-vault:${KEY_SOURCE}`).digest()
}

export function encryptJson(data: Record<string, unknown>): string {
  try {
    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv('aes-256-gcm', vaultKey(), iv)
    const plain = Buffer.from(JSON.stringify(data), 'utf8')
    const enc = Buffer.concat([cipher.update(plain), cipher.final()])
    const tag = cipher.getAuthTag()
    return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`
  } catch {
    return '{}'
  }
}

export function decryptJson(payload: string | null | undefined): Record<string, unknown> {
  if (!payload) return {}
  try {
    if (payload.startsWith('{')) return JSON.parse(payload) // legacy plain JSON
    const [ver, ivB64, tagB64, dataB64] = payload.split(':')
    if (ver !== 'v1' || !ivB64 || !tagB64 || !dataB64) return {}
    const decipher = crypto.createDecipheriv('aes-256-gcm', vaultKey(), Buffer.from(ivB64, 'base64'))
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
    const dec = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()])
    return JSON.parse(dec.toString('utf8'))
  } catch {
    return {}
  }
}

/** Fields that must be masked when exposing config through APIs. */
const SECRET_FIELDS = /key|token|secret|password|pass|sid|auth/i

export function maskConfig(configJson: string): Record<string, string> {
  const cfg = decryptJson(configJson)
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(cfg)) {
    const s = String(v ?? '')
    if (SECRET_FIELDS.test(k) && s.length > 0) {
      out[k] = s.length <= 8 ? '••••••' : `${s.slice(0, 4)}••••${s.slice(-4)}`
    } else {
      out[k] = s
    }
  }
  return out
}

/** True when a config has every required field filled (values may be encrypted). */
export function configHasFields(configJson: string, required: string[]): boolean {
  const cfg = decryptJson(configJson)
  return required.every((f) => {
    const v = cfg[f]
    return typeof v === 'string' ? v.trim().length > 0 : v != null
  })
}
