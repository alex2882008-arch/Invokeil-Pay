import { getSessionUser, jsonError } from '@/lib/auth'

export async function GET() {
  try {
    const user = await getSessionUser()
    return Response.json({ user })
  } catch (err) {
    return jsonError(err)
  }
}
