import { requireRole, jsonError, HttpError } from '@/lib/auth'
import { evaluatePayment } from '@/lib/risk-engine'

// ── Admin: risk rule test evaluator ──────────────────────────────────────────
// POST { amount, phone?, email?, ip? } → { verdict }
// Runs evaluatePayment against the active rules with subjectRef 'test' (admin sandbox tool).

const RISK_READ_ROLES = ['OWNER', 'ADMIN', 'FINANCE', 'SUPPORT', 'DEVELOPER'] as const

export async function POST(req: Request) {
  try {
    await requireRole([...RISK_READ_ROLES])
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>

    const amount = Number(b.amount)
    if (!Number.isFinite(amount) || amount <= 0) throw new HttpError(400, 'Enter an amount greater than 0')

    const phone = typeof b.phone === 'string' && b.phone.trim() ? b.phone.trim() : null
    const email = typeof b.email === 'string' && b.email.trim() ? b.email.trim() : null
    const ip = typeof b.ip === 'string' && b.ip.trim() ? b.ip.trim() : null

    const verdict = await evaluatePayment({
      subjectType: 'TEST',
      subjectRef: 'test',
      amount,
      customerPhone: phone,
      customerEmail: email,
      ip,
    })

    return Response.json({ verdict })
  } catch (err) {
    return jsonError(err)
  }
}
