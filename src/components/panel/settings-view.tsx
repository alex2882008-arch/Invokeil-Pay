'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Settings as SettingsIcon, Store, CreditCard, LifeBuoy, HelpCircle, TriangleAlert, Plus, Pencil,
  Trash2, Save, RefreshCw, Sparkles, DatabaseZap, Upload,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { fetchApi } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import { useUrlState } from '@/hooks/use-url-state'
import { useLang } from '@/lib/i18n'
import { PageHeader, EmptyState, ErrorCard } from './ui-bits'
import { isAdminRole } from '@/lib/roles'

// ── Types ────────────────────────────────────────────────────────────────────

interface Me {
  id: string
  role: 'ADMIN' | 'AGENT' | 'VIEWER'
}

interface FaqItem {
  id: string
  question: string
  answer: string
  sortOrder: number
  active: boolean
}

type SettingsMap = Record<string, string>

const GENERAL_KEYS = ['brandName', 'brandTagline', 'brandLogo', 'defaultLanguage', 'currency', 'currencySymbol', 'landingEnabled'] as const
const PAYMENT_KEYS = [
  'number_bkash', 'number_nagad', 'number_rocket', 'number_upay',
  'number_tap', 'number_telecash', 'number_mcash', 'number_okwallet',
  'bank_hint', 'paymentTolerance', 'checkoutExpiryHours', 'invoiceDueDays', 'webhookAttemptLimit',
] as const
const SUPPORT_KEYS = ['supportPhone', 'supportEmail', 'supportWhatsApp', 'supportTelegram'] as const

const MFS_FIELDS: Array<{ key: typeof PAYMENT_KEYS[number]; label: string }> = [
  { key: 'number_bkash', label: 'numberBkash' },
  { key: 'number_nagad', label: 'numberNagad' },
  { key: 'number_rocket', label: 'numberRocket' },
  { key: 'number_upay', label: 'numberUpay' },
  { key: 'number_tap', label: 'numberTap' },
  { key: 'number_telecash', label: 'numberTelecash' },
  { key: 'number_mcash', label: 'numberMcash' },
  { key: 'number_okwallet', label: 'numberOkwallet' },
]

const EMPTY_FAQ_FORM = { question: '', answer: '', sortOrder: '0', active: true }

// ── Component ────────────────────────────────────────────────────────────────

export function SettingsView() {
  const { t } = useLang()
  const { get, set } = useUrlState()
  const tab = get('tab', 'general')

  const [me, setMe] = useState<Me | null>(null)
  const [saved, setSaved] = useState<SettingsMap | null>(null)
  const [draft, setDraft] = useState<SettingsMap>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingSection, setSavingSection] = useState<string | null>(null)

  // FAQ state
  const [faqs, setFaqs] = useState<FaqItem[] | null>(null)
  const [faqsLoading, setFaqsLoading] = useState(true)
  const [faqsError, setFaqsError] = useState<string | null>(null)
  const [faqDialogOpen, setFaqDialogOpen] = useState(false)
  const [editingFaq, setEditingFaq] = useState<FaqItem | null>(null)
  const [faqForm, setFaqForm] = useState(EMPTY_FAQ_FORM)
  const [faqSaving, setFaqSaving] = useState(false)
  const [deletingFaq, setDeletingFaq] = useState<FaqItem | null>(null)

  // Danger zone state
  const [demoSeeded, setDemoSeeded] = useState<boolean | null>(null)
  const [demoBusy, setDemoBusy] = useState(false)
  const [demoConfirm, setDemoConfirm] = useState<'remove' | 'regenerate' | null>(null)

  const isAdmin = isAdminRole(me?.role)
  // FAQ write ops (add/edit) are ADMIN/AGENT; delete is ADMIN-only
  const canWriteFaq = isAdminRole(me?.role) || me?.role === 'AGENT'

  // ── Loading ──

  const loadSettings = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchApi<{ settings: SettingsMap }>('/api/admin/settings')
      setSaved(res.settings)
      setDraft(res.settings)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadFaqs = useCallback(async () => {
    setFaqsLoading(true)
    setFaqsError(null)
    try {
      const res = await fetchApi<{ faqs: FaqItem[] }>('/api/admin/faqs')
      setFaqs(res.faqs)
    } catch (e) {
      setFaqsError(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setFaqsLoading(false)
    }
  }, [])

  const loadDemo = useCallback(async () => {
    try {
      const res = await fetchApi<{ demoSeeded: boolean }>('/api/admin/demo-data')
      setDemoSeeded(res.demoSeeded)
    } catch {
      setDemoSeeded(null)
    }
  }, [])

  useEffect(() => {
    void fetchApi<{ user: Me | null }>('/api/auth/me')
      .then((r) => setMe(r.user))
      .catch(() => undefined)
  }, [])

  useEffect(() => { void loadSettings() }, [loadSettings])
  useEffect(() => {
    if (tab === 'faq') void loadFaqs()
    if (tab === 'danger') void loadDemo()
  }, [tab, loadFaqs, loadDemo])

  // ── Draft helpers ──

  const field = (key: string): string => draft[key] ?? ''
  const setField = (key: string, value: string) => setDraft((d) => ({ ...d, [key]: value }))

  const isDirty = (keys: readonly string[]) =>
    saved !== null && keys.some((k) => (draft[k] ?? '') !== (saved[k] ?? ''))

  const validateSection = (keys: readonly string[]): string | null => {
    for (const k of keys) {
      const v = draft[k] ?? ''
      if (k === 'paymentTolerance') {
        const n = Number(v)
        if (!Number.isFinite(n) || n < 0) return t('errTolerance')
      }
      if (k === 'checkoutExpiryHours') {
        const n = Number(v)
        if (!Number.isFinite(n) || n < 1 || n > 720) return t('errExpiryHours')
      }
      if (k === 'invoiceDueDays') {
        const n = Number(v)
        if (!Number.isFinite(n) || n < 1 || n > 365) return t('errDueDays')
      }
      if (k === 'webhookAttemptLimit') {
        const n = Number(v)
        if (!Number.isFinite(n) || n < 1 || n > 10) return t('errWebhookAttempts')
      }
    }
    return null
  }

  const saveSection = async (keys: readonly string[], sectionId: string) => {
    const err = validateSection(keys)
    if (err) { toast.error(err); return }
    setSavingSection(sectionId)
    try {
      const values: SettingsMap = {}
      for (const k of keys) values[k] = draft[k] ?? ''
      const res = await fetchApi<{ settings: SettingsMap }>('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values }),
      })
      setSaved(res.settings)
      setDraft(res.settings)
      toast.success(t('setSavedToast'))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setSavingSection(null)
    }
  }

  // ── FAQ CRUD ──

  const openFaqCreate = () => {
    setEditingFaq(null)
    setFaqForm(EMPTY_FAQ_FORM)
    setFaqDialogOpen(true)
  }

  const openFaqEdit = (f: FaqItem) => {
    setEditingFaq(f)
    setFaqForm({ question: f.question, answer: f.answer, sortOrder: String(f.sortOrder), active: f.active })
    setFaqDialogOpen(true)
  }

  const submitFaq = async () => {
    if (!faqForm.question.trim() || !faqForm.answer.trim()) {
      toast.error(t('required'))
      return
    }
    setFaqSaving(true)
    try {
      const payload = {
        question: faqForm.question.trim(),
        answer: faqForm.answer.trim(),
        sortOrder: Number(faqForm.sortOrder) || 0,
        active: faqForm.active,
      }
      if (editingFaq) {
        await fetchApi(`/api/admin/faqs/${editingFaq.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        toast.success(t('faqUpdatedToast'))
      } else {
        await fetchApi('/api/admin/faqs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        toast.success(t('faqCreatedToast'))
      }
      setFaqDialogOpen(false)
      await loadFaqs()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setFaqSaving(false)
    }
  }

  const removeFaq = async () => {
    if (!deletingFaq) return
    try {
      await fetchApi(`/api/admin/faqs/${deletingFaq.id}`, { method: 'DELETE' })
      toast.success(t('faqDeletedToast'))
      setDeletingFaq(null)
      await loadFaqs()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Request failed')
    }
  }

  // ── Danger zone ──

  const runDemoAction = async () => {
    if (!demoConfirm) return
    setDemoBusy(true)
    try {
      if (demoConfirm === 'remove') {
        await fetchApi('/api/admin/demo-data', { method: 'DELETE' })
        toast.success(t('demoRemovedToast'))
      } else {
        await fetchApi('/api/admin/demo-data', { method: 'POST' })
        toast.success(t('demoRegeneratedToast'))
      }
      setDemoConfirm(null)
      await loadDemo()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setDemoBusy(false)
    }
  }

  // ── Small render helpers ──

  const sectionFooter = (keys: readonly string[], sectionId: string) => {
    if (!isAdmin) return null
    const dirty = isDirty(keys)
    return (
      <div className="mt-5 flex items-center justify-between border-t pt-4">
        <span className={cn('text-xs font-medium', dirty ? 'text-warning' : 'text-transparent')}>
          ● {t('unsavedDot')}
        </span>
        <Button
          className="press gap-1.5"
          disabled={!dirty || savingSection === sectionId}
          onClick={() => void saveSection(keys, sectionId)}
        >
          <Save className="h-4 w-4" />
          {savingSection === sectionId ? t('savingSection') : t('saveSection')}
        </Button>
      </div>
    )
  }

  const textInput = (key: string, label: string, opts?: { placeholder?: string; type?: string; className?: string }) => (
    <div key={key} className={cn('grid gap-1.5', opts?.className)}>
      <Label htmlFor={`set-${key}`}>{t(label)}</Label>
      <Input
        id={`set-${key}`}
        value={field(key)}
        type={opts?.type ?? 'text'}
        placeholder={opts?.placeholder}
        disabled={!isAdmin}
        onChange={(e) => setField(key, e.target.value)}
      />
    </div>
  )

  const logoFileRef = useRef<HTMLInputElement>(null)

  /** Brand logo: visual uploader (file → data-URL) or a pasted URL — shown on payment pages. */
  const logoUploader = () => {
    const val = field('brandLogo')
    return (
      <div className="grid gap-1.5">
        <Label htmlFor="set-brandLogo">{t('brandLogoLabel')}</Label>
        <div className="flex items-center gap-3 rounded-xl border bg-muted/20 p-3">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white ring-1 ring-black/5">
            {val ? (
               
              <img src={val} alt="Brand logo preview" className="h-full w-full object-contain p-1" />
            ) : (
              <Store className="h-5 w-5 text-muted-foreground/50" />
            )}
          </span>
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="press h-8 gap-1.5 text-xs"
                disabled={!isAdmin}
                onClick={() => logoFileRef.current?.click()}
              >
                <Upload className="h-3.5 w-3.5" /> {t('brandLogoUpload')}
              </Button>
              {val && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="press h-8 gap-1.5 text-xs text-destructive hover:text-destructive"
                  disabled={!isAdmin}
                  onClick={() => setField('brandLogo', '')}
                >
                  <Trash2 className="h-3.5 w-3.5" /> {t('brandLogoRemove')}
                </Button>
              )}
            </div>
            <Input
              id="set-brandLogo"
              value={val.startsWith('data:') ? '' : val}
              placeholder={t('brandLogoPh')}
              disabled={!isAdmin}
              onChange={(e) => setField('brandLogo', e.target.value)}
              className="h-9 text-xs"
            />
            <p className="text-[11px] text-muted-foreground">{t('brandLogoHint')}</p>
          </div>
        </div>
        <input
          ref={logoFileRef}
          type="file"
          accept="image/png,image/jpeg,image/svg+xml,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (!f) return
            if (f.size > 300 * 1024) {
              toast.error(t('brandLogoTooBig'))
              return
            }
            const reader = new FileReader()
            reader.onload = () => setField('brandLogo', String(reader.result ?? ''))
            reader.readAsDataURL(f)
          }}
        />
      </div>
    )
  }

  if (loading && !saved) {
    return (
      <div>
        <PageHeader title={t('setTitle')} description={t('setDescription')} icon={<SettingsIcon className="h-5 w-5" />} />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      </div>
    )
  }

  if (error && !saved) {
    return (
      <div>
        <PageHeader title={t('setTitle')} description={t('setDescription')} icon={<SettingsIcon className="h-5 w-5" />} />
        <ErrorCard message={error} onRetry={() => void loadSettings()} />
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title={t('setTitle')}
        description={t('setDescription')}
        icon={<SettingsIcon className="h-5 w-5" />}
      />

      {!isAdmin && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-warning/30 bg-warning/5 px-3.5 py-2.5 text-xs text-amber-700 dark:text-amber-400">
          <TriangleAlert className="h-4 w-4 shrink-0" />
          {t('readOnlyHint')}
        </div>
      )}

      <Tabs value={tab} onValueChange={(v) => set({ tab: v === 'general' ? null : v })}>
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 sm:grid sm:w-full sm:grid-cols-5">
          <TabsTrigger value="general" className="gap-1.5 px-3">{t('setTabGeneral')}</TabsTrigger>
          <TabsTrigger value="payment" className="gap-1.5 px-3">{t('setTabPayment')}</TabsTrigger>
          <TabsTrigger value="support" className="gap-1.5 px-3">{t('setTabSupport')}</TabsTrigger>
          <TabsTrigger value="faq" className="gap-1.5 px-3">{t('setTabFaq')}</TabsTrigger>
          <TabsTrigger value="danger" className="gap-1.5 px-3">{t('setTabDanger')}</TabsTrigger>
        </TabsList>

        {/* ── General ── */}
        <TabsContent value="general" className="mt-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-5 shadow-brand">
              <div className="mb-4 flex items-center gap-2">
                <div className="rounded-lg bg-primary/10 p-2 text-primary"><Store className="h-4 w-4" /></div>
                <div>
                  <h2 className="text-sm font-bold text-foreground">{t('generalBrandCard')}</h2>
                  <p className="text-[11px] text-muted-foreground">{t('generalBrandHint')}</p>
                </div>
              </div>
              <div className="grid gap-4">
                {textInput('brandName', 'brandNameLabel', { placeholder: t('brandNamePh') })}
                {textInput('brandTagline', 'brandTaglineLabel', { placeholder: t('brandTaglinePh') })}
                {logoUploader()}
              </div>
            </Card>

            <Card className="p-5 shadow-brand">
              <div className="mb-4 flex items-center gap-2">
                <div className="rounded-lg bg-primary/10 p-2 text-primary"><Sparkles className="h-4 w-4" /></div>
                <div>
                  <h2 className="text-sm font-bold text-foreground">{t('generalPrefsCard')}</h2>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label>{t('defaultLanguageLabel')}</Label>
                  <Select
                    value={field('defaultLanguage') || 'en'}
                    onValueChange={(v) => setField('defaultLanguage', v)}
                    disabled={!isAdmin}
                  >
                    <SelectTrigger aria-label={t('defaultLanguageLabel')}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">{t('langEn')}</SelectItem>
                      <SelectItem value="bn">{t('langBn')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {textInput('currency', 'currencyLabel', { placeholder: 'BDT' })}
                {textInput('currencySymbol', 'currencySymbolLabel', { placeholder: '৳' })}
                <div className="flex items-center justify-between gap-3 rounded-xl border p-3 sm:col-span-2">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{t('landingEnabledLabel')}</p>
                    <p className="text-[11px] text-muted-foreground">{t('landingEnabledHint')}</p>
                  </div>
                  <Switch
                    checked={(field('landingEnabled') || 'true') === 'true'}
                    disabled={!isAdmin}
                    onCheckedChange={(v) => setField('landingEnabled', v ? 'true' : 'false')}
                    aria-label={t('landingEnabledLabel')}
                  />
                </div>
                <div className="grid gap-1.5 rounded-xl border p-3 sm:col-span-2">
                  <Label className="flex items-center gap-2">
                    {t('setAppMode')}
                    {(field('appMode') || 'SANDBOX') === 'SANDBOX' ? (
                      <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400">TEST</span>
                    ) : (
                      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">LIVE</span>
                    )}
                  </Label>
                  <p className="text-[11px] text-muted-foreground">{t('setAppModeHint')}</p>
                  <Select
                    value={field('appMode') || 'SANDBOX'}
                    onValueChange={(v) => setField('appMode', v)}
                    disabled={!isAdmin}
                  >
                    <SelectTrigger aria-label={t('setAppMode')} className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SANDBOX">{t('modeSandbox')}</SelectItem>
                      <SelectItem value="PRODUCTION">{t('modeProduction')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </Card>
          </div>
          {sectionFooter(GENERAL_KEYS, 'general')}
        </TabsContent>

        {/* ── Payment ── */}
        <TabsContent value="payment" className="mt-4">
          <div className="grid gap-4">
            <Card className="p-5 shadow-brand">
              <div className="mb-4 flex items-center gap-2">
                <div className="rounded-lg bg-primary/10 p-2 text-primary"><CreditCard className="h-4 w-4" /></div>
                <div>
                  <h2 className="text-sm font-bold text-foreground">{t('payNumbersCard')}</h2>
                  <p className="text-[11px] text-muted-foreground">{t('payNumbersHint')}</p>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {MFS_FIELDS.map((f) => textInput(f.key, f.label, { placeholder: '01XXXXXXXXX' }))}
              </div>
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="p-5 shadow-brand">
                <div className="mb-4 flex items-center gap-2">
                  <div className="rounded-lg bg-primary/10 p-2 text-primary"><CreditCard className="h-4 w-4" /></div>
                  <div>
                    <h2 className="text-sm font-bold text-foreground">{t('payBankCard')}</h2>
                    <p className="text-[11px] text-muted-foreground">{t('payBankHint')}</p>
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="set-bank_hint">{t('bankHintLabel')}</Label>
                  <Textarea
                    id="set-bank_hint"
                    rows={2}
                    value={field('bank_hint')}
                    placeholder={t('bankHintPh')}
                    disabled={!isAdmin}
                    onChange={(e) => setField('bank_hint', e.target.value)}
                  />
                </div>
              </Card>

              <Card className="p-5 shadow-brand">
                <div className="mb-4 flex items-center gap-2">
                  <div className="rounded-lg bg-primary/10 p-2 text-primary"><SettingsIcon className="h-4 w-4" /></div>
                  <div>
                    <h2 className="text-sm font-bold text-foreground">{t('payLimitsCard')}</h2>
                    <p className="text-[11px] text-muted-foreground">{t('payLimitsHint')}</p>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {textInput('paymentTolerance', 'paymentToleranceLabel', { type: 'number', placeholder: '0' })}
                  {textInput('checkoutExpiryHours', 'checkoutExpiryHoursLabel', { type: 'number', placeholder: '24' })}
                  {textInput('invoiceDueDays', 'invoiceDueDaysLabel', { type: 'number', placeholder: '7' })}
                  {textInput('webhookAttemptLimit', 'webhookAttemptLimitLabel', { type: 'number', placeholder: '5' })}
                </div>
                <p className="mt-3 text-[11px] text-muted-foreground">{t('paymentToleranceHint')}</p>
              </Card>
            </div>
          </div>
          {sectionFooter(PAYMENT_KEYS, 'payment')}
        </TabsContent>

        {/* ── Support ── */}
        <TabsContent value="support" className="mt-4">
          <Card className="max-w-2xl p-5 shadow-brand">
            <div className="mb-4 flex items-center gap-2">
              <div className="rounded-lg bg-primary/10 p-2 text-primary"><LifeBuoy className="h-4 w-4" /></div>
              <div>
                <h2 className="text-sm font-bold text-foreground">{t('supportCard')}</h2>
                <p className="text-[11px] text-muted-foreground">{t('supportHint')}</p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {textInput('supportPhone', 'supportPhoneLabel', { placeholder: '+880 1711 000000' })}
              {textInput('supportEmail', 'supportEmailLabel', { type: 'email', placeholder: 'support@example.com' })}
              {textInput('supportWhatsApp', 'supportWhatsappLabel', { placeholder: '+880 1711 000000' })}
              {textInput('supportTelegram', 'supportTelegramLabel', { placeholder: t('supportTelegramPh') })}
            </div>
          </Card>
          {sectionFooter(SUPPORT_KEYS, 'support')}
        </TabsContent>

        {/* ── FAQ ── */}
        <TabsContent value="faq" className="mt-4">
          <div className="mb-4 flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">{t('faqDescription')}</p>
            <Button className="press gap-1.5" onClick={openFaqCreate} disabled={!canWriteFaq}>
              <Plus className="h-4 w-4" /> {t('faqAdd')}
            </Button>
          </div>

          {faqsError && !faqs ? (
            <ErrorCard message={faqsError} onRetry={() => void loadFaqs()} />
          ) : faqsLoading && !faqs ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
          ) : !faqs || faqs.length === 0 ? (
            <Card className="border-dashed p-2 shadow-brand">
              <EmptyState
                icon={<HelpCircle className="h-7 w-7" />}
                title={t('faqEmpty')}
                hint={t('faqEmptyHint')}
                action={
                  canWriteFaq ? (
                    <Button className="press gap-1.5" onClick={openFaqCreate}>
                      <Plus className="h-4 w-4" /> {t('faqAdd')}
                    </Button>
                  ) : undefined
                }
              />
            </Card>
          ) : (
            <div className="stagger grid gap-3">
              {faqs.map((f) => (
                <Card key={f.id} className="hover-lift p-4 shadow-brand">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-foreground">{f.question}</p>
                        <Badge
                          variant="outline"
                          className={cn('shrink-0', f.active ? 'border-success/20 bg-success/10 text-success' : 'border-border bg-muted text-muted-foreground')}
                        >
                          {f.active ? t('faqVisible') : t('faqHidden')}
                        </Badge>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{f.answer}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <span className="mr-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">#{f.sortOrder}</span>
                      <Button
                        variant="ghost" size="icon" className="press h-7 w-7"
                        title={t('edit')} aria-label={t('edit')} disabled={!canWriteFaq}
                        onClick={() => openFaqEdit(f)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="icon"
                        className="press h-7 w-7 text-destructive hover:text-destructive"
                        title={t('delete')} aria-label={t('delete')} disabled={!isAdmin}
                        onClick={() => setDeletingFaq(f)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Danger zone ── */}
        <TabsContent value="danger" className="mt-4">
          <Card className="border-destructive/25 p-5 shadow-brand">
            <div className="mb-4 flex items-center gap-2">
              <div className="rounded-lg bg-destructive/10 p-2 text-destructive"><TriangleAlert className="h-4 w-4" /></div>
              <div>
                <h2 className="text-sm font-bold text-foreground">{t('dangerTitle')}</h2>
                <p className="text-[11px] text-muted-foreground">{t('dangerDescription')}</p>
              </div>
            </div>

            <div className="rounded-xl border p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-muted p-2 text-muted-foreground"><DatabaseZap className="h-4 w-4" /></div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{t('demoCard')}</p>
                    <p className="text-[11px] leading-relaxed text-muted-foreground">{t('demoHint')}</p>
                    <div className="mt-2">
                      {demoSeeded === null ? (
                        <Skeleton className="h-5 w-40" />
                      ) : (
                        <Badge variant="outline" className={demoSeeded ? 'border-warning/30 bg-warning/10 text-amber-700 dark:text-amber-400' : 'border-border bg-muted text-muted-foreground'}>
                          {demoSeeded ? t('demoStatus') : t('demoStatusEmpty')}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button
                    variant="outline"
                    className="press gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    disabled={!isAdmin || demoBusy || demoSeeded === false}
                    onClick={() => setDemoConfirm('remove')}
                  >
                    <Trash2 className="h-4 w-4" /> {t('demoRemove')}
                  </Button>
                  <Button
                    variant="outline"
                    className="press gap-1.5"
                    disabled={!isAdmin || demoBusy}
                    onClick={() => setDemoConfirm('regenerate')}
                  >
                    <RefreshCw className={cn('h-4 w-4', demoBusy && 'animate-spin')} /> {t('demoRegenerate')}
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {/* FAQ add / edit dialog */}
      <Dialog open={faqDialogOpen} onOpenChange={setFaqDialogOpen}>
        <DialogContent className="nice-scroll max-h-[92vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingFaq ? t('faqEdit') : t('faqAdd')}</DialogTitle>
            <DialogDescription className="sr-only">{t('faqDescription')}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="faq-question">{t('faqQuestionLabel')} *</Label>
              <Input
                id="faq-question"
                value={faqForm.question}
                onChange={(e) => setFaqForm({ ...faqForm, question: e.target.value })}
                placeholder={t('faqQuestionPh')}
                autoFocus
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="faq-answer">{t('faqAnswerLabel')} *</Label>
              <Textarea
                id="faq-answer"
                rows={4}
                value={faqForm.answer}
                onChange={(e) => setFaqForm({ ...faqForm, answer: e.target.value })}
                placeholder={t('faqAnswerPh')}
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div className="w-36">
                <Label htmlFor="faq-sort">{t('faqSortOrder')}</Label>
                <Input
                  id="faq-sort"
                  type="number"
                  className="tabular mt-1.5"
                  value={faqForm.sortOrder}
                  onChange={(e) => setFaqForm({ ...faqForm, sortOrder: e.target.value })}
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="faq-active"
                  checked={faqForm.active}
                  onCheckedChange={(v) => setFaqForm({ ...faqForm, active: v })}
                  aria-label={t('faqActiveLabel')}
                />
                <Label htmlFor="faq-active" className="cursor-pointer text-xs">{t('faqActiveLabel')}</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFaqDialogOpen(false)}>{t('cancel')}</Button>
            <Button className="press" onClick={() => void submitFaq()} disabled={faqSaving}>
              {editingFaq ? t('saveChanges') : t('create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* FAQ delete confirm */}
      <AlertDialog open={!!deletingFaq} onOpenChange={(o) => !o && setDeletingFaq(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('faqDeleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{deletingFaq?.question}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); void removeFaq() }}
            >
              {t('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Demo data confirm */}
      <AlertDialog open={!!demoConfirm} onOpenChange={(o) => !o && setDemoConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{demoConfirm === 'remove' ? t('demoRemove') : t('demoRegenerate')}</AlertDialogTitle>
            <AlertDialogDescription>
              {demoConfirm === 'remove' ? t('demoRemoveBody') : t('demoRegenerateBody')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={demoBusy}
              onClick={(e) => { e.preventDefault(); void runDemoAction() }}
            >
              {demoConfirm === 'remove' ? t('demoRemoveCta') : t('demoRegenerateCta')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
