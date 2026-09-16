/**
 * Automation engine — Trigger → Conditions → Delay → Branch → Action.
 * Fired from payment/checkout/invoice events; actions run sequentially and are
 * logged step-by-step into AutomationRun.log (JSON). WAIT steps park the run in
 * WAITING with waitUntil and are resumed lazily by processDueRuns() (cheap scan
 * invoked from dashboard/stats polling — no cron dependency for low-end hosting).
 */
import { db } from '@/lib/db'
import { getMergedSettings } from '@/lib/settings-defaults'
import { sendEmail } from '@/lib/providers/email'
import { sendBrandSms } from '@/lib/providers/sms'

export interface AutomationAction {
  type: 'SEND_EMAIL' | 'SEND_SMS' | 'WEBHOOK' | 'ADD_NOTE' | 'TAG_CUSTOMER' | 'BRANCH' | 'WAIT'
  // SEND_EMAIL
  to?: string
  templateKey?: string
  subject?: string
  body?: string
  vars?: Record<string, string>
  // SEND_SMS
  smsEvent?: string
  // WAIT
  minutes?: number
  // BRANCH
  field?: string
  op?: 'eq' | 'ne' | 'gt' | 'lt' | 'contains'
  value?: string
  then?: AutomationAction[]
  else?: AutomationAction[]
}

export interface RunContext {
  trigger: string
  checkoutToken?: string
  checkoutId?: string
  transactionId?: string
  invoiceId?: string
  customerId?: string
  customerName?: string
  customerEmail?: string
  customerPhone?: string
  amount?: number
  brandId?: string | null
  vars?: Record<string, string>
}

function ctxVars(ctx: RunContext, extra?: Record<string, string>): Record<string, string> {
  return {
    customer_name: ctx.customerName ?? 'Customer',
    customer_email: ctx.customerEmail ?? '',
    customer_phone: ctx.customerPhone ?? '',
    amount: ctx.amount != null ? String(ctx.amount) : '',
    checkout_token: ctx.checkoutToken ?? '',
    brand: 'Invokeil Pay',
    ...ctx.vars,
    ...extra,
  }
}

function interpolate(tpl: string, vars: Record<string, unknown>): string {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => String(vars[k] ?? ''))
}

function matchCondition(cond: { field?: string; op?: string; value?: string }, ctx: RunContext): boolean {
  const values: Record<string, unknown> = {
    amount: ctx.amount,
    mfs: ctx.vars?.mfs,
    gateway: ctx.vars?.gatewayCode,
    customer_name: ctx.customerName,
    customer_email: ctx.customerEmail,
    customer_phone: ctx.customerPhone,
    status: ctx.vars?.status,
  }
  const actual = values[cond.field ?? '']
  if (actual == null) return false
  const a = String(actual)
  const b = String(cond.value ?? '')
  switch (cond.op) {
    case 'eq': return a === b
    case 'ne': return a !== b
    case 'gt': return Number(a) > Number(b)
    case 'lt': return Number(a) < Number(b)
    case 'contains': return a.toLowerCase().includes(b.toLowerCase())
    default: return true
  }
}

async function executeActions(
  actions: AutomationAction[],
  ctx: RunContext,
  logs: Array<{ step: string; ok: boolean; detail: string; at: string }>,
  depth = 0,
  startIdx = 0,
): Promise<void> {
  if (depth > 5) {
    logs.push({ step: 'BRANCH', ok: false, detail: 'Max branch depth reached', at: new Date().toISOString() })
    return
  }
  for (let i = startIdx; i < actions.length; i++) {
    const action = actions[i]
    const at = new Date().toISOString()
    try {
      switch (action.type) {
        case 'WAIT': {
          const mins = Math.max(0, Number(action.minutes ?? 0))
          logs.push({ step: 'WAIT', ok: true, detail: `Wait ${mins} minute(s) — run parked (resumes at step ${i + 1})`, at })
          throw Object.assign(new Error(`WAIT:${mins}:${i + 1}`), { __wait: true })
        }
        case 'SEND_EMAIL': {
          const to = interpolate(action.to ?? '', ctxVars(ctx))
          if (!to) {
            logs.push({ step: 'SEND_EMAIL', ok: false, detail: 'No recipient address', at })
            break
          }
          const vars = { customer_name: ctx.customerName ?? '', amount: String(ctx.amount ?? ''), ...(ctx.vars ?? {}), ...(action.vars ?? {}) }
          const bodyText = interpolate(action.body ?? (vars as Record<string, string>).body ?? "Notification", vars as Record<string, string>)
          const html = `<p style="line-height:1.6">${bodyText.replace(/\n/g, '<br/>')}</p>`
          const res = await sendEmail({
            to,
            subject: interpolate(action.subject ?? 'Notification', ctxVars(ctx)),
            html,
            templateKey: action.templateKey ?? null,
            relatedType: 'automation',
            customerRef: ctx.customerId ?? null,
          })
          logs.push({ step: 'SEND_EMAIL', ok: res.ok, detail: res.ok ? `Sent to ${to} via ${res.provider}${res.simulated ? ' (simulated)' : ''}` : res.error ?? 'failed', at })
          break
        }
        case 'SEND_SMS': {
          const to = interpolate(action.to ?? '', ctxVars(ctx))
          if (!to) {
            logs.push({ step: 'SEND_SMS', ok: false, detail: 'No recipient number', at })
            break
          }
          const vars = { customer_name: ctx.customerName ?? '', amount: String(ctx.amount ?? ''), ...(ctx.vars ?? {}) }
          const body = interpolate(action.body ?? '', vars)
          const res = await sendBrandSms({
            event: action.smsEvent ?? 'CUSTOM',
            to,
            vars,
            brandId: ctx.brandId ?? null,
            relatedType: 'automation',
            customerRef: ctx.customerId ?? null,
          })
          if (!res.ok && body) {
            // fall back to direct body send when no brand template exists
            const direct = await sendBrandSms({ event: 'CUSTOM', to, vars: { ...vars, body }, brandId: ctx.brandId ?? null })
            logs.push({ step: 'SEND_SMS', ok: direct.ok, detail: direct.ok ? `Sent to ${to}${direct.simulated ? ' (simulated)' : ''}` : direct.error ?? 'failed', at })
          } else {
            logs.push({ step: 'SEND_SMS', ok: res.ok, detail: res.ok ? `Sent to ${to}${res.simulated ? ' (simulated)' : ''}` : res.error ?? 'failed', at })
          }
          break
        }
        case 'WEBHOOK': {
          const url = interpolate(action.to ?? '', ctxVars(ctx))
          if (!url) {
            logs.push({ step: 'WEBHOOK', ok: false, detail: 'No URL', at })
            break
          }
          const payload = JSON.stringify({ event: ctx.trigger, ...ctx, at })
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Invokeil-Event': ctx.trigger },
            body: payload,
            signal: AbortSignal.timeout(10000),
          }).catch((e) => {
            logs.push({ step: 'WEBHOOK', ok: false, detail: String(e).slice(0, 200), at })
            return null
          })
          if (res) logs.push({ step: 'WEBHOOK', ok: res.ok, detail: `HTTP ${res.status} → ${url}`, at })
          break
        }
        case 'ADD_NOTE': {
          const note = interpolate(action.body ?? '', ctxVars(ctx))
          if (ctx.customerId) {
            await db.customer.update({
              where: { id: ctx.customerId },
              data: { notes: note ? note : undefined },
            }).catch(() => {})
            logs.push({ step: 'ADD_NOTE', ok: true, detail: 'Customer note updated', at })
          } else {
            logs.push({ step: 'ADD_NOTE', ok: false, detail: 'No customer in context', at })
          }
          break
        }
        case 'TAG_CUSTOMER': {
          const tag = interpolate(action.body ?? action.value ?? '', ctxVars(ctx))
          if (ctx.customerId && tag) {
            const c = await db.customer.findUnique({ where: { id: ctx.customerId }, select: { tags: true } })
            const tags: string[] = c?.tags ? (JSON.parse(c.tags) as string[]) : []
            if (!tags.includes(tag)) tags.push(tag)
            await db.customer.update({ where: { id: ctx.customerId }, data: { tags: JSON.stringify(tags) } }).catch(() => {})
            logs.push({ step: 'TAG_CUSTOMER', ok: true, detail: `Tagged "${tag}"`, at })
          } else {
            logs.push({ step: 'TAG_CUSTOMER', ok: false, detail: 'No customer or tag', at })
          }
          break
        }
        case 'BRANCH': {
          const cond = { field: action.field, op: action.op, value: action.value }
          const passed = matchCondition(cond, ctx)
          logs.push({ step: 'BRANCH', ok: true, detail: `${action.field} ${action.op} ${action.value} → ${passed ? 'then' : 'else'}`, at })
          await executeActions((passed ? action.then : action.else) ?? [], ctx, logs, depth + 1)
          break
        }
      }
    } catch (err) {
      const e = err as Error & { __wait?: boolean }
      if (e.__wait) throw err
      logs.push({ step: action.type, ok: false, detail: String(e.message ?? e).slice(0, 200), at })
    }
  }
}

/** Fire an automation trigger. Returns number of automations executed. */
export async function fireEvent(trigger: string, ctx: RunContext): Promise<{ fired: number; runIds: string[] }> {
  const settings = await getMergedSettings()
  if (settings.automationEnabled !== 'true') return { fired: 0, runIds: [] }
  const automations = await db.automation.findMany({ where: { enabled: true, trigger } })
  const runIds: string[] = []
  for (const automation of automations) {
    const run = await db.automationRun.create({
      data: { automationId: automation.id, status: 'RUNNING', context: JSON.stringify(ctx) },
    })
    const logs: Array<{ step: string; ok: boolean; detail: string; at: string }> = []
    try {
      const conds = automation.conditions ? (JSON.parse(automation.conditions) as Array<{ field?: string; op?: string; value?: string }>) : []
      const allPass = conds.every((c) => matchCondition(c, ctx))
      if (conds.length > 0 && !allPass) {
        logs.push({ step: 'CONDITIONS', ok: true, detail: 'Not matched — skipped', at: new Date().toISOString() })
        await db.automationRun.update({
          where: { id: run.id },
          data: { status: 'SUCCESS', log: JSON.stringify(logs), finishedAt: new Date() },
        })
        runIds.push(run.id)
        continue
      }
      const actions = (JSON.parse(automation.actions || '[]')) as AutomationAction[]
      try {
        await executeActions(actions, ctx, logs)
        await db.automationRun.update({
          where: { id: run.id },
          data: { status: 'SUCCESS', log: JSON.stringify(logs), finishedAt: new Date() },
        })
      } catch (err) {
        const e = err as Error & { __wait?: boolean }
        if (e.__wait) {
          const [, mins, idx] = e.message.split(':')
          await db.automationRun.update({
            where: { id: run.id },
            data: {
              status: 'WAITING',
              log: JSON.stringify(logs),
              context: JSON.stringify({ ...ctx, __pending: actions, __pendingIdx: Number(idx ?? 0) }),
              waitUntil: new Date(Date.now() + Number(mins ?? 0) * 60_000),
            },
          })
        } else throw err
      }
      await db.automation.update({ where: { id: automation.id }, data: { runCount: { increment: 1 }, lastRunAt: new Date() } })
    } catch (err) {
      const e = err as Error & { __wait?: boolean }
      if (e.__wait) {
        const mins = Number(e.message.split(':')[1] ?? 0)
        await db.automationRun.update({
          where: { id: run.id },
          data: {
            status: 'WAITING',
            log: JSON.stringify(logs),
            context: JSON.stringify({ ...ctx, __pending: [] }),
            waitUntil: new Date(Date.now() + mins * 60_000),
          },
        })
      } else {
        logs.push({ step: 'ENGINE', ok: false, detail: String(err).slice(0, 300), at: new Date().toISOString() })
        await db.automationRun.update({
          where: { id: run.id },
          data: { status: 'FAILED', log: JSON.stringify(logs), finishedAt: new Date() },
        })
      }
    }
    runIds.push(run.id)
  }
  return { fired: runIds.length, runIds }
}

/** Resume WAITING runs whose waitUntil has passed + time-based triggers (unpaid 30m/24h). */
export async function processDueRuns(limit = 10): Promise<{ resumed: number; scheduled: number }> {
  const now = new Date()
  const waiting = await db.automationRun.findMany({
    where: { status: 'WAITING', waitUntil: { lte: now } },
    take: limit,
    include: { automation: true },
  })
  let resumed = 0
  for (const run of waiting) {
    let ctx: RunContext & { __pending?: AutomationAction[]; __pendingIdx?: number } = {} as RunContext & { __pending?: AutomationAction[]; __pendingIdx?: number }
    try {
      ctx = JSON.parse(run.context ?? '{}') as RunContext & { __pending?: AutomationAction[]; __pendingIdx?: number }
    } catch { /* noop */ }
    const logs: Array<{ step: string; ok: boolean; detail: string; at: string }> = run.log ? JSON.parse(run.log) as typeof logs : []
    const pending = ctx.__pending ?? []
    const resumeIdx = ctx.__pendingIdx ?? 0
    delete ctx.__pending
    const afterWait = pending.slice(0)
    try {
      await executeActions(afterWait, ctx as RunContext, logs, 0, resumeIdx)
      await db.automationRun.update({
        where: { id: run.id },
        data: { status: 'SUCCESS', log: JSON.stringify(logs), finishedAt: new Date() },
      })
    } catch (err) {
      const e = err as Error & { __wait?: boolean }
      if (e.__wait) {
        const [, mins, idx] = e.message.split(':')
        await db.automationRun.update({
          where: { id: run.id },
          data: {
            status: 'WAITING',
            log: JSON.stringify(logs),
            context: JSON.stringify({ ...ctx, __pending: afterWait, __pendingIdx: Number(idx ?? 0) }),
            waitUntil: new Date(Date.now() + Number(mins ?? 0) * 60_000),
          },
        })
      } else {
        await db.automationRun.update({
          where: { id: run.id },
          data: { status: 'FAILED', log: JSON.stringify(logs), finishedAt: new Date() },
        })
      }
    }
    resumed++
  }

  // Time-based triggers: unpaid checkouts (evaluated opportunistically, idempotent per hour-bucket)
  let scheduled = 0
  const settings = await getMergedSettings()
  if (settings.automationEnabled === 'true') {
    for (const [trigger, olderMin] of [['PAYMENT_UNPAID_30M', 30], ['PAYMENT_UNPAID_24H', 60 * 24]] as const) {
      const autos = await db.automation.findMany({ where: { enabled: true, trigger } })
      if (autos.length === 0) continue
      const cutoff = new Date(now.getTime() - olderMin * 60_000)
      const stale = await db.checkoutPage.findMany({
        where: { status: { in: ['PENDING', 'AWAITING'] }, createdAt: { lte: cutoff }, updatedAt: { lte: cutoff } },
        take: 20,
      })
      for (const co of stale) {
        const key = `sched:${trigger}:${co.id}:${now.toISOString().slice(0, 13)}` // hourly dedupe
        const exists = await db.eventLedger.findUnique({ where: { idempotencyKey: key } })
        if (exists) continue
        await db.eventLedger.create({
          data: { type: 'automation.scheduled', idempotencyKey: key, subjectRef: co.id, payload: trigger, status: 'PROCESSED', processedAt: now },
        })
        await fireEvent(trigger, {
          trigger,
          checkoutId: co.id,
          checkoutToken: co.token,
          customerName: co.customerName ?? undefined,
          customerPhone: co.customerPhone ?? undefined,
          amount: co.amount,
          vars: { status: co.status },
        })
        scheduled++
      }
    }
  }
  return { resumed, scheduled }
}

/** One-click installable workflow templates. */
export const WORKFLOW_TEMPLATES: Array<{
  key: string
  name: string
  description: string
  trigger: string
  conditions: unknown
  actions: AutomationAction[]
}> = [
  {
    key: 'payment_success_flow',
    name: 'Payment Success Flow',
    description: 'Send a branded receipt email + SMS the moment a payment is confirmed.',
    trigger: 'PAYMENT_PAID',
    conditions: [],
    actions: [
      { type: 'SEND_EMAIL', to: '{{customer_email}}', subject: 'Payment received — {{amount}} BDT', body: 'Hi {{customer_name}},\n\nWe received your payment of {{amount}} BDT. Thank you!\n\n— {{brand}}' },
      { type: 'SEND_SMS', to: '{{customer_phone}}', body: 'Payment of {{amount}} BDT received. Thank you, {{customer_name}}!' },
    ],
  },
  {
    key: 'failed_payment_recovery',
    name: 'Failed Payment Recovery',
    description: 'Gentle SMS reminder after 30 minutes unpaid, then an email after 24 hours.',
    trigger: 'PAYMENT_UNPAID_30M',
    conditions: [],
    actions: [
      { type: 'SEND_SMS', to: '{{customer_phone}}', body: 'Hi {{customer_name}}, your payment of {{amount}} BDT is still pending. Need help? Reply to this message.' },
      { type: 'WAIT', minutes: 60 * 23 },
      { type: 'SEND_EMAIL', to: '{{customer_email}}', subject: 'Still pending: {{amount}} BDT', body: 'Hi {{customer_name}},\n\nYour payment is still pending after 24 hours. Complete it here or contact support.\n\n— {{brand}}' },
    ],
  },
  {
    key: 'invoice_due_reminder',
    name: 'Invoice Due Reminder',
    description: 'Email + SMS nudge when an invoice goes overdue.',
    trigger: 'INVOICE_OVERDUE',
    conditions: [],
    actions: [
      { type: 'SEND_EMAIL', to: '{{customer_email}}', subject: 'Invoice overdue — {{amount}} BDT', body: 'Hi {{customer_name}},\n\nInvoice for {{amount}} BDT is now overdue. Please settle at your earliest convenience.\n\n— {{brand}}' },
      { type: 'SEND_SMS', to: '{{customer_phone}}', body: 'Reminder: invoice {{amount}} BDT is overdue.' },
    ],
  },
  {
    key: 'subscription_renewal',
    name: 'Subscription Renewal',
    description: 'Receipt on every successful renewal; dunning email on failure.',
    trigger: 'SUBSCRIPTION_DUE',
    conditions: [],
    actions: [
      { type: 'SEND_EMAIL', to: '{{customer_email}}', subject: 'Your {{brand}} subscription renewed', body: 'Hi {{customer_name}},\n\nYour subscription renewed for {{amount}} BDT. Next billing date is in one cycle.\n\n— {{brand}}' },
    ],
  },
  {
    key: 'large_payment_alert',
    name: 'Large Payment Alert',
    description: 'Only for payments over 10,000 BDT: email yourself an alert.',
    trigger: 'PAYMENT_PAID',
    conditions: [{ field: 'amount', op: 'gt', value: '10000' }],
    actions: [
      { type: 'SEND_EMAIL', to: '{{merchant_email}}', subject: 'Large payment: {{amount}} BDT', body: 'A large payment of {{amount}} BDT was received from {{customer_name}}.' },
    ],
  },
  {
    key: 'risk_review_flow',
    name: 'Risk Review Flow',
    description: 'Tag the customer and notify support when risk engine flags a payment.',
    trigger: 'RISK_FLAGGED',
    conditions: [],
    actions: [
      { type: 'TAG_CUSTOMER', value: 'risk-review' },
      { type: 'SEND_EMAIL', to: '{{merchant_email}}', subject: 'Risk review needed: {{amount}} BDT', body: 'A payment was flagged for review. Customer: {{customer_name}} ({{customer_phone}}).' },
    ],
  },
]
