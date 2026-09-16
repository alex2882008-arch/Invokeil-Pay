import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError, logActivity, sha256 } from '@/lib/auth'

// ── Security Center v2: my passkeys ──────────────────────────────────────────
// GET  → { passkeys }                     (active, userId = me)
// POST { label, credentialId } → { passkey }   (client-generated WebAuthn id or device-label fallback)

const ALL_ROLES = ['OWNER', 'ADMIN', 'DEVELOPER', 'FINANCE', 'SUPPORT', 'AGENT', 'VIEWER'] as const

export async function GET() {
  try {
    const me = await requireRole([...ALL_ROLES])
    const passkeys = await db.passkey.findMany({
      where: { userId: me.id, active: true },
      orderBy: { createdAt: 'desc' },
      select: { id: true, label: true, credentialId: true, lastUsedAt: true, createdAt: true },
    })
    return Response.json({ passkeys })
  } catch (err) {
    return jsonError(err)
  }
}

export async function POST(req: Request) {
  try {
    const me = await requireRole([...ALL_ROLES])
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>

    const label = typeof b.label === 'string' ? b.label.trim() : ''
    const credentialId = typeof b.credentialId === 'string' ? b.credentialId.trim() : ''

    if (!label) throw new HttpError(400, 'Passkey label is required')
    if (!credentialId) throw new HttpError(400, 'credentialId is required')
    if (credentialId.length > 512) throw new HttpError(400, 'credentialId is too long')

    const passkey = await db.passkey
      .create({
        data: {
          userId: me.id,
          label: label.slice(0, 120),
          credentialId,
          // Real WebAuthn public keys are enrolled by the browser flow; until a full
          // attestation chain exists we store a deterministic placeholder digest.
          publicKey: sha256(credentialId),
          active: true,
        },
      })
      .catch((e: { code?: string }) => {
        if (e?.code === 'P2002') throw new HttpError(409, 'This passkey is already registered')
        throw e
      })

    await logActivity(me, 'security.passkey_added', `passkey:${passkey.id}`, { label: passkey.label })
    return Response.json(
      {
        passkey: {
          id: passkey.id,
          label: passkey.label,
          credentialId: passkey.credentialId,
          lastUsedAt: passkey.lastUsedAt,
          createdAt: passkey.createdAt,
        },
      },
      { status: 201 }
    )
  } catch (err) {
    return jsonError(err)
  }
}
