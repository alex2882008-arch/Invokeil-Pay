// ── SMS provider metadata shared by admin routes ────────────────────
export const PROVIDER_TYPES = ['TWILIO', 'TELNYX', 'PLIVO', 'TEXTBEE', 'AWS_SNS', 'CUSTOM'] as const
export type ProviderType = (typeof PROVIDER_TYPES)[number]

/** Fields that must be filled before a provider is considered ready. */
export const REQUIRED_FIELDS: Record<ProviderType, string[]> = {
  TWILIO: ['accountSid', 'authToken', 'from'],
  TELNYX: ['apiKey', 'from'],
  PLIVO: ['authId', 'authToken', 'from'],
  TEXTBEE: ['deviceId', 'apiKey'],
  AWS_SNS: ['accessKey', 'secretKey', 'region'],
  CUSTOM: ['url'],
}

export const DEFAULT_LABELS: Record<ProviderType, string> = {
  TWILIO: 'Twilio',
  TELNYX: 'Telnyx',
  PLIVO: 'Plivo',
  TEXTBEE: 'TextBee.dev',
  AWS_SNS: 'AWS SNS',
  CUSTOM: 'Custom HTTP',
}

export function isProviderType(v: unknown): v is ProviderType {
  return typeof v === 'string' && (PROVIDER_TYPES as readonly string[]).includes(v)
}

/** Only string config fields are accepted; anything else is dropped. */
export function sanitizeConfig(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === 'string' && v.trim() !== '') out[k] = v.trim().slice(0, 500)
    }
  }
  return out
}
