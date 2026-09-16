import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError, logActivity } from '@/lib/auth'
import { OPS_ROLES } from '@/lib/roles'

// ── Admin: KYC / KYB profiles ────────────────────────────────────────────────
// GET  ?status → { items(documents parsed), counts, expiryReminders (verified, expiring ≤30d) }
// POST { entityType, legalName, contactEmail?, contactPhone?, documents?[] } → { profile }

const KYC_READ_ROLES = ['OWNER', 'ADMIN', 'SUPPORT', 'FINANCE'] as const
const ENTITY_TYPES = ['INDIVIDUAL', 'BUSINESS'] as const
const STATUSES = ['PENDING', 'SUBMITTED', 'VERIFIED', 'REJECTED', 'EXPIRED'] as const

function parseDocuments(raw: string): Array<Record<string, string>> {
  try {
    const v = JSON.parse(raw) as unknown
    if (!Array.isArray(v)) return []
    return v
      .filter((d): d is Record<string, unknown> => !!d && typeof d === 'object' && !Array.isArray(d))
      .map((d) => ({
        type: typeof d.type === 'string' ? d.type : '',
        name: typeof d.name === 'string' ? d.name : '',
        url: typeof d.url === 'string' ? d.url : '',
        ref: typeof d.ref === 'string' ? d.ref : '',
      }))
  } catch {
    return []
  }
}

function sanitizeDocuments(input: unknown): string {
  const arr = Array.isArray(input) ? input : []
  const docs = arr
    .filter((d): d is Record<string, unknown> => !!d && typeof d === 'object' && !Array.isArray(d))
    .map((d) => ({
      type: typeof d.type === 'string' ? d.type.slice(0, 80) : '',
      name: typeof d.name === 'string' ? d.name.slice(0, 160) : '',
      url: typeof d.url === 'string' ? d.url.slice(0, 500) : '',
      ref: typeof d.ref === 'string' ? d.ref.slice(0, 160) : '',
    }))
    .filter((d) => d.type || d.name || d.url || d.ref)
  return JSON.stringify(docs)
}

export async function GET(req: Request) {
  try {
    await requireRole([...KYC_READ_ROLES])
    const url = new URL(req.url)
    const status = url.searchParams.get('status')

    const where: Record<string, unknown> = {}
    if (status && (STATUSES as readonly string[]).includes(status)) where.status = status

    const in30d = new Date(Date.now() + 30 * 86400_000)
    const [items, pending, submitted, verified, rejected, expired, reminders] = await Promise.all([
      db.kycProfile.findMany({ where, orderBy: { updatedAt: 'desc' } }),
      db.kycProfile.count({ where: { status: 'PENDING' } }),
      db.kycProfile.count({ where: { status: 'SUBMITTED' } }),
      db.kycProfile.count({ where: { status: 'VERIFIED' } }),
      db.kycProfile.count({ where: { status: 'REJECTED' } }),
      db.kycProfile.count({ where: { status: 'EXPIRED' } }),
      db.kycProfile.findMany({
        where: { status: 'VERIFIED', expiresAt: { not: null, lte: in30d, gte: new Date() } },
        orderBy: { expiresAt: 'asc' },
      }),
    ])

    return Response.json({
      items: items.map((p) => ({ ...p, documents: parseDocuments(p.documents) })),
      counts: { pending, submitted, verified, rejected, expired },
      expiryReminders: reminders.map((p) => ({
        id: p.id,
        legalName: p.legalName,
        contactEmail: p.contactEmail,
        contactPhone: p.contactPhone,
        expiresAt: p.expiresAt,
      })),
    })
  } catch (err) {
    return jsonError(err)
  }
}

export async function POST(req: Request) {
  try {
    const me = await requireRole([...OPS_ROLES])
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>

    const entityType = String(b.entityType ?? 'INDIVIDUAL')
    if (!(ENTITY_TYPES as readonly string[]).includes(entityType)) {
      throw new HttpError(400, 'entityType must be INDIVIDUAL or BUSINESS')
    }
    const legalName = typeof b.legalName === 'string' ? b.legalName.trim() : ''
    if (!legalName) throw new HttpError(400, 'Legal name is required')

    const contactEmail = typeof b.contactEmail === 'string' && b.contactEmail.trim() ? b.contactEmail.trim() : null
    const contactPhone = typeof b.contactPhone === 'string' && b.contactPhone.trim() ? b.contactPhone.trim() : null

    const profile = await db.kycProfile.create({
      data: {
        entityType,
        legalName,
        contactEmail,
        contactPhone,
        documents: sanitizeDocuments(b.documents),
        status: 'PENDING',
      },
    })

    await logActivity(me, 'kyc.created', `kyc:${profile.id}`, { legalName, entityType })
    return Response.json(
      { profile: { ...profile, documents: parseDocuments(profile.documents) } },
      { status: 201 }
    )
  } catch (err) {
    return jsonError(err)
  }
}
