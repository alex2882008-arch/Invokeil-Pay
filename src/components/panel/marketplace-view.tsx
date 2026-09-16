'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader, EmptyState, ErrorCard, SearchInput } from './ui-bits'
import { useLang } from '@/lib/i18n'
import { MKT_EN, MKT_BN } from '@/lib/i18n/marketplace'
import { useUrlState } from '@/hooks/use-url-state'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  Store, Puzzle, Search, Settings2, CheckCircle2, CircleDashed, ShieldCheck, Blocks,
} from 'lucide-react'

// ── i18n helper ──────────────────────────────────────────────────────────────

function useMktT() {
  const { t, lang } = useLang()
  return useCallback((k: string) => {
    const v = t(k)
    if (v && v !== k) return v
    return (lang === 'bn' ? MKT_BN[k] : MKT_EN[k]) ?? MKT_EN[k] ?? k
  }, [t, lang])
}

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' })
  const j = (await res.json().catch(() => ({}))) as { data?: T; error?: string }
  if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
  return (j.data ?? j) as T
}

async function sendJSON<T>(url: string, body: unknown, method = 'POST'): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
  const j = (await res.json().catch(() => ({}))) as { data?: T; error?: string }
  if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
  return (j.data ?? j) as T
}

// ── types + meta maps ────────────────────────────────────────────────────────

type AppField = { name: string; secret: boolean }

type MktApp = {
  id: string
  key: string
  name: string
  category: string
  description: string
  enabled: boolean
  builtin: boolean
  fields: AppField[]
  config: Record<string, string>
  configured: boolean
}

const CATEGORIES = ['PAYMENTS', 'ECOMMERCE', 'ACCOUNTING', 'NOTIFICATIONS', 'CRM', 'TOOLING'] as const

function categoryLabel(cat: string, t: (k: string) => string): string {
  switch (cat) {
    case 'PAYMENTS': return t('mktCatPayments')
    case 'ECOMMERCE': return t('mktCatEcommerce')
    case 'ACCOUNTING': return t('mktCatAccounting')
    case 'NOTIFICATIONS': return t('mktCatNotifications')
    case 'CRM': return t('mktCatCrm')
    default: return t('mktCatTooling')
  }
}

const DESC_KEYS: Record<string, string> = {
  woocommerce: 'mktDescWoo', shopify: 'mktDescShopify', wordpress: 'mktDescWordpress',
  zapier: 'mktDescZapier', 'google-sheets': 'mktDescSheets', discord: 'mktDescDiscord',
  slack: 'mktDescSlack', telegram: 'mktDescTelegram', quickbooks: 'mktDescQuickbooks',
  xero: 'mktDescXero', mailchimp: 'mktDescMailchimp', hubspot: 'mktDescHubspot',
  'gpay-btn': 'mktDescGpay', 'custom-webhook': 'mktDescWebhook',
}

const FIELD_LABEL_KEYS: Record<string, string> = {
  storeUrl: 'mktFStoreUrl', consumerKey: 'mktFConsumerKey', consumerSecret: 'mktFConsumerSecret',
  apiKey: 'mktFApiKey', apiSecret: 'mktFApiSecret', hookUrl: 'mktFZapierUrl',
  spreadsheetId: 'mktFSpreadsheetId', serviceAccountEmail: 'mktFServiceAccount', serviceAccountKey: 'mktFServiceAccount',
  webhookUrl: 'mktFWebhookUrl', botToken: 'mktFBotToken', chatId: 'mktFChatId',
  realmId: 'mktFRealmId', clientId: 'mktFApiKey', clientSecret: 'mktFApiSecret',
  tenantId: 'mktFTenantId', listId: 'mktFListId', portalId: 'mktFPortalId',
  merchantId: 'mktFMerchantId', endpointUrl: 'mktFEndpointUrl', sharedSecret: 'mktFSharedSecret',
}

// ── main view ────────────────────────────────────────────────────────────────

export function MarketplaceView() {
  const t = useMktT()
  const { get, set } = useUrlState()
  const cat = get('cat', 'ALL')
  const q = get('q')

  const [apps, setApps] = useState<MktApp[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // configure dialog
  const [configApp, setConfigApp] = useState<MktApp | null>(null)
  const [configValues, setConfigValues] = useState<Record<string, string>>({})
  const [configSaving, setConfigSaving] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setError(null)
      const d = await getJSON<{ items: MktApp[] }>('/api/admin/marketplace')
      setApps(d.items)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    let list = apps ?? []
    if (cat !== 'ALL') list = list.filter((a) => a.category === cat)
    if (q.trim()) {
      const needle = q.trim().toLowerCase()
      list = list.filter((a) => a.name.toLowerCase().includes(needle) || a.description.toLowerCase().includes(needle) || a.key.includes(needle))
    }
    return list
  }, [apps, cat, q])

  const enabledCount = (apps ?? []).filter((a) => a.enabled).length

  function openConfig(app: MktApp) {
    setConfigApp(app)
    // Seed with non-secret saved values only; secrets stay blank (blank = keep)
    const seeded: Record<string, string> = {}
    for (const f of app.fields) {
      if (!f.secret) seeded[f.name] = app.config[f.name] ?? ''
    }
    setConfigValues(seeded)
  }

  async function saveConfig() {
    if (!configApp) return
    setConfigSaving(true)
    try {
      const updated = await sendJSON<MktApp>('/api/admin/marketplace', { key: configApp.key, config: configValues }, 'PATCH')
      setApps((list) => (list ?? []).map((a) => a.key === updated.key ? updated : a))
      toast.success(t('mktConfigSaved'))
      setConfigApp(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('mktConfigFail'))
    } finally {
      setConfigSaving(false)
    }
  }

  async function toggleApp(app: MktApp, enabled: boolean) {
    setTogglingId(app.id)
    try {
      const updated = await sendJSON<MktApp>('/api/admin/marketplace', { key: app.key, enabled }, 'PATCH')
      setApps((list) => (list ?? []).map((a) => a.key === updated.key ? updated : a))
      toast.success(`${app.name} ${enabled ? t('mktEnabledToast') : t('mktDisabledToast')}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('mktToggleFail'))
    } finally {
      setTogglingId(null)
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title={t('mktTitle')}
        description={t('mktSub')}
        icon={<Puzzle className="h-5 w-5" />}
        actions={
          <Badge variant="outline" className="h-9 border-success/30 bg-success/10 px-3 text-xs font-bold text-success">
            <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> {enabledCount} {t('mktEnabled')}
          </Badge>
        }
      />

      {/* Category chips + search */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          <button
            type="button"
            className={cn(
              'press shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors',
              cat === 'ALL' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted/50'
            )}
            onClick={() => set({ cat: null })}
            aria-pressed={cat === 'ALL'}
          >
            <Blocks className="mr-1 inline h-3 w-3" /> {t('mktAll')}
          </button>
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              className={cn(
                'press shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors',
                cat === c ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted/50'
              )}
              onClick={() => set({ cat: c })}
              aria-pressed={cat === c}
            >
              {categoryLabel(c, t)}
            </button>
          ))}
        </div>
        <div className="w-full lg:w-64">
          <SearchInput paramKey="q" placeholder={t('mktSearchPh')} />
        </div>
      </div>

      {/* App grid */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-52 rounded-xl" />)}
        </div>
      ) : error ? (
        <ErrorCard message={error} onRetry={load} />
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState icon={<Search className="h-6 w-6" />} title={t('mktNoApps')} hint={t('mktNoAppsHint')} />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((app, i) => (
            <Card key={app.key} className="ilp-fade-up relative overflow-hidden" style={{ animationDelay: `${i * 40}ms` }}>
              {/* built-in ribbon */}
              {app.builtin && (
                <span className="absolute right-0 top-0 rounded-bl-lg bg-primary/10 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-primary">
                  {t('mktBuiltin')}
                </span>
              )}
              <CardContent className="flex h-full flex-col gap-3 p-5">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
                    <Store className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1 pr-8">
                    <p className="truncate text-sm font-bold text-foreground">{app.name}</p>
                    <Badge variant="outline" className="mt-1 text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
                      {categoryLabel(app.category, t)}
                    </Badge>
                  </div>
                </div>

                <p className="flex-1 text-xs leading-relaxed text-muted-foreground">
                  {DESC_KEYS[app.key] ? t(DESC_KEYS[app.key]) : app.description}
                </p>

                <div className="flex items-center gap-1.5 text-[11px]">
                  {app.configured ? (
                    <span className="inline-flex items-center gap-1 font-semibold text-success"><CheckCircle2 className="h-3.5 w-3.5" /> {t('mktConfigured')}</span>
                  ) : app.fields.length > 0 ? (
                    <span className="inline-flex items-center gap-1 text-muted-foreground"><CircleDashed className="h-3.5 w-3.5" /> {t('mktNotConfigured')}</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5" /> {t('mktBuiltin')}</span>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2 border-t pt-3">
                  {app.fields.length > 0 ? (
                    <Button variant="outline" size="sm" className="press h-8 gap-1.5" onClick={() => openConfig(app)}>
                      <Settings2 className="h-3.5 w-3.5" /> {t('mktConfigure')}
                    </Button>
                  ) : <span />}
                  <div className="flex items-center gap-2">
                    <span className={cn('text-[10px] font-bold uppercase', app.enabled ? 'text-success' : 'text-muted-foreground')}>
                      {app.enabled ? t('mktEnabled') : t('mktDisabled')}
                    </span>
                    <Switch
                      checked={app.enabled}
                      disabled={togglingId === app.id}
                      onCheckedChange={(v) => toggleApp(app, v)}
                      aria-label={`${app.name} ${t('mktConnect')}`}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Configure dialog */}
      <Dialog open={!!configApp} onOpenChange={(v) => { if (!v) setConfigApp(null) }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('mktConfigTitle')} — {configApp?.name}</DialogTitle>
            <DialogDescription>{configApp ? (DESC_KEYS[configApp.key] ? t(DESC_KEYS[configApp.key]) : configApp.description) : ''}</DialogDescription>
          </DialogHeader>
          {configApp && (
            <div className="space-y-3.5">
              {configApp.fields.map((f) => {
                const saved = configApp.config[f.name]
                return (
                  <div key={f.name} className="space-y-1.5">
                    <Label htmlFor={`cfg-${f.name}`}>
                      {FIELD_LABEL_KEYS[f.name] ? t(FIELD_LABEL_KEYS[f.name]) : f.name}
                      {f.secret && <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">({t('mktOptional')})</span>}
                    </Label>
                    <Input
                      id={`cfg-${f.name}`}
                      type={f.secret ? 'password' : 'text'}
                      value={configValues[f.name] ?? ''}
                      onChange={(e) => setConfigValues((v) => ({ ...v, [f.name]: e.target.value }))}
                      placeholder={f.name === 'webhookUrl' ? t('mktFWebhookUrlPh') : (saved ? `${t('mktLeaveBlankKeep')} — ${saved}` : '')}
                      autoComplete="off"
                    />
                    {saved && f.secret && (
                      <p className="text-[10px] text-muted-foreground">{t('mktConfiguredFields')}: {saved}</p>
                    )}
                  </div>
                )
              })}
              <p className="flex items-start gap-1.5 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                {t('mktSecretNote')}
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" className="press" onClick={() => setConfigApp(null)}>{t('impClose')}</Button>
            <Button className="press gap-1.5" onClick={saveConfig} disabled={configSaving}>
              <CheckCircle2 className="h-3.5 w-3.5" /> {configSaving ? t('incSaving') : t('mktConnect')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
