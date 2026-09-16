import { db } from '@/lib/db'
import { jsonError, HttpError } from '@/lib/auth'
import { getMergedSettings } from '@/lib/settings-defaults'

/**
 * Device config — settings the Android app needs on its home screen.
 * Auth: `X-Device-Key` header (or JSON field deviceKey).
 * Returns { brandName, gateways:[{code,name,mfs,enabled}], appMode }.
 */

export async function GET(req: Request) {
  try {
    const deviceKey = req.headers.get('x-device-key')
    if (!deviceKey) throw new HttpError(401, 'Missing device key')
    const device = await db.device.findUnique({ where: { deviceKey } })
    if (!device) throw new HttpError(401, 'Unknown device key')
    if (device.status === 'BLOCKED') throw new HttpError(403, 'Device is blocked')
    await db.device.update({
      where: { id: device.id },
      data: { lastSeen: new Date(), status: 'ONLINE' },
    })

    const [settings, gateways] = await Promise.all([
      getMergedSettings(),
      db.gateway.findMany({
        orderBy: { sortOrder: 'asc' },
        select: { code: true, name: true, mfs: true, enabled: true },
      }),
    ])

    return Response.json({
      ok: true,
      config: {
        brandName: settings.brandName || 'Invokeil Pay',
        appMode: settings.appMode || 'SANDBOX',
        gateways,
      },
    })
  } catch (err) {
    return jsonError(err)
  }
}
