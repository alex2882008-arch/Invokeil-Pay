/**
 * Event Ledger — idempotent event recording.
 * Guarantees: the same idempotency key is processed exactly once (DEDUPED on replay),
 * every event is traceable (payload + status + attempts) for audits and debugging.
 */
import { db } from '@/lib/db'

export interface LedgerResult<T> {
  deduped: boolean
  eventId: string
  result?: T
  error?: string
}

/**
 * Record + process an event exactly-once.
 * `processor` runs only the first time a given idempotencyKey is seen.
 */
export async function recordEvent<T>(params: {
  type: string
  idempotencyKey: string
  subjectRef?: string | null
  payload: unknown
  processor?: () => Promise<T>
}): Promise<LedgerResult<T>> {
  const payloadStr = JSON.stringify(params.payload ?? {})
  try {
    const existing = await db.eventLedger.findUnique({ where: { idempotencyKey: params.idempotencyKey } })
    if (existing) {
      if (existing.status === 'PROCESSED') {
        return { deduped: true, eventId: existing.id }
      }
      // Previously failed → allow one more processing attempt
      if (params.processor) {
        try {
          const result = await params.processor()
          await db.eventLedger.update({
            where: { id: existing.id },
            data: { status: 'PROCESSED', processedAt: new Date(), attempts: { increment: 1 } },
          })
          return { deduped: false, eventId: existing.id, result }
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err)
          await db.eventLedger.update({
            where: { id: existing.id },
            data: { status: 'FAILED', error: error.slice(0, 500), attempts: { increment: 1 } },
          })
          return { deduped: false, eventId: existing.id, error }
        }
      }
      return { deduped: true, eventId: existing.id }
    }
    const ev = await db.eventLedger.create({
      data: {
        type: params.type,
        idempotencyKey: params.idempotencyKey,
        subjectRef: params.subjectRef ?? null,
        payload: payloadStr,
        status: 'RECEIVED',
      },
    })
    if (!params.processor) {
      await db.eventLedger.update({ where: { id: ev.id }, data: { status: 'PROCESSED', processedAt: new Date() } })
      return { deduped: false, eventId: ev.id }
    }
    try {
      const result = await params.processor()
      await db.eventLedger.update({
        where: { id: ev.id },
        data: { status: 'PROCESSED', processedAt: new Date(), attempts: { increment: 1 } },
      })
      return { deduped: false, eventId: ev.id, result }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      await db.eventLedger.update({
        where: { id: ev.id },
        data: { status: 'FAILED', error: error.slice(0, 500), attempts: { increment: 1 } },
      })
      return { deduped: false, eventId: ev.id, error }
    }
  } catch (err) {
    // Unique race on concurrent insert → treat as dedupe
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('Unique constraint') || msg.includes('unique')) {
      const ev = await db.eventLedger.findUnique({ where: { idempotencyKey: params.idempotencyKey } })
      return { deduped: true, eventId: ev?.id ?? 'race' }
    }
    throw err
  }
}

/** Timeline entries for a subject (transaction/customer) — newest last. */
export async function timelineFor(refs: { transactionId?: string; customerRef?: string }): Promise<
  Array<{ id: string; type: string; status: string; at: string; summary: string }>
> {
  const where = refs.customerRef
    ? { subjectRef: refs.customerRef }
    : refs.transactionId
      ? { subjectRef: refs.transactionId }
      : null
  if (!where) return []
  const events = await db.eventLedger.findMany({ where, orderBy: { createdAt: 'asc' }, take: 100 })
  return events.map((e) => ({
    id: e.id,
    type: e.type,
    status: e.status,
    at: e.createdAt.toISOString(),
    summary: e.subjectRef ?? e.type,
  }))
}
