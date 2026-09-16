import { db } from '@/lib/db'
import { jsonError, HttpError } from '@/lib/auth'
import { processIncomingSms, IngestMessage, IngestResult } from '@/lib/matcher'

/**
 * Device ingest endpoint — the Android app posts forwarded SMS here.
 * Auth: `X-Device-Key` header (or JSON field deviceKey).
 *
 * Body: { deviceKey, messages: [{ sender, body, simNumber, receivedAt }] }
 * or a single message: { deviceKey, sender, body, simNumber, receivedAt }
 */
export async function POST(req: Request) {
  try {
    const payload = await req.json().catch(() => null)
    if (!payload || typeof payload !== 'object') throw new HttpError(400, 'Invalid JSON body')

    const deviceKey = req.headers.get('x-device-key') || payload.deviceKey
    if (!deviceKey) throw new HttpError(401, 'Missing device key')

    const device = await db.device.findUnique({ where: { deviceKey } })
    if (!device) throw new HttpError(401, 'Unknown device key')
    if (device.status === 'BLOCKED') throw new HttpError(403, 'Device is blocked')

    const messages: IngestMessage[] = Array.isArray(payload.messages)
      ? payload.messages
      : [{ sender: payload.sender, body: payload.body, simNumber: payload.simNumber, receivedAt: payload.receivedAt }]

    const results: IngestResult[] = []
    for (const m of messages) {
      if (!m || typeof m.body !== 'string' || !m.body.trim()) continue
      results.push(await processIncomingSms(device.id, m))
    }

    // Any accepted request counts as a heartbeat too
    await db.device.update({
      where: { id: device.id },
      data: { lastSeen: new Date(), status: 'ONLINE' },
    })

    return Response.json({ ok: true, received: results.length, results })
  } catch (err) {
    return jsonError(err)
  }
}
