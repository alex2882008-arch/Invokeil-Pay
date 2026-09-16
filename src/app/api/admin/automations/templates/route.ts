import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError, logActivity } from '@/lib/auth'
import { WORKFLOW_TEMPLATES } from '@/lib/automation-engine'

// ── Admin: workflow template gallery ─────────────────────────────────────────
// GET  → { templates } (6 one-click recipes from the automation engine)
// POST { key } → install the template as a builtIn Automation row
//                (409 when an automation with the same name already exists)

export async function GET() {
  try {
    await requireRole(['OWNER', 'ADMIN', 'DEVELOPER', 'FINANCE', 'SUPPORT', 'AGENT', 'VIEWER'])
    return Response.json({
      templates: WORKFLOW_TEMPLATES.map((t) => ({
        key: t.key,
        name: t.name,
        description: t.description,
        trigger: t.trigger,
        conditions: t.conditions,
        actions: t.actions,
      })),
    })
  } catch (err) {
    return jsonError(err)
  }
}

export async function POST(req: Request) {
  try {
    const me = await requireRole(['OWNER', 'ADMIN'])
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    if (!body || typeof body !== 'object') throw new HttpError(400, 'Invalid JSON body')

    const key = typeof body.key === 'string' ? body.key.trim() : ''
    const template = WORKFLOW_TEMPLATES.find((t) => t.key === key)
    if (!template) throw new HttpError(404, 'Template not found')

    const duplicate = await db.automation.findFirst({ where: { name: template.name }, select: { id: true } })
    if (duplicate) {
      throw new HttpError(409, `Template already installed ("${template.name}")`)
    }

    const automation = await db.automation.create({
      data: {
        name: template.name,
        description: template.description,
        trigger: template.trigger,
        conditions: JSON.stringify(template.conditions ?? []),
        actions: JSON.stringify(template.actions ?? []),
        enabled: true,
        builtIn: true,
      },
    })
    await logActivity(me, 'automation.template_installed', automation.id, {
      templateKey: template.key,
      name: template.name,
      trigger: template.trigger,
    })
    return Response.json({ automation }, { status: 201 })
  } catch (err) {
    return jsonError(err)
  }
}
