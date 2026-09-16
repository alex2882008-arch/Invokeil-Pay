import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError, generateKey, generateOtp, logActivity } from '@/lib/auth'
import { isAdminRole } from '@/lib/roles'

const MFS_SET = new Set(['BKASH', 'NAGAD', 'ROCKET', 'UPAY'])
const ACCOUNT_TYPES = new Set(['PERSONAL', 'AGENT', 'MERCHANT'])

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(['ADMIN', 'AGENT'])
    const { id } = await params
    const device = await db.device.findUnique({ where: { id }, include: { balances: true } })
    if (!device) throw new HttpError(404, 'Device not found')
    if (user.role === 'AGENT' && device.ownerId !== user.id) {
      throw new HttpError(403, 'You can only manage your own devices')
    }

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') throw new HttpError(400, 'Invalid body')

    const data: Record<string, unknown> = {}
    const changed: string[] = []

    if (typeof body.name === 'string' && body.name.trim()) {
      data.name = body.name.trim().slice(0, 80)
      changed.push('name')
    }
    if ('ownerId' in body && isAdminRole(user.role)) {
      const ownerId = body.ownerId || null
      if (ownerId) {
        const owner = await db.user.findUnique({ where: { id: ownerId }, select: { id: true } })
        if (!owner) throw new HttpError(400, 'Owner user not found')
      }
      data.ownerId = ownerId
      changed.push('owner')
    }

    // Manual status edits: block / unblock (unblock → OFFLINE). The device app
    // itself flips to ONLINE via heartbeat — it can never be forced manually.
    // `blocked: true|false` is the canonical form; legacy `status` also accepted.
    if (typeof body.blocked === 'boolean') {
      data.status = body.blocked ? 'BLOCKED' : 'OFFLINE'
      changed.push(`status:${body.blocked ? 'BLOCKED' : 'OFFLINE'}`)
    } else if (body.status === 'BLOCKED') {
      data.status = 'BLOCKED'
      changed.push('status:BLOCKED')
    } else if (body.status === 'OFFLINE') {
      data.status = 'OFFLINE'
      changed.push('status:OFFLINE')
    } else if (body.status === 'ONLINE') {
      throw new HttpError(400, 'Devices come ONLINE by themselves when the app heartbeats')
    }

    if (body.regenerateKey === true) {
      data.deviceKey = generateKey('ilp')
      changed.push('key')
    }
    if (body.rotatePairing === true) {
      // pairingCode is unique — retry on the (astronomically rare) collision
      for (let i = 0; i < 3; i++) {
        const code = generateOtp()
        const clash = await db.device.findUnique({ where: { pairingCode: code } })
        if (!clash || clash.id === id) { data.pairingCode = code; break }
      }
      if (!data.pairingCode) data.pairingCode = generateOtp()
      changed.push('pairing')
    }

    // Balance upsert: PATCH { balance: { mfs, simNumber?, accountType?, balance } }
    let balanceResult: { id: string; mfs: string; balance: number } | null = null
    if (body.balance && typeof body.balance === 'object') {
      const b = body.balance
      const mfs = String(b.mfs ?? '').toUpperCase()
      if (!MFS_SET.has(mfs)) throw new HttpError(400, 'mfs must be one of BKASH, NAGAD, ROCKET, UPAY')
      const accountType = b.accountType ? String(b.accountType).toUpperCase() : 'PERSONAL'
      if (!ACCOUNT_TYPES.has(accountType)) throw new HttpError(400, 'accountType must be PERSONAL, AGENT or MERCHANT')
      const balance = Number(b.balance)
      if (!Number.isFinite(balance) || balance < 0) throw new HttpError(400, 'balance must be a number ≥ 0')
      const simNumber = b.simNumber ? String(b.simNumber).trim().slice(0, 20) : null

      // Unique per device + mfs + simNumber + accountType — update the exact
      // row when it exists, otherwise create it.
      const existing = await db.deviceBalance.findFirst({
        where: { deviceId: id, mfs, simNumber, accountType },
      })
      if (existing) {
        balanceResult = await db.deviceBalance.update({
          where: { id: existing.id },
          data: { balance, verifiedAt: new Date() },
        })
      } else {
        balanceResult = await db.deviceBalance.create({
          data: { deviceId: id, mfs, balance, simNumber, accountType },
        })
      }
      changed.push(`balance:${mfs}`)
    }

    const updated = await db.device.update({
      where: { id },
      data,
      include: {
        owner: { select: { id: true, name: true } },
        balances: { orderBy: { mfs: 'asc' } },
      },
    })

    if (changed.length > 0) {
      await logActivity(user, 'device.updated', `device:${id}`, Object.fromEntries(changed.map((c) => [c, true])))
    }
    return Response.json({ device: updated, balance: balanceResult })
  } catch (err) {
    return jsonError(err)
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(['ADMIN'])
    const { id } = await params
    const device = await db.device.findUnique({ where: { id }, select: { name: true } })
    if (!device) throw new HttpError(404, 'Device not found')
    await db.device.delete({ where: { id } })
    await logActivity(user, 'device.deleted', `device:${id}`, { name: device.name })
    return Response.json({ ok: true })
  } catch (err) {
    return jsonError(err)
  }
}
