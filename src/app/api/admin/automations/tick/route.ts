import { requireRole, jsonError, logActivity } from '@/lib/auth'
import { processDueRuns } from '@/lib/automation-engine'

// ── Admin: process the automation queue now ──────────────────────────────────
// POST → processDueRuns(20): resumes WAITING runs whose delay elapsed and
// evaluates the time-based triggers (unpaid 30m / 24h). Idempotent per
// hour-bucket (EventLedger dedupe) — safe to call repeatedly (dashboard-safe).

export async function POST() {
  try {
    const me = await requireRole(['OWNER', 'ADMIN', 'DEVELOPER'])
    const result = await processDueRuns(20)
    await logActivity(me, 'automation.tick', 'automations', { ...result })
    return Response.json({ ok: true, ...result })
  } catch (err) {
    return jsonError(err)
  }
}
