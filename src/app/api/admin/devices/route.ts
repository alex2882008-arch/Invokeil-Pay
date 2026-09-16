import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError, generateKey, generateOtp, logActivity } from '@/lib/auth'

/** AGENTs only see their own devices; ADMIN/VIEWER see all. */
async function deviceScope(userId: string, role: string): Promise<Record<string, unknown>> {
  return role === 'AGENT' ? { ownerId: userId } : {}
}

export async function GET(req: Request) {
  try {
    const user = await requireRole(['ADMIN', 'AGENT', 'VIEWER'])
    const url = new URL(req.url)

    if (url.searchParams.get('summary')) {
      const where = await deviceScope(user.id, user.role)
      const onlineCutoff = new Date(Date.now() - 5 * 60 * 1000)
      const [total, online, blocked] = await Promise.all([
        db.device.count({ where }),
        db.device.count({ where: { ...where, status: 'ONLINE' } }),
        db.device.count({ where: { ...where, status: 'BLOCKED' } }),
      ])
      return Response.json({ total, online, blocked })
    }

    const where = await deviceScope(user.id, user.role)
    const [devices, smsGroups] = await Promise.all([
      db.device.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          owner: { select: { id: true, name: true } },
          balances: { orderBy: { mfs: 'asc' } },
        },
      }),
      db.rawSms.groupBy({
        by: ['deviceId'],
        where: { receivedAt: { gte: new Date(Date.now() - 24 * 3600_000) }, parsed: true },
        _count: { _all: true },
      }),
    ])
    const sms24h = new Map(smsGroups.map((g) => [g.deviceId, g._count._all]))
    const onlineCutoff = Date.now() - 5 * 60 * 1000

    return Response.json({
      items: devices.map((d) => ({
        ...d,
        sms24h: sms24h.get(d.id) ?? 0,
        computedOnline: d.status === 'ONLINE',
      })),
    })
  } catch (err) {
    return jsonError(err)
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireRole(['ADMIN', 'AGENT'])
    const body = await req.json().catch(() => null)
    if (!body?.name || typeof body.name !== 'string' || !body.name.trim()) {
      throw new HttpError(400, 'Device name is required')
    }
    const ownerId = typeof body.ownerId === 'string' && body.ownerId ? body.ownerId : null
    if (ownerId) {
      const owner = await db.user.findUnique({ where: { id: ownerId }, select: { id: true } })
      if (!owner) throw new HttpError(400, 'Owner user not found')
    }
    const device = await db.device.create({
      data: {
        name: body.name.trim().slice(0, 80),
        deviceKey: generateKey('ilp'),
        pairingCode: generateOtp(),
        ownerId,
      },
      include: { owner: { select: { id: true, name: true } } },
    })
    await logActivity(user, 'device.created', `device:${device.id}`, { name: device.name })
    return Response.json({ device })
  } catch (err) {
    return jsonError(err)
  }
}
