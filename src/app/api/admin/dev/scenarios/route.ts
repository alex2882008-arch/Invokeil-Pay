import { requireRole, jsonError, HttpError, logActivity } from '@/lib/auth'
import { DEV_ROLES } from '@/lib/roles'
import { runScenario, SCENARIOS, type Scenario } from '@/lib/sandbox'
import { getMergedSettings } from '@/lib/settings-defaults'

// ── Developer Console: sandbox scenarios ─────────────────────────────────────
// GET  → catalog of scenarios (from lib/sandbox)
// POST { scenario, amount?, gatewayCode? } → runs the REAL pipeline with fake
// data and returns the full result { ok, steps[], checkoutToken, trxId }.

const GATEWAY_CODES = ['BKASH_PERSONAL', 'NAGAD_PERSONAL', 'ROCKET_PERSONAL', 'UPAY_PERSONAL']

export async function GET() {
  try {
    await requireRole(DEV_ROLES)
    const settings = await getMergedSettings()
    return Response.json({
      scenarios: SCENARIOS,
      gateways: GATEWAY_CODES,
      appMode: settings.appMode === 'PRODUCTION' ? 'PRODUCTION' : 'SANDBOX',
    })
  } catch (err) {
    return jsonError(err)
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireRole(DEV_ROLES)
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>

    const scenario = typeof b.scenario === 'string' ? b.scenario.trim() : ''
    const valid = SCENARIOS.some((s) => s.key === scenario)
    if (!valid) throw new HttpError(400, `Unknown scenario. Valid: ${SCENARIOS.map((s) => s.key).join(', ')}`)

    let amount: number | undefined
    if (b.amount !== undefined && b.amount !== null && b.amount !== '') {
      const n = Number(b.amount)
      if (!Number.isFinite(n) || n <= 0) throw new HttpError(400, 'amount must be a positive number')
      if (n > 1_000_000) throw new HttpError(400, 'amount must be ≤ 1,000,000')
      amount = Math.round(n * 100) / 100
    }

    let gatewayCode: string | undefined
    if (typeof b.gatewayCode === 'string' && b.gatewayCode.trim()) {
      const code = b.gatewayCode.trim().toUpperCase()
      if (!GATEWAY_CODES.includes(code)) throw new HttpError(400, `Unknown gatewayCode. Valid: ${GATEWAY_CODES.join(', ')}`)
      gatewayCode = code
    }

    const result = await runScenario(scenario as Scenario, { amount, gatewayCode })
    await logActivity(user, 'dev.sandbox.run', scenario, { amount, gatewayCode, ok: result.ok })
    return Response.json({ ok: true, result })
  } catch (err) {
    return jsonError(err)
  }
}
