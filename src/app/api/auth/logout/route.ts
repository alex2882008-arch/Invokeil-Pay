import { clearSessionCookie, jsonError } from '@/lib/auth'

export async function POST() {
  try {
    await clearSessionCookie()
    return Response.json({ ok: true })
  } catch (err) {
    return jsonError(err)
  }
}
