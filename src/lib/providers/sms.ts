/**
 * SMS provider adapters + failover router.
 * Built-in: Twilio, Telnyx, Plivo, TextBee.dev, AWS SNS, Custom HTTP.
 * TextBee is a natural fit for Bangladesh — it turns any Android phone into an SMS gateway.
 */
import { db } from '@/lib/db'
import { getMergedSettings } from '@/lib/settings-defaults'
import { decryptJson } from './vault'
import { snsSendSms } from './sigv4'

export interface SmsPayload {
  to: string
  body: string
  relatedType?: string | null
  relatedId?: string | null
  customerRef?: string | null
  brandId?: string | null
}

export interface SmsAttempt {
  provider: string
  ok: boolean
  detail: string
  ms: number
  simulated?: boolean
}

export interface SmsSendResult {
  ok: boolean
  messageId: string
  provider: string
  status: string
  error?: string
  chain: SmsAttempt[]
  simulated: boolean
}

const TIMEOUT_MS = 15000

function str(cfg: Record<string, unknown>, k: string, fallback = ''): string {
  const v = cfg[k]
  return typeof v === 'string' && v.length > 0 ? v : fallback
}

function normalizeBd(to: string): string {
  // Accept 01XXXXXXXXX / 8801XXXXXXXXX / +8801XXXXXXXXX → +8801XXXXXXXXX for international APIs
  let n = to.replace(/[^\d+]/g, '')
  if (n.startsWith('+')) n = n.slice(1)
  if (n.startsWith('880')) return `+${n}`
  if (n.startsWith('01')) return `+88${n}`
  if (n.startsWith('1') && n.length === 10) return `+1${n}`
  return `+${n}`
}

async function timedFetch(url: string, init: RequestInit): Promise<{ ok: boolean; status: number; body: string }> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) })
  const body = await res.text()
  return { ok: res.ok, status: res.status, body }
}

async function sendWithProvider(type: string, configJson: string, payload: SmsPayload): Promise<string> {
  const cfg = decryptJson(configJson)
  const to = normalizeBd(payload.to)
  switch (type) {
    case 'TWILIO': {
      const sid = str(cfg, 'accountSid')
      const body = new URLSearchParams({ To: to, From: str(cfg, 'from'), Body: payload.body })
      const res = await timedFetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${str(cfg, 'authToken')}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      })
      if (!res.ok) throw new Error(`Twilio ${res.status}: ${res.body.slice(0, 200)}`)
      const j = JSON.parse(res.body) as { sid?: string }
      return j.sid ?? 'twilio-ok'
    }
    case 'TELNYX': {
      const res = await timedFetch('https://api.telnyx.com/v2/messages', {
        method: 'POST',
        headers: { Authorization: `Bearer ${str(cfg, 'apiKey')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: str(cfg, 'from'), to, text: payload.body }),
      })
      if (!res.ok) throw new Error(`Telnyx ${res.status}: ${res.body.slice(0, 200)}`)
      const j = JSON.parse(res.body) as { data?: { id?: string } }
      return j.data?.id ?? 'telnyx-ok'
    }
    case 'PLIVO': {
      const authId = str(cfg, 'authId')
      const res = await timedFetch(`https://api.plivo.com/v1/Account/${authId}/Message/`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${authId}:${str(cfg, 'authToken')}`).toString('base64')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ src: str(cfg, 'from'), dst: to, text: payload.body }),
      })
      if (!res.ok) throw new Error(`Plivo ${res.status}: ${res.body.slice(0, 200)}`)
      return 'plivo-ok'
    }
    case 'TEXTBEE': {
      // https://textbee.dev — Android-SIM gateway; POST to a registered device
      const res = await timedFetch(
        `https://api.textbee.dev/api/v1/gateways/${encodeURIComponent(str(cfg, 'deviceId'))}/send-sms`,
        {
          method: 'POST',
          headers: { 'x-api-key': str(cfg, 'apiKey'), 'Content-Type': 'application/json' },
          body: JSON.stringify({ recipients: [payload.to], message: payload.body }),
        },
      )
      if (!res.ok) throw new Error(`TextBee ${res.status}: ${res.body.slice(0, 200)}`)
      return 'textbee-ok'
    }
    case 'AWS_SNS': {
      return snsSendSms({
        region: str(cfg, 'region', 'us-east-1'),
        accessKey: str(cfg, 'accessKey'),
        secretKey: str(cfg, 'secretKey'),
        to,
        message: payload.body,
        senderId: str(cfg, 'senderId') || undefined,
      })
    }
    case 'CUSTOM': {
      const url = str(cfg, 'url')
      if (!url) throw new Error('Custom provider: url missing')
      const tpl = str(cfg, 'bodyTemplate', '{"to":"{{to}}","message":"{{body}}"}')
      const body = tpl
        .replaceAll('{{to}}', payload.to)
        .replaceAll('{{body}}', payload.body.replace(/"/g, '\\"').replace(/\n/g, '\\n'))
      const res = await timedFetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(str(cfg, 'apiKey') ? { Authorization: `Bearer ${str(cfg, 'apiKey')}` } : {}),
        },
        body,
      })
      if (!res.ok) throw new Error(`Custom ${res.status}: ${res.body.slice(0, 200)}`)
      return 'custom-ok'
    }
    default:
      throw new Error(`Unknown SMS provider type: ${type}`)
  }
}

async function updateProviderHealth(id: string, ok: boolean, error?: string) {
  await db.smsProvider.update({
    where: { id },
    data: {
      healthy: ok,
      lastCheckedAt: new Date(),
      sentCount: ok ? { increment: 1 } : undefined,
      failCount: ok ? undefined : { increment: 1 },
      lastError: ok ? null : (error ?? '').slice(0, 500),
    },
  })
}

/** Send an SMS through the failover chain; logs to SmsMessage. Sandbox simulates. */
export async function sendSms(payload: SmsPayload): Promise<SmsSendResult> {
  const settings = await getMergedSettings()
  const chain: SmsAttempt[] = []
  const providers = await db.smsProvider.findMany({ where: { enabled: true }, orderBy: { priority: 'asc' } })
  const chainOrder = settings.smsFailoverChain.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
  const ordered = [...providers].sort((a, b) => {
    const ia = chainOrder.indexOf(a.type)
    const ib = chainOrder.indexOf(b.type)
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.priority - b.priority
  })
  const sandbox = settings.appMode === 'SANDBOX' || ordered.length === 0

  if (sandbox) {
    const provider = ordered[0]?.type ?? 'SANDBOX'
    chain.push({ provider, ok: true, detail: 'Simulated (sandbox mode)', ms: 0, simulated: true })
    const msg = await db.smsMessage.create({
      data: {
        toNumber: payload.to,
        body: payload.body,
        providerType: provider,
        providerMessageId: `sim_${Date.now().toString(36)}`,
        status: 'SENT',
        providerChain: JSON.stringify(chain),
        relatedType: payload.relatedType ?? null,
        relatedId: payload.relatedId ?? null,
        customerRef: payload.customerRef ?? null,
        brandId: payload.brandId ?? null,
        sentAt: new Date(),
      },
    })
    return { ok: true, messageId: msg.id, provider, status: 'SENT', chain, simulated: true }
  }

  let lastError = 'No enabled SMS provider'
  for (const p of ordered) {
    const t0 = Date.now()
    try {
      const messageId = await sendWithProvider(p.type, p.config, payload)
      chain.push({ provider: p.type, ok: true, detail: `Accepted (${messageId})`, ms: Date.now() - t0 })
      await updateProviderHealth(p.id, true)
      await db.smsMessage.create({
        data: {
          toNumber: payload.to,
          body: payload.body,
          providerType: p.type,
          providerMessageId: messageId,
          status: 'SENT',
          cost: Number(settings.smsCostPerMessage ?? 0),
          providerChain: JSON.stringify(chain),
          relatedType: payload.relatedType ?? null,
          relatedId: payload.relatedId ?? null,
          customerRef: payload.customerRef ?? null,
          brandId: payload.brandId ?? null,
          sentAt: new Date(),
        },
      })
      return { ok: true, messageId, provider: p.type, status: 'SENT', chain, simulated: false }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      chain.push({ provider: p.type, ok: false, detail: detail.slice(0, 300), ms: Date.now() - t0 })
      await updateProviderHealth(p.id, false, detail)
      lastError = detail
    }
  }
  await db.smsMessage.create({
    data: {
      toNumber: payload.to,
      body: payload.body,
      providerType: ordered[0]?.type ?? null,
      status: 'FAILED',
      error: lastError.slice(0, 500),
      attempts: ordered.length,
      providerChain: JSON.stringify(chain),
      relatedType: payload.relatedType ?? null,
      relatedId: payload.relatedId ?? null,
      customerRef: payload.customerRef ?? null,
      brandId: payload.brandId ?? null,
    },
  })
  return { ok: false, messageId: '', provider: 'none', status: 'FAILED', error: lastError, chain, simulated: false }
}

/** Render a per-brand MessageTemplate and send via the SMS failover chain. */
export async function sendBrandSms(params: {
  event: string
  to: string
  vars: Record<string, string>
  brandId?: string | null
  locale?: string
  relatedType?: string | null
  relatedId?: string | null
  customerRef?: string | null
}): Promise<SmsSendResult> {
  const tpl = await db.messageTemplate.findFirst({
    where: {
      channel: 'SMS',
      event: params.event,
      locale: params.locale ?? 'en',
      OR: [{ brandId: params.brandId ?? null }, { brandId: null }],
      enabled: true,
    },
    orderBy: { brandId: { sort: 'asc', nulls: 'last' } },
  })
  const body = tpl
    ? tpl.body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => params.vars[k] ?? '')
    : params.vars.body ?? ''
  return sendSms({
    to: params.to,
    body,
    relatedType: params.relatedType,
    relatedId: params.relatedId,
    customerRef: params.customerRef,
    brandId: params.brandId,
  })
}
