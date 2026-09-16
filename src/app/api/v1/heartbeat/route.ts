import { db } from '@/lib/db'
import { jsonError, HttpError } from '@/lib/auth'

/**
 * Device heartbeat — sent by the Android app every few minutes.
 * Body: { deviceKey, battery, signal, model, androidVersion, appVersion, sims: [{number, carrier}] }
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

    const updated = await db.device.update({
      where: { id: device.id },
      data: {
        lastSeen: new Date(),
        status: 'ONLINE',
        battery: typeof payload.battery === 'number' ? Math.round(payload.battery) : device.battery,
        signal: typeof payload.signal === 'string' ? payload.signal : device.signal,
        model: payload.model || device.model,
        androidVersion: payload.androidVersion || device.androidVersion,
        appVersion: payload.appVersion || device.appVersion,
        sims: Array.isArray(payload.sims) ? JSON.stringify(payload.sims) : device.sims,
      },
    })

    return Response.json({ ok: true, device: { id: updated.id, status: updated.status } })
  } catch (err) {
    return jsonError(err)
  }
}
