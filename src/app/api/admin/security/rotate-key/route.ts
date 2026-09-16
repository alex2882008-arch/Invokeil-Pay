import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError, logActivity, generateKey } from '@/lib/auth'

// ── Security Center v2: rotate a store API key ───────────────────────────────
// POST { keyId, storeId } → { key (NEW plaintext, shown once), oldKey, graceHours: 24 }
// Creates a replacement sk_live key and locks the old one with a 24-hour grace window.

const ROTATE_ROLES = ['OWNER', 'ADMIN', 'DEVELOPER'] as const
const GRACE_HOURS = 24

export async function POST(req: Request) {
  try {
    const me = await requireRole([...ROTATE_ROLES])
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>

    const keyId = typeof b.keyId === 'string' ? b.keyId : ''
    const storeId = typeof b.storeId === 'string' ? b.storeId : ''
    if (!keyId || !storeId) throw new HttpError(400, 'keyId and storeId are required')

    const old = await db.apiKey.findUnique({ where: { id: keyId } })
    if (!old || old.storeId !== storeId) throw new HttpError(404, 'API key not found for this store')
    if (old.locked) throw new HttpError(400, 'This key is already locked — rotate its replacement instead')

    const expiresGrace = new Date(Date.now() + GRACE_HOURS * 3600_000)

    // New replacement key (plaintext stored by existing convention; shown once in the response)
    const created = await db.apiKey.create({
      data: {
        storeId,
        name: old.name,
        key: generateKey('sk_live'),
        scopes: old.scopes,
        sandbox: old.sandbox,
        rotatedFrom: old.id,
        expiresAt: old.expiresAt,
        active: true,
      },
    })

    // Old key: locked immediately, hard-expires after the grace window
    const oldUpdated = await db.apiKey.update({
      where: { id: old.id },
      data: { locked: true, expiresAt: expiresGrace },
    })

    await logActivity(me, 'security.key_rotated', `apikey:${old.id}`, {
      storeId,
      newKeyId: created.id,
      graceHours: GRACE_HOURS,
    })

    return Response.json({
      key: {
        id: created.id,
        name: created.name,
        key: created.key,
        scopes: created.scopes,
        sandbox: created.sandbox,
        rotatedFrom: created.rotatedFrom,
        createdAt: created.createdAt,
      },
      oldKey: { id: oldUpdated.id, locked: oldUpdated.locked, expiresAt: oldUpdated.expiresAt },
      graceHours: GRACE_HOURS,
    })
  } catch (err) {
    return jsonError(err)
  }
}
