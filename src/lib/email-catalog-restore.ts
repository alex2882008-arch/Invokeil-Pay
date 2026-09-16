/**
 * Re-seeds missing built-in email templates from the 320-template catalog.
 * Shared by POST /api/admin/email/templates (action=restore) and
 * POST /api/admin/email/templates/restore.
 */
import { db } from '@/lib/db'
import { generateEmailCatalog } from '@/lib/email-catalog'

export async function restoreCatalogTemplates(force: boolean): Promise<{ created: number; updated: number; skipped: number }> {
  const catalog = generateEmailCatalog()
  let created = 0
  let updated = 0
  let skipped = 0
  for (const tpl of catalog) {
    const existing = await db.emailTemplate.findUnique({ where: { key: tpl.key } })
    if (!existing) {
      await db.emailTemplate.create({
        data: {
          key: tpl.key,
          name: tpl.name,
          category: tpl.category,
          event: tpl.event,
          locale: tpl.locale,
          tone: tpl.tone,
          subject: tpl.subject,
          bodyHtml: tpl.bodyHtml,
          variables: JSON.stringify(tpl.variables),
          builtin: true,
        },
      })
      created++
    } else if (force) {
      await db.emailTemplate.update({
        where: { key: tpl.key },
        data: {
          name: tpl.name,
          category: tpl.category,
          event: tpl.event,
          locale: tpl.locale,
          tone: tpl.tone,
          subject: tpl.subject,
          bodyHtml: tpl.bodyHtml,
          variables: JSON.stringify(tpl.variables),
          builtin: true,
        },
      })
      updated++
    } else {
      skipped++
    }
  }
  return { created, updated, skipped }
}
