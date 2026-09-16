/**
 * Automation Builder — payload validation for /api/admin/automations/*.
 * Kept separate from automation-engine.ts (that file is engine-only / frozen).
 *
 * Rules:
 * - trigger ∈ AUTOMATION_TRIGGERS
 * - condition: { field, op, value } with field/op from the whitelists below
 * - actions: recursive over SEND_EMAIL|SEND_SMS|WEBHOOK|ADD_NOTE|TAG_CUSTOMER|BRANCH|WAIT
 *   — BRANCH nests then/else one more level; max list depth 3 (top-level = 1)
 */
import { HttpError } from '@/lib/auth'
import type { AutomationAction } from '@/lib/automation-engine'

export const AUTOMATION_TRIGGERS = [
  'PAYMENT_PAID',
  'PAYMENT_UNPAID_30M',
  'PAYMENT_UNPAID_24H',
  'CHECKOUT_CREATED',
  'INVOICE_OVERDUE',
  'LINK_USED',
  'SUBSCRIPTION_DUE',
  'RISK_FLAGGED',
  'MANUAL',
] as const

export const CONDITION_FIELDS = [
  'amount', 'mfs', 'gateway', 'customer_name', 'customer_email', 'customer_phone', 'status',
] as const

export const CONDITION_OPS = ['eq', 'ne', 'gt', 'lt', 'contains'] as const

export type AutomationCondition = { field: string; op: string; value: string }

const ACTION_TYPES = ['SEND_EMAIL', 'SEND_SMS', 'WEBHOOK', 'ADD_NOTE', 'TAG_CUSTOMER', 'BRANCH', 'WAIT'] as const

function str(raw: unknown, label: string, max: number, required: boolean): string {
  if (raw === undefined || raw === null) {
    if (required) throw new HttpError(400, `${label} is required`)
    return ''
  }
  if (typeof raw !== 'string') throw new HttpError(400, `${label} must be a string`)
  const v = raw.trim()
  if (required && !v) throw new HttpError(400, `${label} is required`)
  if (v.length > max) throw new HttpError(400, `${label} is too long (max ${max} characters)`)
  return v
}

function isHttpUrl(v: string): boolean {
  try {
    const u = new URL(v)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

export function validateTrigger(raw: unknown): string {
  const v = typeof raw === 'string' ? raw.trim() : ''
  if (!(AUTOMATION_TRIGGERS as readonly string[]).includes(v)) {
    throw new HttpError(400, `Unknown trigger — expected one of: ${AUTOMATION_TRIGGERS.join(', ')}`)
  }
  return v
}

export function validateConditions(raw: unknown): AutomationCondition[] {
  if (raw === undefined || raw === null) return []
  if (!Array.isArray(raw)) throw new HttpError(400, 'conditions must be an array')
  if (raw.length > 10) throw new HttpError(400, 'Too many conditions (max 10)')
  return raw.map((item, i) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new HttpError(400, `Condition #${i + 1} must be an object`)
    }
    const c = item as Record<string, unknown>
    const field = typeof c.field === 'string' ? c.field.trim() : ''
    if (!(CONDITION_FIELDS as readonly string[]).includes(field)) {
      throw new HttpError(400, `Condition #${i + 1}: unknown field "${field || '(empty)'}"`)
    }
    const op = typeof c.op === 'string' ? c.op.trim() : ''
    if (!(CONDITION_OPS as readonly string[]).includes(op)) {
      throw new HttpError(400, `Condition #${i + 1}: unknown operator "${op || '(empty)'}"`)
    }
    const value = str(c.value, `Condition #${i + 1}: value`, 200, true)
    return { field, op, value }
  })
}

/** Validate one actions list at the given depth (top level = 1, max 3). */
function validateActionList(raw: unknown, depth: number, label: string): AutomationAction[] {
  if (raw === undefined || raw === null) return []
  if (!Array.isArray(raw)) throw new HttpError(400, `${label} must be an array`)
  if (depth > 3) throw new HttpError(400, 'Branch nesting is too deep (max 3 levels)')
  if (raw.length > 10) throw new HttpError(400, `Too many actions in ${label} (max 10)`)

  return raw.map((item, i) => {
    const name = `${label} #${i + 1}`
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new HttpError(400, `${name} must be an object`)
    }
    const a = item as Record<string, unknown>
    const typeRaw = typeof a.type === 'string' ? a.type.trim() : ''
    if (!(ACTION_TYPES as readonly string[]).includes(typeRaw)) {
      throw new HttpError(400, `${name}: unknown action type "${typeRaw || '(empty)'}"`)
    }
    const type = typeRaw as (typeof ACTION_TYPES)[number]

    switch (type) {
      case 'SEND_EMAIL':
        return {
          type,
          to: str(a.to, `${name}: recipient`, 320, true),
          subject: str(a.subject, `${name}: subject`, 200, false),
          body: str(a.body, `${name}: body`, 4000, false),
        }
      case 'SEND_SMS':
        return {
          type,
          to: str(a.to, `${name}: recipient`, 320, true),
          body: str(a.body, `${name}: body`, 1000, false),
        }
      case 'WEBHOOK': {
        // NOTE: the engine reads the WEBHOOK target URL from action.to
        const url = str(a.to ?? a.url, `${name}: URL`, 500, true)
        if (!isHttpUrl(url)) throw new HttpError(400, `${name}: URL must be a valid http(s) address`)
        return { type, to: url }
      }
      case 'ADD_NOTE': {
        // engine reads the note text from action.body
        const note = str(a.body ?? a.value, `${name}: note`, 1000, true)
        return { type, body: note }
      }
      case 'TAG_CUSTOMER': {
        // engine reads action.body ?? action.value
        const tag = str(a.value ?? a.body, `${name}: tag`, 60, true)
        return { type, value: tag }
      }
      case 'WAIT': {
        const mins = Number(a.minutes)
        if (!Number.isFinite(mins) || mins < 0) throw new HttpError(400, `${name}: minutes must be a number ≥ 0`)
        const rounded = Math.round(mins)
        if (rounded > 60 * 24 * 30) throw new HttpError(400, `${name}: wait cannot exceed 30 days`)
        return { type, minutes: rounded }
      }
      case 'BRANCH': {
        const fieldRaw = typeof a.field === 'string' ? a.field.trim() : ''
        if (!(CONDITION_FIELDS as readonly string[]).includes(fieldRaw)) {
          throw new HttpError(400, `${name}: unknown branch field "${fieldRaw || '(empty)'}"`)
        }
        const opRaw = typeof a.op === 'string' ? a.op.trim() : ''
        if (!(CONDITION_OPS as readonly string[]).includes(opRaw)) {
          throw new HttpError(400, `${name}: unknown branch operator "${opRaw || '(empty)'}"`)
        }
        const value = str(a.value, `${name}: branch value`, 200, true)
        return {
          type,
          field: fieldRaw,
          op: opRaw as AutomationAction['op'],
          value,
          then: validateActionList(a.then, depth + 1, `${name} → then`),
          else: validateActionList(a.else, depth + 1, `${name} → else`),
        }
      }
      default:
        throw new HttpError(400, `${name}: unknown action type`)
    }
  })
}

export function validateActions(raw: unknown): AutomationAction[] {
  return validateActionList(raw, 1, 'Action')
}

/** Safely parse a stored JSON column (conditions/actions/log) — never throws. */
export function parseStoredJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback
  try {
    const parsed = JSON.parse(raw) as T
    return parsed ?? fallback
  } catch {
    return fallback
  }
}
