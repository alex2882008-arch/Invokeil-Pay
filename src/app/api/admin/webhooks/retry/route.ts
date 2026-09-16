import {
  requireRole, jsonError, logActivity,
} from '@/lib/auth'
import { processWebhookRetries } from '@/lib/webhook'

// ── Admin: process due webhook retries immediately ───────────────────────────
// POST → { processed }

export async function POST() {
  try {
    const user = await requireRole(['ADMIN'])
    const processed = await processWebhookRetries(10)
    await logActivity(user, 'webhook.retries_processed', undefined, { processed })
    return Response.json({ processed })
  } catch (err) {
    return jsonError(err)
  }
}
