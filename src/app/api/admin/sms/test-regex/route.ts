import { requireRole, jsonError } from '@/lib/auth'

/**
 * Regex sandbox for the SMS Center: test a custom parser pattern against a
 * sample body.
 * POST { pattern, sample } →
 *   { valid: true, matches: sample.match(re), groups: (re.exec(sample) || []).slice(1) }
 *   | 400 { valid: false, error }
 */
export async function POST(req: Request) {
  try {
    await requireRole(['ADMIN', 'AGENT'])
    const body = (await req.json().catch(() => null)) as { pattern?: unknown; sample?: unknown } | null
    const pattern = typeof body?.pattern === 'string' ? body.pattern : ''
    const sample = typeof body?.sample === 'string' ? body.sample : ''

    if (!pattern.trim()) {
      return Response.json({ valid: false, error: 'pattern is required' }, { status: 400 })
    }
    if (pattern.length > 2000) {
      return Response.json({ valid: false, error: 'pattern too long (max 2000 chars)' }, { status: 400 })
    }
    if (sample.length > 20_000) {
      return Response.json({ valid: false, error: 'sample too long (max 20000 chars)' }, { status: 400 })
    }

    let re: RegExp
    try {
      re = new RegExp(pattern)
    } catch (e) {
      return Response.json(
        { valid: false, error: `Invalid regex: ${e instanceof Error ? e.message : 'parse error'}` },
        { status: 400 }
      )
    }

    const matches = sample.match(re)
    const exec = re.exec(sample)
    return Response.json({
      valid: true,
      matches,
      groups: exec ? exec.slice(1) : [],
    })
  } catch (err) {
    return jsonError(err)
  }
}
