import { requireRole, jsonError, HttpError } from '@/lib/auth'
import { DEV_ROLES } from '@/lib/roles'

// ── Developer Console: POST API explorer ─────────────────────────────────────
// Executes an INTERNAL admin API call (GET/POST /api/admin/*) by fetching
// `${origin}${path}` while forwarding the caller's own session cookie, so the
// probe runs under the same authenticated identity. External URLs are never
// allowed; the whitelist is /api/admin/* only (dev/* self-loop blocked too).

const MAX_BODY_BYTES = 20_000

/** Validate + normalize an internal path. Returns null when not allowed. */
function normalizePath(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  let p = raw.trim()
  if (!p || /\s/.test(p)) return null
  if (/^https?:\/\//i.test(p) || p.startsWith('//')) return null // external URLs never allowed
  p = p.replaceAll('../', '') // strip traversal attempts, then re-validate
  p = p.replace(/\/{2,}/g, '/')
  if (!p.startsWith('/api/admin/')) return null
  if (p === '/api/admin/dev' || p.startsWith('/api/admin/dev/')) return null // no self-recursion
  try {
    const u = new URL(p, 'http://internal')
    if (u.pathname.startsWith('/api/admin/') && (u.pathname === '/api/admin/dev' || u.pathname.startsWith('/api/admin/dev/'))) return null
    return `${u.pathname}${u.search}`
  } catch {
    return null
  }
}

export async function POST(req: Request) {
  try {
    await requireRole(DEV_ROLES)
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>

    const method = typeof b.method === 'string' ? b.method.toUpperCase() : 'GET'
    if (method !== 'GET' && method !== 'POST') throw new HttpError(400, 'method must be GET or POST')

    const path = normalizePath(b.path)
    if (!path) throw new HttpError(400, 'Only internal GET/POST /api/admin/* paths are allowed')

    let body: string | undefined
    if (method === 'POST' && b.body !== undefined && b.body !== null && b.body !== '') {
      if (typeof b.body === 'string') {
        try {
          JSON.parse(b.body)
          body = b.body
        } catch {
          throw new HttpError(400, 'Request body is not valid JSON')
        }
      } else if (typeof b.body === 'object') {
        body = JSON.stringify(b.body)
      } else {
        throw new HttpError(400, 'Request body must be JSON')
      }
    }

    const origin = new URL(req.url).origin
    const started = Date.now()

    const headers: Record<string, string> = {
      // Forward the caller's own session so the probe is authenticated identically
      cookie: req.headers.get('cookie') ?? '',
    }
    if (body !== undefined) headers['content-type'] = 'application/json'

    let res: Response
    try {
      res = await fetch(`${origin}${path}`, {
        method,
        headers,
        body,
        signal: AbortSignal.timeout(15_000),
      })
    } catch {
      throw new HttpError(504, 'Internal request timed out or failed')
    }

    const durationMs = Date.now() - started
    const raw = await res.text()

    let parsed: unknown = null
    let isJson = false
    try {
      parsed = JSON.parse(raw)
      isJson = true
    } catch {
      parsed = raw.slice(0, MAX_BODY_BYTES)
    }

    let truncated = false
    if (isJson) {
      const full = JSON.stringify(parsed)
      if (full.length > MAX_BODY_BYTES) {
        // Keep it inspectable: return the raw (cut) text instead of broken JSON
        parsed = raw.slice(0, MAX_BODY_BYTES)
        isJson = false
        truncated = true
      }
    } else if (raw.length > MAX_BODY_BYTES) {
      truncated = true
    }

    return Response.json({
      status: res.status,
      ok: res.ok,
      durationMs,
      contentType: isJson ? 'application/json' : 'text',
      body: parsed,
      truncated,
    })
  } catch (err) {
    return jsonError(err)
  }
}
