import { db } from '@/lib/db'
import { jsonError, HttpError } from '@/lib/auth'

/**
 * Device outgoing-payment commands — the Android app pulls queued payouts here,
 * executes them in the MFS app, then reports CONFIRMED/FAILED.
 * Auth: `X-Device-Key` header (or JSON field deviceKey).
 */

async function requireDevice(req: Request, payload?: unknown) {
  const body = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>
  const deviceKey = req.headers.get('x-device-key') || body.deviceKey
  if (!deviceKey || typeof deviceKey !== 'string') throw new HttpError(401, 'Missing device key')
  const device = await db.device.findUnique({ where: { deviceKey } })
  if (!device) throw new HttpError(401, 'Unknown device key')
  if (device.status === 'BLOCKED') throw new HttpError(403, 'Device is blocked')
  await db.device.update({
    where: { id: device.id },
    data: { lastSeen: new Date(), status: 'ONLINE' },
  })
  return device
}

/** GET → claim QUEUED payouts assigned to this device (or unassigned), mark DISPATCHED. */
export async function GET(req: Request) {
  try {
    const device = await requireDevice(req)

    const queued = await db.outgoingPayment.findMany({
      where: { status: 'QUEUED', OR: [{ deviceId: device.id }, { deviceId: null }] },
      orderBy: { createdAt: 'asc' },
      take: 20,
    })

    const now = new Date()
    const commands: Array<{ id: string; mfs: string; toNumber: string; amount: number; note: string | null }> = []
    for (const p of queued) {
      const updated = await db.outgoingPayment.update({
        where: { id: p.id },
        data: { status: 'DISPATCHED', deviceId: device.id, updatedAt: now },
      })
      commands.push({ id: updated.id, mfs: updated.mfs, toNumber: updated.toNumber, amount: updated.amount, note: updated.note })
    }

    return Response.json({ ok: true, commands })
  } catch (err) {
    return jsonError(err)
  }
}

/** POST { id, result: 'CONFIRMED'|'FAILED', ref?, error? } → report execution result. */
export async function POST(req: Request) {
  try {
    const payload = await req.json().catch(() => null)
    if (!payload || typeof payload !== 'object') throw new HttpError(400, 'Invalid JSON body')
    const device = await requireDevice(req, payload)

    const body = payload as Record<string, unknown>
    const id = typeof body.id === 'string' ? body.id : ''
    if (!id) throw new HttpError(400, 'Missing id')
    const result = body.result
    if (result !== 'CONFIRMED' && result !== 'FAILED') {
      throw new HttpError(400, "result must be 'CONFIRMED' or 'FAILED'")
    }

    const payment = await db.outgoingPayment.findUnique({ where: { id } })
    if (!payment) throw new HttpError(404, 'Outgoing payment not found')
    // Only the owning device (or an unclaimed dispatch) may report results.
    if (payment.deviceId && payment.deviceId !== device.id) {
      throw new HttpError(403, 'This command belongs to another device')
    }

    const updated = await db.outgoingPayment.update({
      where: { id },
      data: {
        status: result,
        deviceId: device.id,
        ref: typeof body.ref === 'string' && body.ref.trim() ? body.ref.trim().slice(0, 120) : payment.ref,
        error: result === 'FAILED' && typeof body.error === 'string' && body.error.trim()
          ? body.error.trim().slice(0, 500)
          : (result === 'CONFIRMED' ? null : payment.error),
        confirmedAt: result === 'CONFIRMED' ? new Date() : payment.confirmedAt,
      },
    })

    return Response.json({ ok: true, id: updated.id, status: updated.status })
  } catch (err) {
    return jsonError(err)
  }
}
