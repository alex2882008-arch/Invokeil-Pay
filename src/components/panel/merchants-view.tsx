'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Store, Plus, KeyRound, Pencil, Trash2, Eye, EyeOff, Copy, Check, Lock, Unlock, Ban, RotateCcw, Mail, ShoppingCart,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { fetchApi } from '@/lib/api-client'
import { formatDateTime, timeAgo } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useUrlState } from '@/hooks/use-url-state'
import { useLang } from '@/lib/i18n'
import { copyText } from './ui-bits'
import {
  PageHeader, StatCard, EmptyState, ErrorCard, Pagination, SearchInput,
} from './ui-bits'

// ── Types ────────────────────────────────────────────────────────────────────

interface StoreRow {
  id: string
  name: string
  contactEmail: string | null
  apiKey: string
  webhookUrl: string | null
  secret: string
  domainWhitelist: string | null
  active: boolean
  createdAt: string
  _count: { checkouts: number; apiKeys: number }
}

interface ListData {
  stores: StoreRow[]
  total: number
  page: number
  pages: number
}

interface SummaryData {
  summary: { total: number; active: number; keys: number }
}

interface ApiKeyRow {
  id: string
  name: string
  key: string
  scopes: string
  expiresAt: string | null
  active: boolean
  locked: boolean
  lastUsedAt: string | null
  createdAt: string
}

interface StoreForm {
  name: string
  contactEmail: string
  webhookUrl: string
  whitelist: string
  active: boolean
}

const EMPTY_STORE_FORM: StoreForm = {
  name: '', contactEmail: '', webhookUrl: '', whitelist: '', active: true,
}

const SCOPE_OPTIONS: Array<{ id: string; labelKey: string }> = [
  { id: 'create_payment', labelKey: 'mScopeCreate' },
  { id: 'verify_payment', labelKey: 'mScopeVerify' },
  { id: 'refund_payment', labelKey: 'mScopeRefund' },
]

function isListData(d: unknown): d is ListData {
  if (!d || typeof d !== 'object') return false
  const o = d as Partial<ListData>
  return Array.isArray(o.stores) && typeof o.total === 'number' && typeof o.page === 'number' && typeof o.pages === 'number'
}

function isSummaryData(d: unknown): d is SummaryData {
  if (!d || typeof d !== 'object') return false
  const s = (d as Partial<SummaryData>).summary
  return !!s && typeof s.total === 'number' && typeof s.active === 'number' && typeof s.keys === 'number'
}

// ── Small helpers ────────────────────────────────────────────────────────────

function maskedKey(k: string): string {
  if (k.length <= 10) return k
  return `${k.slice(0, 7)}${'•'.repeat(12)}${k.slice(-4)}`
}

function keyStatus(k: ApiKeyRow): 'active' | 'locked' | 'revoked' {
  if (!k.active) return 'revoked'
  if (k.locked) return 'locked'
  return 'active'
}

// ── View ─────────────────────────────────────────────────────────────────────

export function MerchantsView() {
  const { t } = useLang()
  const { get, getNum, set } = useUrlState()
  const q = get('q')
  const page = getNum('page', 1)

  const [data, setData] = useState<ListData | null>(null)
  const [summary, setSummary] = useState<SummaryData['summary'] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // store dialog
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<StoreRow | null>(null)
  const [form, setForm] = useState<StoreForm>(EMPTY_STORE_FORM)
  const [saving, setSaving] = useState(false)

  // revealed keys (storeId / keyId → full key visible)
  const [revealed, setRevealed] = useState<Record<string, boolean>>({})

  // keys dialog
  const [keysStore, setKeysStore] = useState<StoreRow | null>(null)
  const [keys, setKeys] = useState<ApiKeyRow[] | null>(null)
  const [keysLoading, setKeysLoading] = useState(false)

  // new key dialog
  const [keyDialogOpen, setKeyDialogOpen] = useState(false)
  const [keyName, setKeyName] = useState('')
  const [keyScopes, setKeyScopes] = useState<string[]>(['create_payment', 'verify_payment'])
  const [keyExpiry, setKeyExpiry] = useState('')
  const [keySaving, setKeySaving] = useState(false)
  const [createdKey, setCreatedKey] = useState<string | null>(null)

  // delete state
  const [deletingStore, setDeletingStore] = useState<StoreRow | null>(null)
  const [deletingKey, setDeletingKey] = useState<ApiKeyRow | null>(null)
  const [deletingBusy, setDeletingBusy] = useState(false)

  const loadList = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(page) })
      if (q) params.set('q', q)
      const d = await fetchApi<unknown>(`/api/admin/stores?${params.toString()}`)
      if (!isListData(d)) throw new Error('Unexpected response from server')
      setError(null)
      setData(d)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [page, q])

  const loadSummary = useCallback(async () => {
    try {
      const d = await fetchApi<unknown>('/api/admin/stores?summary=1')
      if (isSummaryData(d)) setSummary(d.summary)
    } catch { /* stat cards stay stale — non-fatal */ }
  }, [])

  useEffect(() => { loadList() }, [loadList])
  useEffect(() => { loadSummary() }, [loadSummary])

  const loadKeys = useCallback(async (storeId: string) => {
    setKeysLoading(true)
    try {
      const d = await fetchApi<{ keys: ApiKeyRow[] }>(`/api/admin/stores/${storeId}/keys`)
      setKeys(d.keys)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load keys')
      setKeys([])
    } finally {
      setKeysLoading(false)
    }
  }, [])

  // ── Store form ──

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_STORE_FORM)
    setDialogOpen(true)
  }

  const openEdit = (s: StoreRow) => {
    setEditing(s)
    let whitelist = ''
    try {
      const parsed = s.domainWhitelist ? (JSON.parse(s.domainWhitelist) as string[]) : []
      if (Array.isArray(parsed)) whitelist = parsed.join(', ')
    } catch { /* ignore malformed */ }
    setForm({
      name: s.name,
      contactEmail: s.contactEmail ?? '',
      webhookUrl: s.webhookUrl ?? '',
      whitelist,
      active: s.active,
    })
    setDialogOpen(true)
  }

  const validateStore = (): string | null => {
    if (!form.name.trim()) return t('mNameRequired')
    if (form.contactEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contactEmail.trim())) return t('mEmailInvalid')
    if (form.webhookUrl.trim()) {
      try { new URL(form.webhookUrl.trim()) } catch { return t('mUrlInvalid') }
    }
    return null
  }

  const submitStore = async () => {
    const err = validateStore()
    if (err) { toast.error(err); return }
    setSaving(true)
    try {
      if (editing) {
        await fetchApi(`/api/admin/stores/${editing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.name.trim(),
            contactEmail: form.contactEmail.trim() || null,
            webhookUrl: form.webhookUrl.trim() || null,
            domainWhitelist: form.whitelist.trim()
              ? form.whitelist.split(',').map((s) => s.trim()).filter(Boolean)
              : null,
            active: form.active,
          }),
        })
        toast.success(t('mStoreUpdated'))
      } else {
        await fetchApi('/api/admin/stores', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.name.trim(),
            contactEmail: form.contactEmail.trim() || null,
            webhookUrl: form.webhookUrl.trim() || null,
          }),
        })
        toast.success(t('mStoreCreated'))
      }
      setDialogOpen(false)
      await Promise.all([loadList(), loadSummary()])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setSaving(false)
    }
  }

  // ── Optimistic active toggle ──

  const toggleActive = async (s: StoreRow, next: boolean) => {
    setData((d) => d ? {
      ...d,
      stores: d.stores.map((x) => (x.id === s.id ? { ...x, active: next } : x)),
    } : d)
    try {
      await fetchApi(`/api/admin/stores/${s.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: next }),
      })
      toast.success(t('mStoreUpdated'))
      loadSummary()
    } catch (e) {
      setData((d) => d ? {
        ...d,
        stores: d.stores.map((x) => (x.id === s.id ? { ...x, active: s.active } : x)),
      } : d)
      toast.error(e instanceof Error ? e.message : 'Request failed')
    }
  }

  const removeStore = async () => {
    if (!deletingStore) return
    setDeletingBusy(true)
    try {
      await fetchApi(`/api/admin/stores/${deletingStore.id}`, { method: 'DELETE' })
      toast.success(t('mStoreDeleted'))
      setDeletingStore(null)
      const lastPage = data && data.pages > 1 && data.stores.length === 1 ? data.pages - 1 : page
      if (lastPage !== page) set({ page: lastPage })
      else await Promise.all([loadList(), loadSummary()])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setDeletingBusy(false)
    }
  }

  // ── Keys ──

  const openKeys = (s: StoreRow) => {
    setKeysStore(s)
    setKeys(null)
    setKeyDialogOpen(false)
    setCreatedKey(null)
    void loadKeys(s.id)
  }

  const submitKey = async () => {
    if (!keysStore) return
    if (!keyName.trim()) { toast.error(t('mKeyNameRequired')); return }
    if (keyScopes.length === 0) { toast.error(t('whEventRequired')); return }
    setKeySaving(true)
    try {
      const d = await fetchApi<{ key: { key: string } }>(`/api/admin/stores/${keysStore.id}/keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: keyName.trim(),
          scopes: keyScopes.join(','),
          expiresAt: keyExpiry || null,
        }),
      })
      setCreatedKey(d.key.key)
      setKeyName('')
      setKeyScopes(['create_payment', 'verify_payment'])
      setKeyExpiry('')
      toast.success(t('mKeyCreated'))
      await loadKeys(keysStore.id)
      loadSummary()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setKeySaving(false)
    }
  }

  const patchKey = async (k: ApiKeyRow, patch: Record<string, unknown>, msg: string) => {
    if (!keysStore) return
    try {
      await fetchApi(`/api/admin/stores/${keysStore.id}/keys/${k.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      toast.success(msg)
      await loadKeys(keysStore.id)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Request failed')
    }
  }

  const removeKey = async () => {
    if (!keysStore || !deletingKey) return
    setDeletingBusy(true)
    try {
      await fetchApi(`/api/admin/stores/${keysStore.id}/keys/${deletingKey.id}`, { method: 'DELETE' })
      toast.success(t('mKeyDeleted'))
      setDeletingKey(null)
      await loadKeys(keysStore.id)
      loadSummary()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setDeletingBusy(false)
    }
  }

  const copyKey = async (value: string) => {
    await copyText(value)
    toast.success(t('mCopied'))
  }

  const toggleReveal = (id: string) => {
    setRevealed((r) => ({ ...r, [id]: !r[id] }))
  }

  const keyStatusBadge = (k: ApiKeyRow) => {
    const st = keyStatus(k)
    return (
      <Badge variant="outline" className={cn(
        'text-[11px]',
        st === 'active' && 'border-success/20 bg-success/10 text-success',
        st === 'locked' && 'border-warning/30 bg-warning/15 text-amber-700 dark:text-amber-400',
        st === 'revoked' && 'border-border bg-muted text-muted-foreground',
      )}>
        {st === 'active' ? t('mActiveLabel') : st === 'locked' ? t('mLockedLabel') : t('mRevokedLabel')}
      </Badge>
    )
  }

  const keyRowActions = (k: ApiKeyRow) => {
    const st = keyStatus(k)
    return (
      <div className="flex items-center justify-end gap-1">
        {st !== 'revoked' && (
          <Button
            variant="ghost" size="icon" className="press h-8 w-8 min-h-8"
            title={k.locked ? t('mUnlock') : t('mLock')}
            aria-label={k.locked ? t('mUnlock') : t('mLock')}
            onClick={() => patchKey(k, { locked: !k.locked }, k.locked ? t('mUnlockedToast') : t('mLockedToast'))}
          >
            {k.locked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
          </Button>
        )}
        <Button
          variant="ghost" size="icon"
          className={cn('press h-8 w-8 min-h-8', st === 'revoked' ? 'text-success hover:text-success' : 'text-warning hover:text-warning')}
          title={st === 'revoked' ? t('mRestore') : t('mRevoke')}
          aria-label={st === 'revoked' ? t('mRestore') : t('mRevoke')}
          onClick={() => patchKey(k, { active: st === 'revoked' }, st === 'revoked' ? t('mRestoredToast') : t('mRevokedToast'))}
        >
          {st === 'revoked' ? <RotateCcw className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
        </Button>
        <Button
          variant="ghost" size="icon" className="press h-8 w-8 min-h-8 text-destructive hover:text-destructive"
          title={t('mDelete')} aria-label={t('mDelete')}
          onClick={() => setDeletingKey(k)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    )
  }

  // ── Render ──

  return (
    <div>
      <PageHeader
        title={t('merchants')}
        description={t('mSub')}
        icon={<Store className="h-5 w-5" />}
        actions={
          <Button onClick={openCreate} className="press gap-1.5">
            <Plus className="h-4 w-4" /> {t('mNewStore')}
          </Button>
        }
      />

      {/* Stat cards */}
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <StatCard
          label={t('mStatStores')}
          value={summary ? String(summary.total) : '—'}
          icon={<Store className="h-5 w-5" />}
          tone="text-primary bg-primary/10"
          loading={!summary}
        />
        <StatCard
          label={t('mStatActive')}
          value={summary ? String(summary.active) : '—'}
          icon={<ShoppingCart className="h-5 w-5" />}
          tone="text-success bg-success/10"
          loading={!summary}
        />
        <StatCard
          label={t('mStatKeys')}
          value={summary ? String(summary.keys) : '—'}
          icon={<KeyRound className="h-5 w-5" />}
          tone="text-warning bg-warning/10"
          loading={!summary}
        />
      </div>

      {/* Filters */}
      <div className="mb-4">
        <SearchInput paramKey="q" placeholder={t('mSearchStores')} className="sm:max-w-xs" />
      </div>

      {/* Content */}
      {error && !data ? (
        <ErrorCard message={error} onRetry={() => { setLoading(true); loadList() }} />
      ) : loading && !data ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-xl" />)}
        </div>
      ) : !data || data.stores.length === 0 ? (
        <Card className="border-dashed p-2 shadow-brand">
          {q ? (
            <EmptyState
              icon={<Store className="h-7 w-7" />}
              title={t('mNoResults')}
              action={
                <Button variant="outline" size="sm" className="press" onClick={() => set({ q: null, page: 1 })}>
                  {t('mClearFilters')}
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={<Store className="h-7 w-7" />}
              title={t('mNoStores')}
              hint={t('mNoStoresHint')}
              action={
                <Button onClick={openCreate} className="press gap-1.5">
                  <Plus className="h-4 w-4" /> {t('mNewStore')}
                </Button>
              }
            />
          )}
        </Card>
      ) : (
        <>
          <div className="stagger grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.stores.map((s) => (
              <Card key={s.id} className="hover-lift flex flex-col gap-3 p-4 shadow-brand">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-foreground">{s.name}</p>
                    {s.contactEmail && (
                      <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                        <Mail className="h-3 w-3 shrink-0" /> {s.contactEmail}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5" title={t('mActive')}>
                    <Switch
                      checked={s.active}
                      aria-label={`${t('mActive')}: ${s.name}`}
                      onCheckedChange={(v) => toggleActive(s, v)}
                    />
                  </div>
                </div>

                {/* API key */}
                <div className="flex items-center gap-1.5 rounded-lg border bg-muted/40 px-2.5 py-1.5">
                  <code className="min-w-0 flex-1 truncate font-mono text-xs text-foreground/80">
                    {revealed[s.id] ? s.apiKey : maskedKey(s.apiKey)}
                  </code>
                  <Button
                    variant="ghost" size="icon" className="press h-7 w-7 shrink-0"
                    title={revealed[s.id] ? t('mHide') : t('mReveal')}
                    aria-label={revealed[s.id] ? t('mHide') : t('mReveal')}
                    onClick={() => toggleReveal(s.id)}
                  >
                    {revealed[s.id] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </Button>
                  <Button
                    variant="ghost" size="icon" className="press h-7 w-7 shrink-0"
                    title={t('mCopied')} aria-label={t('mCopied')}
                    onClick={() => copyKey(s.apiKey)}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>

                <div className="mt-auto flex items-center justify-between gap-2 border-t pt-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Badge variant="secondary" className="gap-1 font-semibold">
                      <ShoppingCart className="h-3 w-3" /> {s._count.checkouts}
                    </Badge>
                    <Badge variant="secondary" className="gap-1 font-semibold">
                      <KeyRound className="h-3 w-3" /> {s._count.apiKeys}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="sm" className="press h-8 gap-1.5 text-xs" onClick={() => openKeys(s)}>
                      <KeyRound className="h-3.5 w-3.5" /> {t('mKeys')}
                    </Button>
                    <Button
                      variant="ghost" size="icon" className="press h-8 w-8" title={t('mEdit')} aria-label={t('mEdit')}
                      onClick={() => openEdit(s)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost" size="icon" className="press h-8 w-8 text-destructive hover:text-destructive"
                      title={t('mDelete')} aria-label={t('mDelete')}
                      onClick={() => setDeletingStore(s)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
          <Pagination page={data.page} pages={data.pages} total={data.total} />
        </>
      )}

      {/* Store create/edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? t('mEditStore') : t('mNewStore')}</DialogTitle>
            <DialogDescription>{editing ? t('mRegenerateKeyWarn') : t('mStoreCreatedHint')}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3.5">
            <div className="grid gap-1.5">
              <Label htmlFor="store-name">{t('mStoreName')} *</Label>
              <Input
                id="store-name" value={form.name} autoFocus
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="My Shop Ltd"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="store-email">{t('mContactEmail')}</Label>
              <Input
                id="store-email" type="email" value={form.contactEmail}
                onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))}
                placeholder="billing@myshop.com"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="store-webhook">{t('mWebhookUrl')}</Label>
              <Input
                id="store-webhook" value={form.webhookUrl}
                onChange={(e) => setForm((f) => ({ ...f, webhookUrl: e.target.value }))}
                placeholder="https://myshop.com/webhooks/invokeil"
              />
              <p className="text-[11px] text-muted-foreground">{t('mWebhookUrlHint')}</p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="store-whitelist">{t('mDomainWhitelist')}</Label>
              <Input
                id="store-whitelist" value={form.whitelist}
                onChange={(e) => setForm((f) => ({ ...f, whitelist: e.target.value }))}
                placeholder="shop.example.com, pay.example.org"
              />
              <p className="text-[11px] text-muted-foreground">{t('mDomainWhitelistHint')}</p>
            </div>
            {editing && (
              <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
                <Label htmlFor="store-active" className="cursor-pointer">{t('mActive')}</Label>
                <Switch
                  id="store-active" checked={form.active}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" className="press" onClick={() => setDialogOpen(false)}>{t('mCancel')}</Button>
            <Button className="press" disabled={saving} onClick={submitStore}>
              {saving ? '…' : editing ? t('mSave') : t('mCreate')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Keys dialog */}
      <Dialog open={!!keysStore} onOpenChange={(o) => { if (!o) setKeysStore(null) }}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              <KeyRound className="h-4 w-4 text-primary" /> {t('mKeys')} — {keysStore?.name}
            </DialogTitle>
            <DialogDescription>{t('mKeysHint')}</DialogDescription>
          </DialogHeader>

          {createdKey && (
            <div className="anim-scale-in rounded-xl border border-success/30 bg-success/5 p-3.5">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-success">
                <Check className="h-4 w-4" /> {t('mKeyCreated')}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{t('mKeyCreatedHint')}</p>
              <div className="mt-2 flex items-center gap-1.5">
                <code className="min-w-0 flex-1 truncate rounded-md bg-background px-2.5 py-1.5 font-mono text-xs">{createdKey}</code>
                <Button variant="outline" size="sm" className="press shrink-0" aria-label={t('mCopied')} onClick={() => copyKey(createdKey)}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}

          <div className="max-h-[52vh] overflow-y-auto nice-scroll">
            {keysLoading ? (
              <div className="space-y-2 py-2">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
              </div>
            ) : !keys || keys.length === 0 ? (
              <EmptyState
                icon={<KeyRound className="h-6 w-6" />}
                title={t('mNoKeys')}
                hint={t('mNoKeysHint')}
                action={
                  <Button size="sm" className="press gap-1.5" onClick={() => setKeyDialogOpen(true)}>
                    <Plus className="h-3.5 w-3.5" /> {t('mNewKey')}
                  </Button>
                }
              />
            ) : (
              <>
                {/* Desktop table */}
                <div className="hidden overflow-x-auto rounded-xl border md:block">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50 text-left">
                        <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('mKeyName')}</th>
                        <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('mKeyCol')}</th>
                        <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('mScopes')}</th>
                        <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('mExpiresAt')}</th>
                        <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('mStatus')}</th>
                        <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('mLastUsed')}</th>
                        <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('mActions')}</th>
                      </tr>
                    </thead>
                    <tbody className="stagger">
                      {keys.map((k) => {
                        const rid = `k-${k.id}`
                        return (
                          <tr key={k.id} className="border-b transition-colors last:border-0 hover:bg-muted/40">
                            <td className="px-3 py-2.5 font-semibold text-foreground">{k.name}</td>
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-1">
                                <code className="max-w-[13rem] truncate font-mono text-xs text-foreground/80">
                                  {revealed[rid] ? k.key : maskedKey(k.key)}
                                </code>
                                <Button
                                  variant="ghost" size="icon" className="press h-6 w-6"
                                  title={revealed[rid] ? t('mHide') : t('mReveal')}
                                  aria-label={revealed[rid] ? t('mHide') : t('mReveal')}
                                  onClick={() => toggleReveal(rid)}
                                >
                                  {revealed[rid] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                                </Button>
                                <Button
                                  variant="ghost" size="icon" className="press h-6 w-6"
                                  title={t('mCopied')} aria-label={t('mCopied')}
                                  onClick={() => copyKey(k.key)}
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                              </div>
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="flex max-w-[10rem] flex-wrap gap-1">
                                {k.scopes.split(',').map((sc) => (
                                  <Badge key={sc} variant="secondary" className="px-1.5 py-0 font-mono text-[10px]">{sc}</Badge>
                                ))}
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-xs text-muted-foreground">
                              {k.expiresAt ? (
                                <span className={cn(new Date(k.expiresAt) < new Date() && 'font-semibold text-destructive')}>
                                  {formatDateTime(k.expiresAt)}
                                </span>
                              ) : <span className="text-muted-foreground/60">{t('mNoExpiry')}</span>}
                            </td>
                            <td className="px-3 py-2.5">{keyStatusBadge(k)}</td>
                            <td className="px-3 py-2.5 text-xs text-muted-foreground">
                              {k.lastUsedAt ? timeAgo(k.lastUsedAt) : <span className="text-muted-foreground/60">{t('mNever')}</span>}
                            </td>
                            <td className="px-3 py-2.5">{keyRowActions(k)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile cards */}
                <div className="space-y-2.5 md:hidden">
                  {keys.map((k) => {
                    const rid = `k-${k.id}`
                    return (
                      <div key={k.id} className="rounded-xl border p-3">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-semibold text-foreground">{k.name}</p>
                          {keyStatusBadge(k)}
                        </div>
                        <div className="mt-2 flex items-center gap-1">
                          <code className="min-w-0 flex-1 truncate font-mono text-xs text-foreground/80">
                            {revealed[rid] ? k.key : maskedKey(k.key)}
                          </code>
                          <Button variant="ghost" size="icon" className="press h-8 w-8 shrink-0" onClick={() => toggleReveal(rid)} aria-label={t('mReveal')}>
                            {revealed[rid] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </Button>
                          <Button variant="ghost" size="icon" className="press h-8 w-8 shrink-0" onClick={() => copyKey(k.key)} aria-label={t('mCopied')}>
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {k.scopes.split(',').map((sc) => (
                            <Badge key={sc} variant="secondary" className="font-mono text-[10px]">{sc}</Badge>
                          ))}
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-1 text-[11px] text-muted-foreground">
                          <span>{t('mExpiresAt')}: {k.expiresAt ? formatDateTime(k.expiresAt) : t('mNoExpiry')}</span>
                          <span>{t('mLastUsed')}: {k.lastUsedAt ? timeAgo(k.lastUsedAt) : t('mNever')}</span>
                        </div>
                        <div className="mt-2 border-t pt-2">{keyRowActions(k)}</div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>

          <DialogFooter className="flex-row items-center justify-between gap-2 sm:justify-between">
            <Button variant="outline" className="press gap-1.5" onClick={() => { setCreatedKey(null); setKeyDialogOpen(true) }}>
              <Plus className="h-4 w-4" /> {t('mNewKey')}
            </Button>
            <Button variant="secondary" className="press" onClick={() => setKeysStore(null)}>{t('mCancel')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New key dialog */}
      <Dialog open={keyDialogOpen} onOpenChange={setKeyDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('mNewKey')}</DialogTitle>
            <DialogDescription>{keysStore ? `${t('mKeys')} — ${keysStore.name}` : undefined}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3.5">
            <div className="grid gap-1.5">
              <Label htmlFor="key-name">{t('mKeyName')} *</Label>
              <Input
                id="key-name" value={keyName} autoFocus
                onChange={(e) => setKeyName(e.target.value)}
                placeholder="Mobile app integration"
              />
            </div>
            <div className="grid gap-2">
              <Label>{t('mScopes')}</Label>
              <p className="text-[11px] text-muted-foreground">{t('mScopesHint')}</p>
              <div className="grid gap-2">
                {SCOPE_OPTIONS.map((sc) => (
                  <label key={sc.id} className="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-muted/50">
                    <Checkbox
                      checked={keyScopes.includes(sc.id)}
                      onCheckedChange={(v) => setKeyScopes((s) => (v ? [...s, sc.id] : s.filter((x) => x !== sc.id)))}
                      aria-label={sc.id}
                    />
                    <span className="text-xs">{t(sc.labelKey)}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="key-expiry">{t('mExpiresAt')}</Label>
              <Input
                id="key-expiry" type="date" value={keyExpiry}
                onChange={(e) => setKeyExpiry(e.target.value)}
                min={new Date().toISOString().slice(0, 10)}
              />
              <p className="text-[11px] text-muted-foreground">{t('mNoExpiry')}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="press" onClick={() => setKeyDialogOpen(false)}>{t('mCancel')}</Button>
            <Button className="press" disabled={keySaving} onClick={submitKey}>
              {keySaving ? '…' : t('mCreate')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete store confirm */}
      <AlertDialog open={!!deletingStore} onOpenChange={(o) => { if (!o) setDeletingStore(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('mDeleteStoreTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingStore?.name} — {t('mDeleteStoreDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="press">{t('mCancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="press bg-destructive text-white hover:bg-destructive/90"
              disabled={deletingBusy}
              onClick={(e) => { e.preventDefault(); removeStore() }}
            >
              {t('mDelete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete key confirm */}
      <AlertDialog open={!!deletingKey} onOpenChange={(o) => { if (!o) setDeletingKey(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('mDeleteKeyTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingKey?.name} — {t('mDeleteKeyDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="press">{t('mCancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="press bg-destructive text-white hover:bg-destructive/90"
              disabled={deletingBusy}
              onClick={(e) => { e.preventDefault(); removeKey() }}
            >
              {t('mDelete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
