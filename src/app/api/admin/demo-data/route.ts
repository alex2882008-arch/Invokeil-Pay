import { db } from '@/lib/db'
import { requireRole, jsonError } from '@/lib/auth'
import { seedDemoData, clearDemoData, isDemoSeeded } from '@/lib/seed'

export async function GET() {
  try {
    await requireRole(['ADMIN', 'AGENT', 'VIEWER'])
    return Response.json({ demoSeeded: await isDemoSeeded() })
  } catch (err) {
    return jsonError(err)
  }
}

/** POST = regenerate demo data, DELETE = remove all demo data. */
export async function POST() {
  try {
    await requireRole(['ADMIN'])
    await clearDemoData()
    await seedDemoData()
    return Response.json({ ok: true, demoSeeded: true })
  } catch (err) {
    return jsonError(err)
  }
}

export async function DELETE() {
  try {
    await requireRole(['ADMIN'])
    await clearDemoData()
    return Response.json({ ok: true, demoSeeded: false })
  } catch (err) {
    return jsonError(err)
  }
}

void db
