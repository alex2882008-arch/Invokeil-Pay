import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError, logActivity } from '@/lib/auth'
import { fireEvent } from '@/lib/automation-engine'
import { getMergedSettings } from '@/lib/settings-defaults'

// ── Admin: manual test run ───────────────────────────────────────────────────
// POST { customerEmail?, amount?, customerId?, vars? }
//
// Implementation notes (per task 8-C spec):
// - Fires fireEvent('MANUAL', ctx): ONLY enabled automations with trigger
//   MANUAL execute, regardless of which automation row the button sits on.
//   Automations with other triggers are exercised by the real pipeline
//   (payments / checkouts / invoices / risk engine) or by processDueRuns().
// - The engine is a no-op while settings.automationEnabled !== 'true' — the
//   response surfaces `engineEnabled` so the client can explain a zero-fire.

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const me = await requireRole(['OWNER', 'ADMIN', 'DEVELOPER'])
    const { id } = await params
    const automation = await db.automation.findUnique({
      where: { id },
      select: { id: true, name: true, trigger: true, enabled: true },
    })
    if (!automation) throw new HttpError(404, 'Automation not found')

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    if (!body || typeof body !== 'object') throw new HttpError(400, 'Invalid JSON body')

    const customerEmail =
      typeof body.customerEmail === 'string' && body.customerEmail.trim()
        ? body.customerEmail.trim().slice(0, 200)
        : 'test@invokeil.test'

    let amount = 500
    if (body.amount !== undefined && body.amount !== null && body.amount !== '') {
      const n = Number(body.amount)
      if (!Number.isFinite(n) || n < 0) throw new HttpError(400, 'amount must be a number ≥ 0')
      amount = Math.round(n * 100) / 100
    }

    let customerId: string | undefined
    if (typeof body.customerId === 'string' && body.customerId.trim()) {
      const customer = await db.customer.findUnique({ where: { id: body.customerId.trim() }, select: { id: true } })
      if (!customer) throw new HttpError(400, 'Customer not found')
      customerId = customer.id
    }

    const vars: Record<string, string> = {}
    if (body.vars && typeof body.vars === 'object' && !Array.isArray(body.vars)) {
      for (const [k, v] of Object.entries(body.vars as Record<string, unknown>).slice(0, 20)) {
        if (typeof k === 'string' && k.trim() && v !== undefined && v !== null) {
          vars[k.trim().slice(0, 40)] = String(v).slice(0, 200)
        }
      }
    }

    const settings = await getMergedSettings()
    const engineEnabled = settings.automationEnabled === 'true'

    const result = await fireEvent('MANUAL', {
      trigger: 'MANUAL',
      customerName: 'Test Customer',
      customerEmail,
      customerPhone: '01700000000',
      amount,
      customerId,
      vars,
    })

    await logActivity(me, 'automation.manual_run', id, {
      name: automation.name,
      fired: result.fired,
    })

    return Response.json({
      ok: true,
      fired: result.fired,
      runIds: result.runIds,
      engineEnabled,
      // A manual test can only execute MANUAL-trigger automations — explain
      // zero-fire when this automation listens on a pipeline trigger instead.
      warning:
        automation.trigger !== 'MANUAL'
          ? `This automation triggers on ${automation.trigger} — manual test runs execute MANUAL-trigger automations only.`
          : undefined,
    })
  } catch (err) {
    return jsonError(err)
  }
}
