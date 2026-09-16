/**
 * Email provider adapters + failover router.
 * Built-in providers: Resend, Amazon SES, MailerSend, Plunk, Loops, SMTP, Custom HTTP.
 * Sandbox mode simulates sends end-to-end (no external traffic) — beginner-safe by default.
 */
import { db } from '@/lib/db'
import { getMergedSettings } from '@/lib/settings-defaults'
import { decryptJson } from './vault'
import { sesSend } from './sigv4'

export interface EmailPayload {
  to: string
  subject: string
  html?: string
  text?: string
  identityId?: string | null
  identityEmail?: string | null
  templateKey?: string | null
  relatedType?: string | null
  relatedId?: string | null
  customerRef?: string | null
  brandId?: string | null
}

export interface ProviderAttempt {
  provider: string
  ok: boolean
  detail: string
  ms: number
  simulated?: boolean
}

export interface EmailSendResult {
  ok: boolean
  messageId: string
  provider: string
  status: string // SENT | FAILED | QUEUED
  error?: string
  chain: ProviderAttempt[]
  simulated: boolean
}

const TIMEOUT_MS = 15000

function str(cfg: Record<string, unknown>, k: string, fallback = ''): string {
  const v = cfg[k]
  return typeof v === 'string' && v.length > 0 ? v : fallback
}

async function timedFetch(url: string, init: RequestInit): Promise<{ ok: boolean; status: number; body: string }> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) })
  const body = await res.text()
  return { ok: res.ok, status: res.status, body }
}

/** Per-provider senders — each throws on failure with a short reason. */
async function sendWithProvider(type: string, configJson: string, from: string, payload: EmailPayload): Promise<string> {
  const cfg = decryptJson(configJson)
  switch (type) {
    case 'RESEND': {
      const res = await timedFetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${str(cfg, 'apiKey')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from,
          to: [payload.to],
          subject: payload.subject,
          html: payload.html ?? '',
          text: payload.text ?? undefined,
          reply_to: payload.identityEmail ?? undefined,
        }),
      })
      if (!res.ok) throw new Error(`Resend ${res.status}: ${res.body.slice(0, 200)}`)
      const j = JSON.parse(res.body) as { id?: string }
      return j.id ?? 'resend-ok'
    }
    case 'MAILERSEND': {
      const res = await timedFetch('https://api.mailersend.com/v1/email', {
        method: 'POST',
        headers: { Authorization: `Bearer ${str(cfg, 'apiKey')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: { email: from.split('<')[1]?.replace('>', '').trim() || from, name: from.split('<')[0]?.trim() || undefined },
          to: [{ email: payload.to }],
          subject: payload.subject,
          html: payload.html ?? '',
          text: payload.text ?? undefined,
        }),
      })
      if (!res.ok) throw new Error(`MailerSend ${res.status}: ${res.body.slice(0, 200)}`)
      const j = JSON.parse(res.body) as { id?: string }
      return j.id ?? 'mailersend-ok'
    }
    case 'PLUNK': {
      const res = await timedFetch('https://api.useplunk.com/v1/send', {
        method: 'POST',
        headers: { Authorization: `Bearer ${str(cfg, 'apiKey')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: payload.to, subject: payload.subject, body: payload.html ?? '' }),
      })
      if (!res.ok) throw new Error(`Plunk ${res.status}: ${res.body.slice(0, 200)}`)
      return 'plunk-ok'
    }
    case 'LOOPS': {
      const res = await timedFetch('https://app.loops.so/api/v1/transactional', {
        method: 'POST',
        headers: { Authorization: `Bearer ${str(cfg, 'apiKey')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionalId: str(cfg, 'transactionalId'),
          email: payload.to,
          dataVariables: { subject: payload.subject, bodyHtml: payload.html ?? '' },
        }),
      })
      if (!res.ok) throw new Error(`Loops ${res.status}: ${res.body.slice(0, 200)}`)
      const j = JSON.parse(res.body) as { messageId?: string }
      return j.messageId ?? 'loops-ok'
    }
    case 'SES': {
      return sesSend({
        region: str(cfg, 'region', 'us-east-1'),
        accessKey: str(cfg, 'accessKey'),
        secretKey: str(cfg, 'secretKey'),
        from,
        to: payload.to,
        subject: payload.subject,
        html: payload.html ?? '',
        text: payload.text,
        replyTo: payload.identityEmail ?? undefined,
      })
    }
    case 'SMTP': {
      const nodemailer = await import('nodemailer')
      const transport = nodemailer.createTransport({
        host: str(cfg, 'host'),
        port: Number(str(cfg, 'port', '587')),
        secure: str(cfg, 'secure', 'false') === 'true',
        auth: str(cfg, 'user') ? { user: str(cfg, 'user'), pass: str(cfg, 'password') } : undefined,
        connectionTimeout: TIMEOUT_MS,
      })
      const info = await transport.sendMail({
        from,
        to: payload.to,
        subject: payload.subject,
        html: payload.html ?? '',
        text: payload.text ?? undefined,
        replyTo: payload.identityEmail ?? undefined,
      })
      return info.messageId ?? 'smtp-ok'
    }
    case 'CUSTOM': {
      // Generic HTTP email API — map body via simple {{to}}/{{subject}}/{{html}} tokens.
      const url = str(cfg, 'url')
      if (!url) throw new Error('Custom provider: url missing')
      const tpl = str(cfg, 'bodyTemplate', '{"to":"{{to}}","subject":"{{subject}}","html":"{{html}}"}')
      const body = tpl
        .replaceAll('{{to}}', payload.to)
        .replaceAll('{{subject}}', payload.subject.replace(/"/g, '\\"'))
        .replaceAll('{{html}}', (payload.html ?? '').replace(/"/g, '\\"').replace(/\n/g, '\\n'))
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
      throw new Error(`Unknown provider type: ${type}`)
  }
}

/** Provider "from" line: uses identity address when supplied, else provider default. */
function resolveFrom(fromEmail: string, fromName: string | null | undefined, identityEmail?: string | null): string {
  const addr = identityEmail || fromEmail
  return fromName ? `${fromName} <${addr}>` : addr
}

async function updateProviderHealth(id: string, ok: boolean, error?: string) {
  await db.emailProvider.update({
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

/**
 * Send an email through the configured failover chain and log it.
 * Chain order comes from settings (emailFailoverChain), then per-provider priority.
 * Sandbox mode simulates the whole path — safe for beginners, zero external calls.
 */
export async function sendEmail(payload: EmailPayload): Promise<EmailSendResult> {
  const settings = await getMergedSettings()
  const chain: ProviderAttempt[] = []
  const providers = await db.emailProvider.findMany({ where: { enabled: true }, orderBy: { priority: 'asc' } })
  const chainOrder = settings.emailFailoverChain.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
  const ordered = [...providers].sort((a, b) => {
    const ia = chainOrder.indexOf(a.type)
    const ib = chainOrder.indexOf(b.type)
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.priority - b.priority
  })
  const sandbox = settings.appMode === 'SANDBOX' || ordered.length === 0

  if (sandbox) {
    const provider = ordered[0]?.type ?? 'SANDBOX'
    chain.push({ provider, ok: true, detail: 'Simulated (sandbox mode)', ms: 0, simulated: true })
    const msg = await db.emailMessage.create({
      data: {
        toAddress: payload.to,
        fromAddress: payload.identityEmail ?? ordered[0]?.fromEmail ?? settings.supportEmail,
        identityId: payload.identityId ?? null,
        subject: payload.subject,
        templateKey: payload.templateKey ?? null,
        bodyHtml: payload.html ?? null,
        bodyText: payload.text ?? null,
        providerType: ordered[0]?.type ?? 'SANDBOX',
        providerMessageId: `sim_${Date.now().toString(36)}`,
        status: 'SENT',
        providerChain: JSON.stringify(chain),
        relatedType: payload.relatedType ?? null,
        relatedId: payload.relatedId ?? null,
        customerRef: payload.customerRef ?? null,
        sentAt: new Date(),
      },
    })
    return { ok: true, messageId: msg.id, provider, status: 'SENT', chain, simulated: true }
  }

  let lastError = 'No enabled email provider'
  for (const p of ordered) {
    const t0 = Date.now()
    try {
      const messageId = await sendWithProvider(p.type, p.config, resolveFrom(p.fromEmail, p.fromName, payload.identityEmail), payload)
      const attempt: ProviderAttempt = { provider: p.type, ok: true, detail: `Accepted (${messageId})`, ms: Date.now() - t0 }
      chain.push(attempt)
      await updateProviderHealth(p.id, true)
      await db.emailMessage.create({
        data: {
          toAddress: payload.to,
          fromAddress: payload.identityEmail ?? p.fromEmail,
          identityId: payload.identityId ?? null,
          subject: payload.subject,
          templateKey: payload.templateKey ?? null,
          bodyHtml: payload.html ?? null,
          bodyText: payload.text ?? null,
          providerType: p.type,
          providerMessageId: messageId,
          status: 'SENT',
          cost: Number(settings.emailCostPerMessage ?? 0),
          providerChain: JSON.stringify(chain),
          relatedType: payload.relatedType ?? null,
          relatedId: payload.relatedId ?? null,
          customerRef: payload.customerRef ?? null,
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
  const msg = await db.emailMessage.create({
    data: {
      toAddress: payload.to,
      subject: payload.subject,
      templateKey: payload.templateKey ?? null,
      bodyHtml: payload.html ?? null,
      bodyText: payload.text ?? null,
      providerType: ordered[0]?.type ?? null,
      status: 'FAILED',
      error: lastError.slice(0, 500),
      attempts: ordered.length,
      providerChain: JSON.stringify(chain),
      relatedType: payload.relatedType ?? null,
      relatedId: payload.relatedId ?? null,
      customerRef: payload.customerRef ?? null,
    },
  })
  return { ok: false, messageId: msg.id, provider: 'none', status: 'FAILED', error: lastError, chain, simulated: false }
}

/** Render {{var}} tokens in a template string. */
export function renderVars(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vars[k] ?? '')
}

/** Send using a stored EmailTemplate (by key) with variables. */
export async function sendTemplatedEmail(params: {
  key: string
  to: string
  vars: Record<string, string>
  locale?: string
  identityId?: string | null
  relatedType?: string | null
  relatedId?: string | null
  customerRef?: string | null
  overrides?: { subject?: string; html?: string }
}): Promise<EmailSendResult> {
  const tpl = await db.emailTemplate.findUnique({ where: { key: params.key } })
  const subject =
    params.overrides?.subject ??
    (tpl ? renderVars(tpl.subject, params.vars) : `Message from Invokeil Pay (${params.key})`)
  const html =
    params.overrides?.html ??
    (tpl ? renderVars(tpl.bodyHtml, params.vars) : `<p>${params.vars.body ?? ''}</p>`)
  return sendEmail({
    to: params.to,
    subject,
    html,
    text: html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1000),
    identityId: params.identityId,
    templateKey: params.key,
    relatedType: params.relatedType,
    relatedId: params.relatedId,
    customerRef: params.customerRef,
  })
}
