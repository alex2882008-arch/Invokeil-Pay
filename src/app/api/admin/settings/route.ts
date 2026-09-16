import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError, logActivity } from '@/lib/auth'
import { getMergedSettings } from '@/lib/settings-defaults'

// ── Admin: Panel settings ────────────────────────────────────────────────────
// GET → { settings } merged with defaults
// PUT { values: Record<string,string> } → upsert whitelisted keys → { settings }
//   (PATCH kept as a legacy alias accepting a flat object or { values })

const EDITABLE_KEYS = [
  'brandName', 'brandTagline', 'brandLogo',
  'supportPhone', 'supportEmail', 'supportWhatsApp', 'supportTelegram',
  'number_bkash', 'number_nagad', 'number_rocket', 'number_upay',
  'number_tap', 'number_telecash', 'number_mcash', 'number_okwallet',
  'bank_hint', 'paymentTolerance', 'checkoutExpiryHours', 'invoiceDueDays',
  'webhookAttemptLimit', 'landingEnabled', 'defaultLanguage',
  'currency', 'currencySymbol',
  'appMode', 'emailFailoverChain', 'smsFailoverChain', 'emailReceiveEnabled',
  'automationEnabled', 'riskEnabled', 'approvalThresholdAmount',
  'merchantPortalEnabled', 'receiptVerifyEnabled', 'refundWindowDays',
  'disputeWindowDays', 'kycRequiredForPayout', 'smsCostPerMessage', 'emailCostPerMessage',
  'dailyDigestEnabled',
] as const

/** Returns a sanitized string or throws 400 for out-of-range numeric settings. */
function sanitize(key: string, raw: unknown): string {
  const value = String(raw ?? '').trim()

  switch (key) {
    case 'paymentTolerance': {
      const n = Number(value)
      if (!Number.isFinite(n) || n < 0) throw new HttpError(400, 'paymentTolerance must be a number ≥ 0')
      return String(n)
    }
    case 'checkoutExpiryHours': {
      const n = Number(value)
      if (!Number.isFinite(n) || n < 1 || n > 720) throw new HttpError(400, 'checkoutExpiryHours must be 1–720')
      return String(Math.round(n))
    }
    case 'invoiceDueDays': {
      const n = Number(value)
      if (!Number.isFinite(n) || n < 1 || n > 365) throw new HttpError(400, 'invoiceDueDays must be 1–365')
      return String(Math.round(n))
    }
    case 'webhookAttemptLimit': {
      const n = Number(value)
      if (!Number.isFinite(n) || n < 1 || n > 10) throw new HttpError(400, 'webhookAttemptLimit must be 1–10')
      return String(Math.round(n))
    }
    case 'landingEnabled':
      return value === 'false' ? 'false' : 'true'
    case 'defaultLanguage':
      return value === 'bn' ? 'bn' : 'en'
    case 'brandName':
      return value.slice(0, 80)
    case 'brandLogo':
      // Logo can be a URL or an inline data-URL (uploaded image) — allow ~300KB.
      if (value.length > 300_000) throw new HttpError(400, 'brandLogo is too large — use an image under 300KB')
      return value
    default:
      return value.slice(0, 500)
  }
}

export async function GET() {
  try {
    await requireRole(['ADMIN', 'AGENT', 'VIEWER'])
    return Response.json({ settings: await getMergedSettings() })
  } catch (err) {
    return jsonError(err)
  }
}

async function saveValues(input: Record<string, unknown>, me: { id: string; name: string }) {
  const ops: Array<{ key: string; value: string }> = []
  for (const [key, raw] of Object.entries(input)) {
    if (!(EDITABLE_KEYS as readonly string[]).includes(key)) continue
    ops.push({ key, value: sanitize(key, raw) })
  }
  if (ops.length === 0) throw new HttpError(400, 'No editable settings supplied')

  for (const op of ops) {
    await db.setting.upsert({
      where: { key: op.key },
      update: { value: op.value },
      create: op,
    })
  }

  await logActivity(me, 'settings.updated', 'settings', {
    keys: ops.map((o) => o.key),
  })

  return getMergedSettings()
}

export async function PUT(req: Request) {
  try {
    const me = await requireRole(['ADMIN'])
    const body = (await req.json().catch(() => null)) as { values?: unknown } | Record<string, unknown> | null
    if (!body || typeof body !== 'object') throw new HttpError(400, 'Invalid JSON body')

    const values =
      'values' in (body as Record<string, unknown>) && typeof (body as { values: unknown }).values === 'object'
        ? ((body as { values: Record<string, unknown> }).values ?? {})
        : (body as Record<string, unknown>)

    const settings = await saveValues(values, me)
    return Response.json({ settings })
  } catch (err) {
    return jsonError(err)
  }
}

/** Legacy alias — same behaviour as PUT. */
export async function PATCH(req: Request) {
  try {
    const me = await requireRole(['ADMIN'])
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || typeof body !== 'object') throw new HttpError(400, 'Invalid JSON body')

    const values =
      'values' in body && typeof body.values === 'object' ? ((body.values as Record<string, unknown>) ?? {}) : body

    const settings = await saveValues(values, me)
    return Response.json({ settings })
  } catch (err) {
    return jsonError(err)
  }
}
