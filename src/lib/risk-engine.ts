/**
 * Fraud / Risk engine — merchant-configurable rules evaluated on payment events.
 * Rule types: VELOCITY (N payments per window), AMOUNT_LIMIT (min/max), LIST_MATCH (allow/block),
 * HOUR_PATTERN (unusual-hours activity). Actions: ALLOW (log), REVIEW (risk case), BLOCK (reject).
 * Every decision creates/updates a RiskCase → auditable, nothing silently blocked.
 */
import { db } from '@/lib/db'

export interface RiskVerdict {
  action: 'ALLOW' | 'REVIEW' | 'BLOCK'
  cases: Array<{ id: string; rule: string; reason: string; score: number }>
  blocked: boolean
  score: number
}

interface RuleConfig {
  windowMin?: number
  maxCount?: number
  maxAmount?: number
  minAmount?: number
  startHour?: number
  endHour?: number
  listType?: string
}

function withinHours(h: number, start: number, end: number): boolean {
  if (start <= end) return h >= start && h < end
  return h >= start || h < end // overnight window (e.g. 1–5)
}

/** Evaluate a payment event (called from checkout claim / link pay / API verify paths). */
export async function evaluatePayment(params: {
  subjectType?: string
  subjectRef: string // transaction id or checkout token
  customerRef?: string | null
  customerPhone?: string | null
  customerEmail?: string | null
  amount: number
  mfs?: string | null
  occurredAt?: Date
  ip?: string | null
}): Promise<RiskVerdict> {
  const verdict: RiskVerdict = { action: 'ALLOW', cases: [], blocked: false, score: 0 }
  const settings = await import('@/lib/settings-defaults').then((m) => m.getMergedSettings())
  if (settings.riskEnabled !== 'true') return verdict

  const rules = await db.riskRule.findMany({ where: { enabled: true }, orderBy: { priority: 'asc' } })
  if (rules.length === 0) return verdict
  const at = params.occurredAt ?? new Date()

  // Allow-list short-circuits
  if (params.customerPhone) {
    const allow = await db.listEntry.findUnique({
      where: { list_type_value: { list: 'ALLOW', type: 'PHONE', value: params.customerPhone } },
    })
    if (allow) return verdict
  }

  for (const rule of rules) {
    let cfg: RuleConfig = {}
    try {
      cfg = JSON.parse(rule.config) as RuleConfig
    } catch {
      /* skip malformed */
    }
    let hit: string | null = null

    if (rule.type === 'VELOCITY') {
      const windowMin = cfg.windowMin ?? 60
      const since = new Date(at.getTime() - windowMin * 60_000)
      const count = await db.transaction.count({
        where: {
          occurredAt: { gte: since },
          OR: [
            { senderNumber: params.customerPhone ?? '__none__' },
            { customerId: params.customerRef ?? '__none__' },
          ],
        },
      })
      const max = cfg.maxCount ?? 5
      if (count > max) hit = `${count} payments in ${windowMin}m (limit ${max})`
    } else if (rule.type === 'AMOUNT_LIMIT') {
      if (cfg.maxAmount != null && params.amount > cfg.maxAmount) hit = `Amount ${params.amount} exceeds limit ${cfg.maxAmount}`
      if (!hit && cfg.minAmount != null && params.amount < cfg.minAmount) hit = `Amount ${params.amount} below minimum ${cfg.minAmount}`
    } else if (rule.type === 'LIST_MATCH') {
      const vals = [
        params.customerPhone ? { type: 'PHONE', value: params.customerPhone } : null,
        params.customerEmail ? { type: 'EMAIL', value: params.customerEmail } : null,
        params.ip ? { type: 'IP', value: params.ip } : null,
      ].filter(Boolean) as Array<{ type: string; value: string }>
      for (const v of vals) {
        const blocked = await db.listEntry.findUnique({
          where: { list_type_value: { list: 'BLOCK', type: v.type, value: v.value } },
        })
        if (blocked) {
          hit = `Blocked list match: ${v.type} ${v.value}`
          break
        }
      }
    } else if (rule.type === 'HOUR_PATTERN') {
      const start = cfg.startHour ?? 1
      const end = cfg.endHour ?? 5
      if (withinHours(at.getHours(), start, end)) hit = `Unusual hour ${at.getHours()}:00 (window ${start}–${end})`
    }

    if (hit) {
      await db.riskRule.update({ where: { id: rule.id }, data: { hits: { increment: 1 }, lastHitAt: new Date() } })
      const score = rule.action === 'BLOCK' ? 100 : rule.action === 'REVIEW' ? 60 : 10
      const rc = await db.riskCase.create({
        data: {
          ruleId: rule.id,
          subjectType: params.subjectType ?? 'TRANSACTION',
          subjectRef: params.subjectRef,
          score,
          reason: hit,
          status: rule.action === 'BLOCK' ? 'BLOCKED' : 'OPEN',
        },
      })
      verdict.cases.push({ id: rc.id, rule: rule.name, reason: hit, score })
      verdict.score += score
      if (rule.action === 'BLOCK') verdict.blocked = true
      if (rule.action === 'REVIEW' && verdict.action !== 'BLOCK') verdict.action = 'REVIEW'
      // ledger trace
      await db.eventLedger.create({
        data: {
          type: 'risk.flagged',
          idempotencyKey: `risk:${rc.id}`,
          subjectRef: params.subjectRef,
          payload: JSON.stringify({ rule: rule.name, reason: hit, action: rule.action }),
          status: 'PROCESSED',
          processedAt: new Date(),
        },
      }).catch(() => {})
    }
  }

  if (verdict.blocked) verdict.action = 'BLOCK'
  if (verdict.action !== 'ALLOW') {
    await db.transaction.updateMany({ where: { id: params.subjectRef }, data: { riskFlagged: true } }).catch(() => {})
  }
  return verdict
}

/** Seed sensible starter rules (idempotent). */
export async function ensureDefaultRiskRules(): Promise<void> {
  const count = await db.riskRule.count()
  if (count > 0) return
  await db.riskRule.createMany({
    data: [
      { name: 'High velocity (5 payments / 30 min)', type: 'VELOCITY', config: '{"windowMin":30,"maxCount":5}', action: 'REVIEW', priority: 10 },
      { name: 'Large single payment (> 25,000 BDT)', type: 'AMOUNT_LIMIT', config: '{"maxAmount":25000}', action: 'REVIEW', priority: 20 },
      { name: 'Blocked list (phone/email/IP)', type: 'LIST_MATCH', config: '{}', action: 'BLOCK', priority: 5 },
      { name: 'Odd-hours activity (01:00–05:00)', type: 'HOUR_PATTERN', config: '{"startHour":1,"endHour":5}', action: 'REVIEW', priority: 30 },
    ],
  })
}
