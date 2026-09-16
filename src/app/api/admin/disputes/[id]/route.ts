import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError, logActivity } from '@/lib/auth'
import { FINANCE_ROLES } from '@/lib/roles'

/**
 * Dispute detail + lifecycle.
 * GET   → dispute (parsed messages/evidence) + transaction summary
 * PATCH {action:'status', status, note?}    → OPEN→UNDER_REVIEW→WON/LOST/CANCELLED
 * PATCH {action:'evidence', evidence:[…]}   → append evidence items
 * POST  {message}                           → append to the message thread
 */

type RouteCtx = { params: Promise<{ id: string }> }
const WRITE_ROLES = FINANCE_ROLES
const READ_ROLES = [...FINANCE_ROLES, 'SUPPORT'] as Array<'OWNER' | 'ADMIN' | 'FINANCE' | 'SUPPORT'>

type NoteEntry = { by: string; at: string; body: string }
type EvidenceItem = { name: string; url: string; ref?: string }

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback
  try {
    const v = JSON.parse(raw) as T
    return v ?? fallback
  } catch {
    return fallback
  }
}

function appendEntry(raw: string | null, entry: NoteEntry): string {
  return JSON.stringify([...parseJson<NoteEntry[]>(raw, []), entry])
}

/** Allowed dispute transitions (OPEN→UNDER_REVIEW→WON/LOST/CANCELLED, cancel from either). */
const TRANSITIONS: Record<string, string[]> = {
  OPEN: ['UNDER_REVIEW', 'CANCELLED'],
  UNDER_REVIEW: ['WON', 'LOST', 'CANCELLED'],
}

// ── GET: detail ──────────────────────────────────────────────────────────────
export async function GET(_req: Request, { params }: RouteCtx) {
  try {
    await requireRole(READ_ROLES)
    const { id } = await params
    const dispute = await db.dispute.findUnique({
      where: { id },
      include: {
        transaction: {
          select: {
            id: true, trxId: true, mfs: true, gatewayCode: true, amount: true, status: true,
            senderNumber: true, senderName: true, occurredAt: true, customerId: true,
          },
        },
      },
    })
    if (!dispute) throw new HttpError(404, 'Dispute not found')
    return Response.json({
      dispute: {
        ...dispute,
        evidence: parseJson<EvidenceItem[]>(dispute.evidence, []),
        messages: parseJson<NoteEntry[]>(dispute.messages, []),
        notes: parseJson<NoteEntry[]>(dispute.notes, []),
      },
    })
  } catch (err) {
    return jsonError(err)
  }
}

// ── PATCH: status transitions / evidence append ──────────────────────────────
export async function PATCH(req: Request, { params }: RouteCtx) {
  try {
    const me = await requireRole(WRITE_ROLES)
    const { id } = await params
    const body: unknown = await req.json().catch(() => ({}))
    const b = (body ?? {}) as Record<string, unknown>
    const action = typeof b.action === 'string' ? b.action : ''

    const dispute = await db.dispute.findUnique({ where: { id } })
    if (!dispute) throw new HttpError(404, 'Dispute not found')
    const now = new Date()

    if (action === 'status') {
      const next = typeof b.status === 'string' ? b.status : ''
      const allowed = TRANSITIONS[dispute.status]
      if (!allowed) throw new HttpError(400, 'This dispute is already resolved')
      if (!allowed.includes(next)) {
        throw new HttpError(400, `From ${dispute.status} you can move to: ${allowed.join(', ')}`)
      }
      const note = typeof b.note === 'string' ? b.note.trim() : ''
      const updated = await db.dispute.update({
        where: { id },
        data: {
          status: next,
          ...(next === 'WON' || next === 'LOST' ? { resolvedAt: now } : {}),
          notes: appendEntry(dispute.notes, {
            by: me.name,
            at: now.toISOString(),
            body: `Status → ${next.replaceAll('_', ' ')}${note ? `: ${note}` : ''}`,
          }),
        },
      })
      await logActivity(me, 'dispute.status', id, { status: next, note })
      return Response.json({ ok: true, dispute: updated })
    }

    if (action === 'evidence') {
      const incoming = Array.isArray(b.evidence) ? b.evidence : []
      const items: EvidenceItem[] = []
      for (const item of incoming) {
        if (!item || typeof item !== 'object') continue
        const o = item as Record<string, unknown>
        const name = typeof o.name === 'string' ? o.name.trim() : ''
        const url = typeof o.url === 'string' ? o.url.trim() : ''
        if (!name || !url) continue
        const ref = typeof o.ref === 'string' && o.ref.trim() !== '' ? o.ref.trim() : undefined
        items.push(ref ? { name, url, ref } : { name, url })
      }
      if (items.length === 0) throw new HttpError(400, 'Each evidence item needs at least a name and a URL')

      const merged = [...parseJson<EvidenceItem[]>(dispute.evidence, []), ...items]
      const updated = await db.dispute.update({
        where: { id },
        data: {
          evidence: JSON.stringify(merged),
          notes: appendEntry(dispute.notes, {
            by: me.name,
            at: now.toISOString(),
            body: `Evidence added: ${items.map((i) => i.name).join(', ')}`,
          }),
        },
      })
      await logActivity(me, 'dispute.evidence', id, { count: items.length })
      return Response.json({ ok: true, evidence: merged, dispute: updated })
    }

    throw new HttpError(400, 'Unknown action')
  } catch (err) {
    return jsonError(err)
  }
}

// ── POST: append message to the thread ───────────────────────────────────────
export async function POST(req: Request, { params }: RouteCtx) {
  try {
    const me = await requireRole(WRITE_ROLES)
    const { id } = await params
    const body: unknown = await req.json().catch(() => ({}))
    const b = (body ?? {}) as Record<string, unknown>
    const message = typeof b.message === 'string' ? b.message.trim() : ''
    if (!message) throw new HttpError(400, 'Message text is required')

    const dispute = await db.dispute.findUnique({ where: { id } })
    if (!dispute) throw new HttpError(404, 'Dispute not found')

    const entry: NoteEntry = { by: me.name, at: new Date().toISOString(), body: message }
    const messages = [...parseJson<NoteEntry[]>(dispute.messages, []), entry]
    await db.dispute.update({ where: { id }, data: { messages: JSON.stringify(messages) } })
    await logActivity(me, 'dispute.message', id)

    return Response.json({ ok: true, messages })
  } catch (err) {
    return jsonError(err)
  }
}
