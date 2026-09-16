import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError, logActivity } from '@/lib/auth'
import { OPS_ROLES } from '@/lib/roles'

// ── Admin: KYC state machine ─────────────────────────────────────────────────
// PATCH { action: 'submit' | 'verify' | 'reject' | 'expire', reviewerNote? } → { profile }
// Transitions:
//   submit:  PENDING | REJECTED | EXPIRED → SUBMITTED (submittedAt)
//   verify:  SUBMITTED → VERIFIED (reviewedAt, expiresAt = +1 year)
//   reject:  PENDING | SUBMITTED → REJECTED (reviewedAt)
//   expire:  VERIFIED → EXPIRED

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const me = await requireRole([...OPS_ROLES])
    const { id } = await params
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>

    const profile = await db.kycProfile.findUnique({ where: { id } })
    if (!profile) throw new HttpError(404, 'KYC profile not found')

    const action = String(b.action ?? '')
    const now = new Date()
    const data: Record<string, unknown> = {}

    if (action === 'submit') {
      if (!['PENDING', 'REJECTED', 'EXPIRED'].includes(profile.status)) {
        throw new HttpError(400, 'Only pending, rejected or expired profiles can be submitted')
      }
      data.status = 'SUBMITTED'
      data.submittedAt = now
    } else if (action === 'verify') {
      if (profile.status !== 'SUBMITTED') {
        throw new HttpError(400, 'Only submitted profiles can be verified')
      }
      data.status = 'VERIFIED'
      data.reviewedAt = now
      data.expiresAt = new Date(now.getTime() + 365 * 86400_000)
    } else if (action === 'reject') {
      if (!['PENDING', 'SUBMITTED'].includes(profile.status)) {
        throw new HttpError(400, 'Only pending or submitted profiles can be rejected')
      }
      data.status = 'REJECTED'
      data.reviewedAt = now
    } else if (action === 'expire') {
      if (profile.status !== 'VERIFIED') {
        throw new HttpError(400, 'Only verified profiles can be expired')
      }
      data.status = 'EXPIRED'
    } else {
      throw new HttpError(400, "action must be 'submit', 'verify', 'reject' or 'expire'")
    }

    if (typeof b.reviewerNote === 'string' && b.reviewerNote.trim()) {
      data.reviewerNote = b.reviewerNote.trim().slice(0, 1000)
    }

    const updated = await db.kycProfile.update({ where: { id }, data })

    await logActivity(me, `kyc.${action}`, `kyc:${id}`, {
      legalName: profile.legalName,
      from: profile.status,
      to: updated.status,
    })
    return Response.json({ profile: updated })
  } catch (err) {
    return jsonError(err)
  }
}
