import { db } from '@/lib/db'
import {
  requireRole, jsonError, HttpError, logActivity, generateKey, generateOtp, randomToken,
} from '@/lib/auth'

// ── Setup wizard (ADMIN only) — one POST endpoint, flat body { step, ...data } ──
// POST { step: 1, brandName, number_bkash, number_nagad }   → { ok }
// POST { step: 2, enableGatewayCodes: string[] }            → { ok, enabled }
//         (list is authoritative: all gateways disabled, listed codes re-enabled)
// POST { step: 3, deviceName }                              → { deviceKey, pairingCode }
// POST { step: 4, title, amount, customerPhone? }           → { token }
// POST { step: 'complete' }                                 → { ok: true }

async function upsertSetting(key: string, value: string) {
  await db.setting.upsert({ where: { key }, update: { value }, create: { key, value } })
}

export async function POST(req: Request) {
  try {
    const me = await requireRole(['ADMIN'])
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || typeof body !== 'object') throw new HttpError(400, 'Invalid JSON body')
    const step: unknown = body.step

    // ── Finish setup ──
    if (step === 'complete') {
      await upsertSetting('setupCompleted', 'true')
      await upsertSetting('setupStep', '4')
      await logActivity(me, 'wizard.completed', 'setup')
      return Response.json({ ok: true })
    }

    // ── Step 1: brand ──
    if (step === 1) {
      const brandName = typeof body.brandName === 'string' ? body.brandName.trim().slice(0, 80) : ''
      if (!brandName) throw new HttpError(400, 'Brand name is required')

      await upsertSetting('brandName', brandName)
      for (const key of ['number_bkash', 'number_nagad'] as const) {
        const v = typeof body[key] === 'string' ? (body[key] as string).trim().slice(0, 40) : ''
        await upsertSetting(key, v)
      }
      await upsertSetting('setupStep', '1')
      await logActivity(me, 'wizard.step_brand', 'settings', { brandName })
      return Response.json({ ok: true })
    }

    // ── Step 2: gateways (disable all, enable listed) ──
    if (step === 2) {
      const codes = Array.isArray(body.enableGatewayCodes)
        ? body.enableGatewayCodes.map((c) => String(c).trim()).filter(Boolean)
        : []
      if (codes.length === 0) throw new HttpError(400, 'Select at least one gateway')

      await db.gateway.updateMany({ data: { enabled: false } })
      const on = await db.gateway.updateMany({
        where: { code: { in: codes } },
        data: { enabled: true },
      })
      await upsertSetting('setupStep', '2')
      await logActivity(me, 'wizard.step_gateways', 'gateways', { enabled: codes })
      return Response.json({ ok: true, enabled: on.count })
    }

    // ── Step 3: device ──
    if (step === 3) {
      const name = typeof body.deviceName === 'string' ? body.deviceName.trim().slice(0, 60) : ''
      if (!name) throw new HttpError(400, 'Device name is required')

      const device = await db.device.create({
        data: {
          name,
          deviceKey: generateKey('ilp'),
          pairingCode: generateOtp(),
          ownerId: me.id,
        },
      })
      await upsertSetting('setupStep', '3')
      await logActivity(me, 'wizard.step_device', `device:${device.id}`, { name: device.name })
      return Response.json(
        { deviceKey: device.deviceKey, pairingCode: device.pairingCode },
        { status: 201 },
      )
    }

    // ── Step 4: first checkout ──
    if (step === 4) {
      const title = typeof body.title === 'string' ? body.title.trim().slice(0, 120) : ''
      const amount = Number(body.amount)
      const phone = typeof body.customerPhone === 'string'
        ? body.customerPhone.trim().replace(/^\+?88/, '').slice(0, 20)
        : ''
      if (!title) throw new HttpError(400, 'Checkout title is required')
      if (!Number.isFinite(amount) || amount <= 0) throw new HttpError(400, 'Enter a valid amount')

      // Resolve customer by phone (create when new) — same convention as admin checkouts
      let customerId: string | null = null
      if (phone) {
        const found = await db.customer.findFirst({ where: { phone } })
        if (found) customerId = found.id
        else {
          const created = await db.customer.create({
            data: { name: title.slice(0, 60), phone, insertedVia: 'CHECKOUT' },
          })
          customerId = created.id
        }
      }

      const checkout = await db.checkoutPage.create({
        data: {
          token: randomToken(16),
          title,
          amount,
          customerId,
          customerPhone: phone || null,
          status: 'PENDING',
          expiresAt: new Date(Date.now() + 24 * 3600_000), // 24h
        },
      })
      await upsertSetting('setupStep', '4')
      await logActivity(me, 'wizard.step_checkout', `checkout:${checkout.id}`, {
        title,
        amount,
        customerPhone: phone || null,
      })
      return Response.json({ token: checkout.token }, { status: 201 })
    }

    throw new HttpError(400, 'Unknown wizard step')
  } catch (err) {
    return jsonError(err)
  }
}
