import { db } from '@/lib/db'
import { requireRole, jsonError, HttpError, logActivity } from '@/lib/auth'
import { DEV_ROLES } from '@/lib/roles'
import { encryptJson, decryptJson, maskConfig } from '@/lib/providers/vault'

// ── Built-in marketplace catalog (seeded on first GET) ───────────────────────

type AppField = { name: string; secret: boolean }

const BUILTIN_APPS: Array<{ key: string; name: string; category: string; description: string; fields: AppField[] }> = [
  { key: 'woocommerce', name: 'WooCommerce', category: 'ECOMMERCE', description: 'Send payment confirmations into WooCommerce orders and mark them paid automatically.', fields: [{ name: 'storeUrl', secret: false }, { name: 'consumerKey', secret: true }, { name: 'consumerSecret', secret: true }] },
  { key: 'shopify', name: 'Shopify', category: 'ECOMMERCE', description: 'Sync paid orders and payment status with your Shopify storefront.', fields: [{ name: 'storeUrl', secret: false }, { name: 'apiKey', secret: true }, { name: 'apiSecret', secret: true }] },
  { key: 'wordpress', name: 'WordPress', category: 'ECOMMERCE', description: 'Embed payment buttons and receive payment webhooks on WordPress sites.', fields: [{ name: 'storeUrl', secret: false }, { name: 'apiKey', secret: true }] },
  { key: 'zapier', name: 'Zapier', category: 'TOOLING', description: 'Trigger Zaps for every paid checkout, refund or invoice event.', fields: [{ name: 'hookUrl', secret: true }] },
  { key: 'google-sheets', name: 'Google Sheets', category: 'TOOLING', description: 'Append every transaction row into a Google Sheet for reporting.', fields: [{ name: 'spreadsheetId', secret: false }, { name: 'serviceAccountEmail', secret: false }, { name: 'serviceAccountKey', secret: true }] },
  { key: 'discord', name: 'Discord', category: 'NOTIFICATIONS', description: 'Post payment notifications into a Discord channel via webhook.', fields: [{ name: 'webhookUrl', secret: true }] },
  { key: 'slack', name: 'Slack', category: 'NOTIFICATIONS', description: 'Send payment and incident alerts to Slack channels via incoming webhook.', fields: [{ name: 'webhookUrl', secret: true }] },
  { key: 'telegram', name: 'Telegram', category: 'NOTIFICATIONS', description: 'Push payment receipts and alerts to a Telegram chat via bot.', fields: [{ name: 'botToken', secret: true }, { name: 'chatId', secret: false }] },
  { key: 'quickbooks', name: 'QuickBooks', category: 'ACCOUNTING', description: 'Create QuickBooks sales receipts for settled transactions.', fields: [{ name: 'realmId', secret: false }, { name: 'clientId', secret: true }, { name: 'clientSecret', secret: true }] },
  { key: 'xero', name: 'Xero', category: 'ACCOUNTING', description: 'Push invoices and payments into Xero for bookkeeping.', fields: [{ name: 'tenantId', secret: false }, { name: 'clientId', secret: true }, { name: 'clientSecret', secret: true }] },
  { key: 'mailchimp', name: 'Mailchimp', category: 'CRM', description: 'Add paying customers to Mailchimp audiences for marketing.', fields: [{ name: 'apiKey', secret: true }, { name: 'listId', secret: false }] },
  { key: 'hubspot', name: 'HubSpot', category: 'CRM', description: 'Upsert contacts and deals in HubSpot when payments succeed.', fields: [{ name: 'portalId', secret: false }, { name: 'apiKey', secret: true }] },
  { key: 'gpay-btn', name: 'Google Pay button', category: 'PAYMENTS', description: 'Show a Google Pay button on your checkout pages.', fields: [{ name: 'merchantId', secret: false }] },
  { key: 'custom-webhook', name: 'Custom outgoing HTTP action', category: 'TOOLING', description: 'POST a signed JSON payload to any HTTP endpoint on payment events.', fields: [{ name: 'endpointUrl', secret: false }, { name: 'sharedSecret', secret: true }] },
]

async function seedMarketplace() {
  for (const app of BUILTIN_APPS) {
    await db.marketplaceApp.upsert({
      where: { key: app.key },
      update: { name: app.name, category: app.category, description: app.description, builtin: true },
      create: { key: app.key, name: app.name, category: app.category, description: app.description, builtin: true, config: encryptJson({}) },
    })
  }
}

const BUILTIN_MAP = new Map(BUILTIN_APPS.map((a) => [a.key, a]))

function maskValue(v: string): string {
  return v.length <= 8 ? '••••••' : `${v.slice(0, 4)}••••${v.slice(-4)}`
}

/** Mask secret fields — maskConfig covers common names, extra pass covers URLs/ids marked secret. */
function maskAppConfig(configJson: string, fields: AppField[]): Record<string, string> {
  const out: Record<string, string> = { ...maskConfig(configJson) }
  const plain = decryptJson(configJson)
  for (const f of fields) {
    const v = plain[f.name]
    if (f.secret && typeof v === 'string' && v.length > 0) out[f.name] = maskValue(v)
  }
  return out
}

function fieldNames(key: string): string[] {
  return BUILTIN_MAP.get(key)?.fields.map((f) => f.name) ?? []
}

function shape(app: { key: string; name: string; category: string; description: string; config: string; enabled: boolean; builtin: boolean; id: string }) {
  const meta = BUILTIN_MAP.get(app.key)
  const fields = meta?.fields ?? []
  const plain = decryptJson(app.config)
  return {
    id: app.id,
    key: app.key,
    name: app.name,
    category: app.category,
    description: app.description,
    enabled: app.enabled,
    builtin: app.builtin,
    fields,
    config: maskAppConfig(app.config, fields),
    configured: fields.every((f) => {
      const v = plain[f.name]
      return typeof v === 'string' && v.trim().length > 0
    }),
  }
}

/** GET /api/admin/marketplace — ensure builtin catalog seeded, then list (masked configs). */
export async function GET() {
  try {
    await requireRole([...DEV_ROLES, 'FINANCE', 'AGENT', 'VIEWER'])
    await seedMarketplace()
    const rows = await db.marketplaceApp.findMany({ orderBy: [{ category: 'asc' }, { name: 'asc' }] })
    return Response.json({ ok: true, data: { items: rows.map(shape) } })
  } catch (e) {
    return jsonError(e)
  }
}

/**
 * PATCH /api/admin/marketplace — { key, enabled?, config? }
 * Config values are encrypted at rest with the vault (AES-256-GCM).
 * Blank/missing fields keep their saved value. Response returns masked config only.
 */
export async function PATCH(req: Request) {
  try {
    const me = await requireRole(DEV_ROLES)
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const key = typeof b.key === 'string' ? b.key.trim() : ''
    if (!key) throw new HttpError(400, 'key is required')
    const app = await db.marketplaceApp.findUnique({ where: { key } })
    if (!app) throw new HttpError(404, 'Unknown app')

    const data: { enabled?: boolean; config?: string } = {}
    if (b.enabled !== undefined) data.enabled = Boolean(b.enabled)

    if (b.config !== undefined) {
      if (typeof b.config !== 'object' || b.config === null || Array.isArray(b.config)) {
        throw new HttpError(400, 'config must be an object')
      }
      const incoming = b.config as Record<string, unknown>
      const valid = new Set(fieldNames(key))
      const old = decryptJson(app.config)
      const merged: Record<string, string> = {}
      for (const [k, v] of Object.entries(old)) {
        if (typeof v === 'string') merged[k] = v
      }
      for (const [k, v] of Object.entries(incoming)) {
        if (!valid.has(k)) continue // ignore unknown fields
        if (v == null) continue
        const s = String(v).trim()
        if (s === '') continue // blank = keep saved value
        merged[k] = s
      }
      // Clearing: explicit { field: null } removes the stored value
      for (const [k, v] of Object.entries(incoming)) {
        if (v === null && valid.has(k)) delete merged[k]
      }
      data.config = encryptJson(merged)
    }

    if (Object.keys(data).length === 0) throw new HttpError(400, 'Nothing to update — send enabled and/or config')

    const row = await db.marketplaceApp.update({ where: { key }, data })
    await logActivity(me, 'marketplace.updated', `marketplaceApp:${key}`, { enabled: row.enabled })
    return Response.json({ ok: true, data: shape(row) })
  } catch (e) {
    return jsonError(e)
  }
}
