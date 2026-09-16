import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError, logActivity, safeInt } from '@/lib/auth'
import { FINANCE_ROLES } from '@/lib/roles'
import { getMergedSettings } from '@/lib/settings-defaults'

// ── Admin: Maker–Checker approval requests ───────────────────────────────────
// GET  ?status&type&page → { items(payload parsed), total, page, pages, counts, thresholdAmount }
// POST { type, summary, payload?, thresholdAmount? } → { approval }

const APPROVAL_TYPES = ['REFUND', 'PAYOUT', 'API_KEY', 'GATEWAY_CHANGE', 'SETTING', 'EMAIL_PROVIDER'] as const
const APPROVAL_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED'] as const
const PAGE_SIZE = 20

function parsePayload(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw) as unknown
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

export async function GET(req: Request) {
  try {
    await requireRole([...FINANCE_ROLES])
    const url = new URL(req.url)

    const status = url.searchParams.get('status')
    const type = url.searchParams.get('type')
    const page = safeInt(url.searchParams.get('page'), 1)

    const where: Record<string, unknown> = {}
    if (status && (APPROVAL_STATUSES as readonly string[]).includes(status)) where.status = status
    if (type && (APPROVAL_TYPES as readonly string[]).includes(type)) where.type = type

    const [total, pending, approved, rejected, expired, items, settings] = await Promise.all([
      db.approvalRequest.count({ where }),
      db.approvalRequest.count({ where: { status: 'PENDING' } }),
      db.approvalRequest.count({ where: { status: 'APPROVED' } }),
      db.approvalRequest.count({ where: { status: 'REJECTED' } }),
      db.approvalRequest.count({ where: { status: 'EXPIRED' } }),
      db.approvalRequest.findMany({
        where,
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      getMergedSettings(),
    ])

    return Response.json({
      items: items.map((a) => ({ ...a, payload: parsePayload(a.payload) })),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      counts: { pending, approved, rejected, expired },
      thresholdAmount: Number(settings.approvalThresholdAmount) || 0,
    })
  } catch (err) {
    return jsonError(err)
  }
}

export async function POST(req: Request) {
  try {
    const me = await requireRole([...FINANCE_ROLES])
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>

    const type = String(b.type ?? '')
    if (!(APPROVAL_TYPES as readonly string[]).includes(type)) {
      throw new HttpError(400, 'Unknown approval type')
    }
    const summary = typeof b.summary === 'string' ? b.summary.trim() : ''
    if (!summary) throw new HttpError(400, 'Summary is required')
    if (b.payload !== undefined && (typeof b.payload !== 'object' || b.payload === null || Array.isArray(b.payload))) {
      throw new HttpError(400, 'Payload must be a JSON object')
    }

    let thresholdAmount: number | null = null
    if (b.thresholdAmount !== undefined && b.thresholdAmount !== null && b.thresholdAmount !== '') {
      const n = Number(b.thresholdAmount)
      if (!Number.isFinite(n) || n < 0) throw new HttpError(400, 'Threshold amount must be a number ≥ 0')
      thresholdAmount = n
    }

    const approval = await db.approvalRequest.create({
      data: {
        type,
        summary,
        payload: JSON.stringify(b.payload ?? {}),
        thresholdAmount,
        status: 'PENDING',
        requestedByName: me.name,
      },
    })

    await logActivity(me, 'approval.requested', `approval:${approval.id}`, { type, summary: summary.slice(0, 120) })
    return Response.json({ approval: { ...approval, payload: parsePayload(approval.payload) } }, { status: 201 })
  } catch (err) {
    return jsonError(err)
  }
}
