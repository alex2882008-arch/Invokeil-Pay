import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError, safeInt, logActivity } from '@/lib/auth'
import { processIncomingSms } from '@/lib/matcher'

export async function GET(req: Request) {
  try {
    const user = await requireRole(['ADMIN', 'AGENT', 'VIEWER'])
    const url = new URL(req.url)

    // AGENTs only see SMS of their own devices
    const scope: Record<string, unknown> =
      user.role === 'AGENT' ? { device: { ownerId: user.id } } : {}

    if (url.searchParams.get('summary')) {
      const startOfDay = new Date()
      startOfDay.setHours(0, 0, 0, 0)
      const [total, today, awaiting, errors] = await Promise.all([
        db.rawSms.count({ where: scope }),
        db.rawSms.count({ where: { ...scope, receivedAt: { gte: startOfDay } } }),
        db.rawSms.count({ where: { ...scope, review: 'AWAITING_REVIEW' } }),
        db.rawSms.count({ where: { ...scope, review: 'ERROR' } }),
      ])
      return Response.json({ total, today, awaiting, errors })
    }

    const review = url.searchParams.get('review')
    const deviceId = url.searchParams.get('deviceId')
    const q = url.searchParams.get('q')?.trim()
    const page = safeInt(url.searchParams.get('page'), 1)
    const pageSize = 25

    const where: Record<string, unknown> = { ...scope }
    if (review && ['AUTO', 'AWAITING_REVIEW', 'APPROVED', 'ERROR'].includes(review)) {
      where.review = review
    }
    if (deviceId) where.deviceId = deviceId
    if (q) {
      where.OR = [
        { body: { contains: q } },
        { sender: { contains: q } },
        { simNumber: { contains: q } },
      ]
    }

    const [total, items] = await Promise.all([
      db.rawSms.count({ where }),
      db.rawSms.findMany({
        where,
        orderBy: { receivedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          device: { select: { id: true, name: true } },
          transaction: {
            select: { id: true, trxId: true, mfs: true, amount: true, status: true, checkoutId: true },
          },
        },
      }),
    ])

    return Response.json({ total, page, pageSize, items })
  } catch (err) {
    return jsonError(err)
  }
}

/**
 * Simulator endpoint: pushes a sample SMS through the real pipeline
 * (raw insert → parse → dedupe → match → webhook) with source=SIMULATOR.
 */
export async function POST(req: Request) {
  try {
    const user = await requireRole(['ADMIN', 'AGENT'])
    const body = await req.json().catch(() => null)
    const deviceId = typeof body?.deviceId === 'string' ? body.deviceId : ''
    const sender = typeof body?.sender === 'string' ? body.sender : ''
    const text = typeof body?.body === 'string' ? body.body : ''
    if (!deviceId || !text.trim()) throw new HttpError(400, 'deviceId and body are required')

    const device = await db.device.findUnique({ where: { id: deviceId }, select: { id: true, ownerId: true, name: true } })
    if (!device) throw new HttpError(404, 'Device not found')
    if (user.role === 'AGENT' && device.ownerId !== user.id) {
      throw new HttpError(403, 'You can only simulate on your own devices')
    }

    const result = await processIncomingSms(
      deviceId,
      {
        sender,
        body: text,
        simNumber: typeof body?.simNumber === 'string' ? body.simNumber : undefined,
        receivedAt: typeof body?.receivedAt === 'string' ? body.receivedAt : undefined,
      },
      'SIMULATOR'
    )
    await logActivity(user, 'sms.simulated', `device:${deviceId}`, { parsed: result.parsed, matched: !!result.matched })
    return Response.json({ result })
  } catch (err) {
    return jsonError(err)
  }
}
