import { db } from '@/lib/db'
import { logActivity } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * Public contact / grievance endpoint — no auth.
 * Stores an ActivityLog row (action 'public.contact') and returns a ticket ref.
 * Spam defences: honeypot field + in-memory IP throttle (5 per hour).
 */

const RATE_LIMIT = 5
const RATE_WINDOW_MS = 60 * 60 * 1000
const hits = new Map<string, number[]>()

function throttled(ip: string): boolean {
  const now = Date.now()
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS)
  if (arr.length >= RATE_LIMIT) { hits.set(ip, arr); return true }
  arr.push(now)
  hits.set(ip, arr)
  return false
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: Request) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1'
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>

    // Honeypot: bots fill every field. Pretend success, store nothing.
    const honeypot = typeof body.website === 'string' ? body.website.trim() : ''
    if (honeypot) {
      return Response.json({ ok: true, data: { ref: null } }, { status: 201 })
    }

    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 120) : ''
    const email = typeof body.email === 'string' ? body.email.trim().slice(0, 160) : ''
    const subject = typeof body.subject === 'string' ? body.subject.trim().slice(0, 200) : ''
    const plan = typeof body.plan === 'string' ? body.plan.trim().slice(0, 40) : ''
    const message = typeof body.message === 'string' ? body.message.trim().slice(0, 4000) : ''

    if (name.length < 2) {
      return Response.json({ ok: false, error: 'Please tell us your name (at least 2 characters).' }, { status: 400 })
    }
    if (!EMAIL_RE.test(email)) {
      return Response.json({ ok: false, error: 'Please provide a valid email address so we can reply.' }, { status: 400 })
    }
    if (message.length < 10) {
      return Response.json({ ok: false, error: 'Please describe your question in at least 10 characters.' }, { status: 400 })
    }
    if (throttled(ip)) {
      return Response.json({ ok: false, error: 'Too many messages from this address — try again in an hour, or email us directly.' }, { status: 429 })
    }

    const row = await db.activityLog.create({
      data: {
        userId: null,
        actorName: name,
        action: 'public.contact',
        target: `email:${email}`,
        meta: JSON.stringify({
          subject: subject || 'General enquiry',
          plan: plan || undefined,
          message,
          source: 'site.contact',
        }),
        ip,
        userAgent: req.headers.get('user-agent')?.slice(0, 250) ?? null,
      },
    })

    await logActivity(null, 'public.contact.received', `contact:${row.id}`, { email, subject })

    return Response.json({ ok: true, data: { ref: row.id } }, { status: 201 })
  } catch {
    return Response.json({ ok: false, error: 'Could not send right now — please email us directly.' }, { status: 500 })
  }
}
