'use client'

import { useEffect, useState } from 'react'
import {
  Code2, BookOpen, KeyRound, PlusCircle, BadgeCheck, Webhook, Smartphone, TriangleAlert,
  Copy, Check, ShieldCheck,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { copyText, CopyButton, PageHeader } from './ui-bits'
import { cn } from '@/lib/utils'
import { useLang } from '@/lib/i18n'
import { fetchApi } from '@/lib/api-client'

// ── Small building blocks ────────────────────────────────────────────────────

function CodeBlock({ code, label }: { code: string; label?: string }) {
  const { t } = useLang()
  const [copied, setCopied] = useState(false)
  return (
    <div className="group relative">
      <pre className="nice-scroll overflow-x-auto rounded-lg bg-muted p-4 font-mono text-xs leading-relaxed text-foreground">
        {code}
      </pre>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="press absolute right-2.5 top-2.5 h-7 gap-1.5 bg-background/90 px-2 text-xs backdrop-blur"
        onClick={async () => {
          if (await copyText(code)) {
            setCopied(true)
            toast.success(t('copied'))
            setTimeout(() => setCopied(false), 1500)
          }
        }}
        aria-label={t('copyCode')}
      >
        {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
        {copied ? t('copied') : t('copy')}
      </Button>
      {label && (
        <span className="pointer-events-none absolute left-3 top-2.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground/70">
          {label}
        </span>
      )}
    </div>
  )
}

function MethodBadge({ method }: { method: 'GET' | 'POST' }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-md px-2 py-0.5 font-mono text-[11px] font-bold',
        method === 'GET' ? 'bg-primary/10 text-primary' : 'bg-success/10 text-success'
      )}
    >
      {method}
    </span>
  )
}

function AuthBadge({ kind }: { kind: 'public' | 'key' | 'device' }) {
  const { t } = useLang()
  const map = {
    public: { label: t('docsBadgePublic'), cls: 'border-success/20 bg-success/10 text-success' },
    key: { label: t('docsBadgeKey'), cls: 'border-warning/30 bg-warning/10 text-amber-700 dark:text-amber-400' },
    device: { label: t('docsBadgeDevice'), cls: 'border-primary/25 bg-primary/10 text-primary' },
  } as const
  return <Badge variant="outline" className={cn('shrink-0 text-[10px] font-bold', map[kind].cls)}>{map[kind].label}</Badge>
}

function Section({
  id, icon, title, badge, method, path, children,
}: {
  id: string
  icon: React.ReactNode
  title: string
  badge?: 'public' | 'key' | 'device'
  method?: 'GET' | 'POST'
  path?: string
  children: React.ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <Card className="p-5 shadow-brand sm:p-6">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="rounded-xl bg-primary/10 p-2.5 text-primary">{icon}</div>
          <h2 className="text-base font-bold text-foreground sm:text-lg">{title}</h2>
          {badge && <AuthBadge kind={badge} />}
        </div>
        {path && (
          <div className="mt-3 flex items-center gap-2 overflow-x-auto rounded-lg border bg-muted/50 px-3 py-2">
            {method && <MethodBadge method={method} />}
            <code className="whitespace-nowrap font-mono text-xs font-semibold text-foreground">{path}</code>
          </div>
        )}
        <div className="mt-4">{children}</div>
      </Card>
    </section>
  )
}

function FieldTable({ rows, headers }: { rows: Array<[string, string, string, string]>; headers: [string, string, string, string] }) {
  const { t } = useLang()
  return (
    <div className="nice-scroll overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b bg-muted/50 text-left">
            {headers.map((h) => (
              <th key={h} className="px-3.5 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([field, type, required, desc]) => (
            <tr key={field} className="border-b last:border-0">
              <td className="px-3.5 py-2.5 font-mono text-xs font-semibold text-foreground">{field}</td>
              <td className="px-3.5 py-2.5 font-mono text-xs text-muted-foreground">{type}</td>
              <td className="px-3.5 py-2.5">
                <span className={cn('text-xs font-semibold', required === '✓' || required === '✔' ? 'text-destructive' : 'text-muted-foreground')}>
                  {required === '✓' ? t('required') : t('optional')}
                </span>
              </td>
              <td className="px-3.5 py-2.5 text-xs text-foreground/80">{desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Component ────────────────────────────────────────────────────────────────

const SECTIONS = [
  { id: 'docs-overview', label: 'secOverview', icon: BookOpen },
  { id: 'docs-auth', label: 'secAuthentication', icon: KeyRound },
  { id: 'docs-create', label: 'secCreatePayment', icon: PlusCircle },
  { id: 'docs-verify', label: 'secVerifyPayment', icon: BadgeCheck },
  { id: 'docs-webhooks', label: 'secWebhooks', icon: Webhook },
  { id: 'docs-device', label: 'secDeviceApi', icon: Smartphone },
  { id: 'docs-errors', label: 'secErrors', icon: TriangleAlert },
] as const

export function ApiDocsView() {
  const { t } = useLang()
  const [origin, setOrigin] = useState('')
  const [retryLimit, setRetryLimit] = useState('5')

  useEffect(() => {
    let alive = true
    // Deferred microtask: avoids sync setState-in-effect and SSR hydration mismatch
    void Promise.resolve().then(() => {
      if (alive) setOrigin(window.location.origin)
    })
    void fetchApi<{ settings: Record<string, string> }>('/api/admin/settings')
      .then((r) => {
        if (alive) setRetryLimit(r.settings.webhookAttemptLimit || '5')
      })
      .catch(() => undefined)
    return () => { alive = false }
  }, [])

  const B = origin || 'https://your-panel.com'

  const createPayloadRows: Array<[string, string, string, string]> = [
    ['amount', 'number', '✓', t('cpFieldAmount')],
    ['customer_name', 'string', '', t('cpFieldCustomerName')],
    ['customer_email', 'string', '', t('cpFieldCustomerEmail')],
    ['customer_mobile', 'string', '', t('cpFieldCustomerMobile')],
    ['redirect_url', 'string (url)', '', t('cpFieldRedirectUrl')],
    ['cancel_url', 'string (url)', '', t('cpFieldCancelUrl')],
    ['webhook_url', 'string (url)', '', t('cpFieldWebhookUrl')],
    ['metadata', 'object', '', t('cpFieldMetadata')],
  ]

  const createResponseRows: Array<[string, string, string, string]> = [
    ['payment_id', 'string', '✓', t('cpFieldPaymentId')],
    ['token', 'string', '✓', t('cpFieldToken')],
    ['checkout_url', 'string (url)', '✓', t('cpFieldCheckoutUrl')],
    ['status', 'string', '✓', t('cpFieldStatus')],
  ]

  const verifyResponseRows: Array<[string, string, string, string]> = [
    ['status', 'string', '✓', t('vpFieldStatusNote')],
    ['amount', 'number', '✓', '—'],
    ['paid_trx_id', 'string', '', t('vpFieldPaidTrxId')],
    ['paid_at', 'string (iso)', '', '—'],
    ['metadata', 'object', '', '—'],
  ]

  const errorRows: Array<[string, string, string]> = [
    ['MISSING_API_KEY', '401', t('erMissingKey')],
    ['INVALID_API_KEY', '401', t('erInvalidKey')],
    ['INSUFFICIENT_SCOPE', '403', t('erInsufficientScope')],
    ['VALIDATION_ERROR', '400', t('erValidation')],
    ['INVALID_JSON', '400', t('erInvalidJson')],
    ['RATE_LIMITED', '429', t('erRateLimited')],
    ['KEY_REVOKED', '403', t('erKeyRevoked')],
    ['KEY_EXPIRED', '403', t('erKeyExpired')],
    ['STORE_INACTIVE', '403', t('erStoreInactive')],
    ['NOT_FOUND', '404', t('erNotFound')],
    ['INTERNAL', '500', t('erInternal')],
  ]

  const curlExample = `curl -X POST ${B}/api/v1/checkout \\
  -H "Authorization: Bearer sk_live_xxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "amount": 1500,
    "customer_name": "Rahim",
    "customer_mobile": "01711000000",
    "redirect_url": "https://yourshop.com/thanks",
    "cancel_url": "https://yourshop.com/cancel",
    "metadata": { "order_id": "1001" }
  }'`

  const jsExample = `const res = await fetch("${B}/api/v1/checkout", {
  method: "POST",
  headers: {
    "Authorization": "Bearer sk_live_xxxxxxxx",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    amount: 1500,
    customer_name: "Rahim",
    customer_mobile: "01711000000",
    redirect_url: "https://yourshop.com/thanks",
    metadata: { order_id: "1001" },
  }),
});
const payment = await res.json();
// redirect the customer:
window.location.href = payment.checkout_url;`

  const createResponseJson = `{
  "payment_id": "pay_7f3a9b2c",
  "token": "Kx9mTa2vQe8Z",
  "checkout_url": "${B}/pay/Kx9mTa2vQe8Z",
  "status": "PENDING"
}`

  const verifyResponseJson = `{
  "status": "PAID",
  "amount": 1500,
  "paid_trx_id": "9HX7A2K1LM",
  "paid_at": "2025-01-01T10:31:22.000Z",
  "metadata": { "order_id": "1001" }
}`

  const signaturePseudo = `import crypto from "crypto"

function isValidSignature(rawBody, secret, header) {
  // header format: "t=<timestamp>,v1=<hex signature>"
  const parts = Object.fromEntries(
    header.split(",").map((kv) => kv.split("="))
  );
  const expected = crypto
    .createHmac("sha256", secret)
    .update(\`\${parts.t}.\${rawBody}\`)  // "<timestamp>.<raw body>"
    .digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(parts.v1)
  );
}
// reject when the timestamp is older than ~5 minutes`

  const webhookPayloadJson = `{
  "event": "checkout.paid",
  "created_at": "2025-01-01T10:31:22.000Z",
  "data": {
    "id": "ck_7f3a9b2c",
    "token": "Kx9mTa2vQe8Z",
    "status": "PAID",
    "amount": 1500,
    "currency": "BDT",
    "paid_trx_id": "9HX7A2K1LM",
    "customer_name": "Rahim",
    "customer_phone": "01711000000",
    "metadata": { "order_id": "1001" }
  }
}`

  const smsExample = `curl -X POST ${B}/api/v1/sms \\
  -H "X-Device-Key: ilp_xxxxxxxxxxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "messages": [
      {
        "sender": "bKash",
        "body": "You have received Tk 1,500.00 from 01711000000. Ref 1. Fee Tk 0.00. Balance Tk 25,000.00. TrxID 9HX7A2K1LM",
        "receivedAt": "2025-01-01T10:30:59.000Z"
      }
    ]
  }'

# single message also works:
# { "sender": "bKash", "body": "..." }`

  const heartbeatExample = `curl -X POST ${B}/api/v1/heartbeat \\
  -H "X-Device-Key: ilp_xxxxxxxxxxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "battery": 87,
    "signal": "4G",
    "model": "Pixel 6a",
    "sims": [{ "number": "01711000000", "carrier": "GP" }]
  }'`

  const errorResponseJson = `{
  "error": "Invalid API key",
  "code": "INVALID_API_KEY"
}`

  return (
    <div>
      <PageHeader
        title={t('docsTitle')}
        description={t('docsDescription')}
        icon={<Code2 className="h-5 w-5" />}
        actions={
          <Badge variant="outline" className="shrink-0 border-primary/25 bg-primary/5 px-2.5 py-1 font-mono text-[11px] font-bold text-primary">
            {t('docsVersion')}
          </Badge>
        }
      />

      {/* Base URL + section chips */}
      <Card className="mb-4 p-4 shadow-brand">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 shrink-0 text-success" />
            <span className="text-xs font-semibold text-muted-foreground">{t('docsBaseUrl')}</span>
            <code className="min-w-0 truncate rounded-md bg-muted px-2 py-1 font-mono text-xs font-bold text-foreground">
              {origin || '…'}
            </code>
            {origin && <CopyButton value={origin} compact className="shrink-0" />}
          </div>
        </div>
        <nav aria-label={t('docsOnThisPage')} className="nice-scroll mt-3 flex gap-1.5 overflow-x-auto pb-1">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="press flex shrink-0 items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
              onClick={(e) => {
                e.preventDefault()
                document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }}
            >
              <s.icon className="h-3.5 w-3.5" />
              {t(s.label)}
            </a>
          ))}
        </nav>
      </Card>

      <div className="stagger space-y-4">
        {/* ── Overview ── */}
        <Section id="docs-overview" icon={<BookOpen className="h-5 w-5" />} title={t('secOverview')}>
          <p className="text-sm leading-relaxed text-foreground/85">{t('ovLead')}</p>
          <div className="mt-4 rounded-xl border p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{t('ovStepsTitle')}</p>
            <ol className="mt-2.5 space-y-2">
              {(['ovStep1', 'ovStep2', 'ovStep3', 'ovStep4', 'ovStep5'] as const).map((k, i) => (
                <li key={k} className="flex items-start gap-2.5 text-sm text-foreground/85">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                    {i + 1}
                  </span>
                  {t(k)}
                </li>
              ))}
            </ol>
          </div>
        </Section>

        {/* ── Authentication ── */}
        <Section id="docs-auth" icon={<KeyRound className="h-5 w-5" />} title={t('secAuthentication')} badge="key">
          <p className="text-sm leading-relaxed text-foreground/85">{t('authLead')}</p>
          <div className="mt-4 space-y-3">
            <div>
              <p className="mb-1.5 text-xs font-semibold text-muted-foreground">{t('authHeaderLabel')}</p>
              <CodeBlock code={`Authorization: Bearer sk_live_xxxxxxxxxxxxxxxx`} />
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">{t('authScopeNote')}</p>
            <p className="flex items-start gap-1.5 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-xs leading-relaxed text-amber-700 dark:text-amber-400">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {t('authNeverShare')}
            </p>
          </div>
        </Section>

        {/* ── Create payment ── */}
        <Section
          id="docs-create" icon={<PlusCircle className="h-5 w-5" />} title={t('secCreatePayment')}
          badge="key" method="POST" path="/api/v1/checkout"
        >
          <p className="text-sm leading-relaxed text-foreground/85">{t('cpLead')}</p>

          <div className="mt-4 space-y-4">
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">{t('cpPayloadTitle')}</p>
              <FieldTable rows={createPayloadRows} headers={[t('cpFieldCol'), t('cpTypeCol'), t('cpRequiredCol'), t('cpDescCol')]} />
            </div>

            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">{t('cpResponseTitle')}</p>
              <div className="mb-2"><FieldTable rows={createResponseRows} headers={[t('cpFieldCol'), t('cpTypeCol'), t('cpRequiredCol'), t('cpDescCol')]} /></div>
              <CodeBlock code={createResponseJson} label="JSON" />
            </div>

            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">{t('cpExamplesTitle')}</p>
              <Tabs defaultValue="curl">
                <TabsList className="mb-2">
                  <TabsTrigger value="curl" className="px-3">{t('tabCurl')}</TabsTrigger>
                  <TabsTrigger value="js" className="px-3">{t('tabJs')}</TabsTrigger>
                </TabsList>
                <TabsContent value="curl"><CodeBlock code={curlExample} /></TabsContent>
                <TabsContent value="js"><CodeBlock code={jsExample} /></TabsContent>
              </Tabs>
            </div>
          </div>
        </Section>

        {/* ── Verify payment ── */}
        <Section
          id="docs-verify" icon={<BadgeCheck className="h-5 w-5" />} title={t('secVerifyPayment')}
          badge="key" method="GET" path="/api/v1/checkout/{token}"
        >
          <p className="text-sm leading-relaxed text-foreground/85">{t('vpLead')}</p>
          <div className="mt-4">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">{t('vpResponseTitle')}</p>
            <div className="mb-2"><FieldTable rows={verifyResponseRows} headers={[t('cpFieldCol'), t('cpTypeCol'), t('cpRequiredCol'), t('cpDescCol')]} /></div>
            <CodeBlock code={verifyResponseJson} label="JSON" />
          </div>
        </Section>

        {/* ── Webhooks ── */}
        <Section id="docs-webhooks" icon={<Webhook className="h-5 w-5" />} title={t('secWebhooks')} badge="public">
          <p className="text-sm leading-relaxed text-foreground/85">{t('whLead')}</p>

          <div className="mt-4 space-y-4">
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">{t('whEventsTitle')}</p>
              <div className="nice-scroll overflow-x-auto rounded-xl border">
                <table className="w-full min-w-[440px] text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-left">
                      <th className="px-3.5 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('whEventCol')}</th>
                      <th className="px-3.5 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('whFiredCol')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {([
                      ['whEventCheckoutPaid', 'whEventCheckoutPaidDesc'],
                      ['whEventInvoicePaid', 'whEventInvoicePaidDesc'],
                      ['whEventTransactionMatched', 'whEventTransactionMatchedDesc'],
                      ['whEventTransactionReversed', 'whEventTransactionReversedDesc'],
                      ['whEventTest', 'whEventTestDesc'],
                    ] as const).map(([ev, desc]) => (
                      <tr key={ev} className="border-b last:border-0">
                        <td className="px-3.5 py-2.5 font-mono text-xs font-semibold text-foreground">{t(ev)}</td>
                        <td className="px-3.5 py-2.5 text-xs text-foreground/80">{t(desc)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <p className="font-semibold text-foreground">{t('whSignatureTitle')}</p>
              <p className="mt-1 text-sm leading-relaxed text-foreground/85">{t('whSignatureLead')}</p>
              <div className="mt-2 space-y-2">
                <CodeBlock code={`X-Invokeil-Signature: t=1735732812000,v1=5257a869e7ecebeda32affa62cdca3fa51cad7e77a0e56ff536d0ce8e108d8bd`} label={t('whHeaderLabel')} />
                <CodeBlock code={signaturePseudo} label="Node.js" />
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">{t('whPayloadTitle')}</p>
              <CodeBlock code={webhookPayloadJson} label="JSON" />
            </div>

            <p className="text-xs leading-relaxed text-muted-foreground">
              {t('whRetryNote').replace('{n}', retryLimit)}
            </p>
          </div>
        </Section>

        {/* ── Device API ── */}
        <Section id="docs-device" icon={<Smartphone className="h-5 w-5" />} title={t('secDeviceApi')} badge="device">
          <p className="text-sm leading-relaxed text-foreground/85">{t('dvLead')}</p>
          <div className="mt-2">
            <CodeBlock code={`X-Device-Key: ilp_xxxxxxxxxxxxxxxx`} label={t('docsBadgeDevice')} />
          </div>

          <div className="mt-4 space-y-4">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <MethodBadge method="POST" />
                <code className="font-mono text-xs font-semibold text-foreground">/api/v1/sms</code>
              </div>
              <p className="mb-2 text-sm text-foreground/85">{t('dvIngestDesc')}</p>
              <FieldTable
                rows={[
                  ['sender', 'string', '✓', t('dvFieldSender')],
                  ['body', 'string', '✓', t('dvFieldBody')],
                  ['receivedAt', 'string (iso)', '', t('dvFieldReceivedAt')],
                  ['simNumber', 'string', '', t('dvFieldSimNumber')],
                ]}
                headers={[t('cpFieldCol'), t('cpTypeCol'), t('cpRequiredCol'), t('cpDescCol')]}
              />
              <div className="mt-2"><CodeBlock code={smsExample} /></div>
            </div>

            <div>
              <div className="mb-2 flex items-center gap-2">
                <MethodBadge method="POST" />
                <code className="font-mono text-xs font-semibold text-foreground">/api/v1/heartbeat</code>
              </div>
              <p className="mb-2 text-sm text-foreground/85">{t('dvHeartbeatDesc')}</p>
              <FieldTable
                rows={[
                  ['battery', 'number', '', t('dvFieldBattery')],
                  ['signal', 'string', '', t('dvFieldSignal')],
                  ['sims', 'array', '', t('dvFieldSims')],
                ]}
                headers={[t('cpFieldCol'), t('cpTypeCol'), t('cpRequiredCol'), t('cpDescCol')]}
              />
              <div className="mt-2"><CodeBlock code={heartbeatExample} /></div>
            </div>
          </div>
        </Section>

        {/* ── Errors ── */}
        <Section id="docs-errors" icon={<TriangleAlert className="h-5 w-5" />} title={t('secErrors')}>
          <p className="text-sm leading-relaxed text-foreground/85">{t('erLead')}</p>
          <div className="mt-2 mb-4 max-w-sm"><CodeBlock code={errorResponseJson} label="JSON" /></div>
          <div className="nice-scroll overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left">
                  <th className="px-3.5 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('erCodeCol')}</th>
                  <th className="px-3.5 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('erHttpCol')}</th>
                  <th className="px-3.5 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('erMeaningCol')}</th>
                </tr>
              </thead>
              <tbody>
                {errorRows.map(([code, http, meaning]) => (
                  <tr key={code} className="border-b last:border-0">
                    <td className="px-3.5 py-2.5 font-mono text-xs font-semibold text-foreground">{code}</td>
                    <td className="px-3.5 py-2.5 font-mono text-xs text-muted-foreground">{http}</td>
                    <td className="px-3.5 py-2.5 text-xs text-foreground/80">{meaning}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </div>
    </div>
  )
}
