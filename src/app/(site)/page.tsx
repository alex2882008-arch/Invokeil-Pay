import type { Metadata } from 'next'
import Link from 'next/link'
import {
  ArrowRight, BookOpen, Smartphone, Wallet, Link2, ReceiptText, Repeat, Workflow,
  Mail, RadioTower, ShieldCheck, Terminal, FlaskConical, Layers, CheckCircle2,
} from 'lucide-react'
import { CopyButton } from '@/components/site/copy-button'
import { SITE } from '@/lib/site/site-config'

export const metadata: Metadata = {
  title: 'Invokeil Pay — Self-hosted MFS Payment Automation for Bangladesh',
  description: SITE.description,
  alternates: { canonical: '/' },
}

const STATS = [
  { value: '56+', label: 'MFS & bank gateways', sub: 'bKash, Nagad, Rocket, Upay, CellFin and more' },
  { value: '<1s', label: 'SMS → transaction match', sub: 'device inbox parsed and verified in real time' },
  { value: '320', label: 'Email templates', sub: 'branded receipts, invoices and dunning out of the box' },
  { value: '100%', label: 'Self-hosted', sub: 'your server, your keys, your customer data' },
]

const FEATURES = [
  { icon: Smartphone, title: 'MFS automation', desc: 'Pair any Android phone, and every bKash/Nagad/Rocket SMS is parsed, de-duplicated and matched to an open payment automatically — no manual reconciliation.' },
  { icon: Wallet, title: '56 gateways', desc: 'A curated catalogue of mobile financial services, banks and PSPs with per-gateway charges, wallet numbers, QR instructions and live enable/disable.' },
  { icon: Link2, title: 'Payment links', desc: 'Share a short URL that customers pay from any messenger. Optional password, expiry, usage limits and per-gateway wallet routing built in.' },
  { icon: ReceiptText, title: 'Invoices', desc: 'Itemised invoices with line items, discounts, partial payments, reminders, public payment pages and PDF-ready numbers your accountant will accept.' },
  { icon: Repeat, title: 'Subscriptions', desc: 'Weekly to yearly plans with trials, automatic dunning retries, past-due handling and invoice generation on every billing cycle.' },
  { icon: Workflow, title: 'Automations', desc: 'A visual trigger→condition→action builder: notify customers on payment, auto-refund failures, escalate disputes, tag high-value customers — 20+ templates included.' },
  { icon: Mail, title: 'Email automation', desc: 'Multi-provider failover across Resend, SES, MailerSend, Plunk, Loops and SMTP, with identities, signatures and a 320-template catalogue.' },
  { icon: RadioTower, title: 'SMS gateway', desc: 'Your own devices are the SMS network: outbound payments, notifications and OTPs queued from the panel, delivered through paired phones.' },
  { icon: ShieldCheck, title: 'Risk engine', desc: 'Velocity, amount, list-match and hour-pattern rules with allow/review/block actions, automatic risk scoring and a case queue for reviewers.' },
  { icon: Terminal, title: 'Developer console', desc: 'API explorer, webhook simulator and replay, request inspector, event ledger and sandbox scenarios — everything a merchant developer needs in one tab set.' },
  { icon: FlaskConical, title: 'Sandbox mode', desc: 'Drive the real pipeline with fake money: success, failure, timeout, refund, chargeback and underpayment scenarios that fire webhooks and notifications for real.' },
  { icon: Layers, title: 'Multi-brand', desc: 'Run multiple storefronts on one install — per-brand gateways, email identities, message templates and scoped API keys with granular permissions.' },
]

const STEPS = [
  {
    title: 'Pair a device',
    desc: 'Install the Invokeil Pay Android app, scan the pairing QR and grant SMS access. The phone becomes a verified collection point with a heartbeat you can watch live.',
  },
  {
    title: 'Create a payment',
    desc: 'Take payment through a checkout, link, invoice or the merchant API. The customer sees your branded page with the gateway, amount and wallet instructions.',
  },
  {
    title: 'Let the SMS verify it',
    desc: 'When the bKash/Nagad confirmation SMS lands on your paired device, Invokeil matches the TrxID, marks the payment paid, fires the webhook and notifies the customer.',
  },
]

const CODE_SNIPPET = `curl -X POST https://pay.yourdomain.com/api/v1/checkout \\
  -H "Authorization: Bearer sk_live_9f2…" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: order_8471" \\
  -d '{
    "amount": 2500,
    "title": "Order #8471 — Silk saree",
    "customer_name": "Rahim Uddin",
    "customer_mobile": "+8801712345678",
    "redirect_url": "https://shop.bd/thanks"
  }'

# → 201 Created
# { "checkout_url": "/pay/9c4f…", "status": "PENDING",
#   "amount": 2500, "currency": "BDT" }`

export default function LandingPage() {
  return (
    <>
      {/* ─── Hero ─────────────────────────────────────────────── */}
      <section aria-labelledby="hero-title" className="relative overflow-hidden border-b">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_50%_0%,color-mix(in_srgb,var(--primary)_9%,transparent),transparent)]" />
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
          <div className="anim-fade-up mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border bg-card px-3.5 py-1.5 text-xs font-medium text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
              Self-hosted payment automation
            </span>
            <h1 id="hero-title" className="mt-6 text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              Your MFS payments,<br />
              <span className="text-primary">verified by SMS,</span> settled by software.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              Invokeil Pay turns a spare Android phone into a payment gateway for bKash, Nagad, Rocket, Upay and 50+ other
              Bangladeshi gateways. Every incoming transaction SMS is matched to the right checkout in under a second —
              with webhooks, invoices, subscriptions and a merchant API included.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/login"
                className="press inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-7 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 sm:w-auto"
              >
                Open Dashboard <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link
                href="/docs"
                className="press inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border bg-card px-7 text-sm font-semibold text-foreground transition-colors hover:bg-muted sm:w-auto"
              >
                <BookOpen className="h-4 w-4" aria-hidden="true" /> Read the docs
              </Link>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Community Edition is free forever for personal and small-business use. <Link href="/pricing" className="underline underline-offset-2 hover:text-foreground">See pricing</Link>
            </p>
          </div>

          {/* Stats band */}
          <dl className="anim-fade-up mx-auto mt-16 grid max-w-4xl grid-cols-2 gap-4" style={{ animationDelay: '120ms' }}>
            {STATS.map((s) => (
              <div key={s.label} className="rounded-2xl border bg-card p-5 text-center sm:p-6">
                <dd className="text-3xl font-bold tracking-tight text-primary sm:text-4xl">{s.value}</dd>
                <dt className="mt-1.5 text-sm font-semibold text-foreground">{s.label}</dt>
                <p className="mt-1 hidden text-xs text-muted-foreground sm:block">{s.sub}</p>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ─── Feature grid ─────────────────────────────────────── */}
      <section aria-labelledby="features-title" className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
        <div className="anim-fade-up max-w-2xl">
          <h2 id="features-title" className="text-3xl font-bold tracking-tight sm:text-4xl">One install. A complete payment operation.</h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Everything below ships in the open source Community Edition — no feature paywalls, no per-transaction cut taken by us.
          </p>
        </div>
        <ul className="stagger mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <li key={f.title} className="hover-lift min-w-0 rounded-2xl border bg-card p-6">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary" aria-hidden="true">
                <f.icon className="h-5.5 w-5.5" />
              </span>
              <h3 className="mt-4 text-base font-semibold text-foreground">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* ─── How it works ─────────────────────────────────────── */}
      <section aria-labelledby="how-title" className="border-y bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="anim-fade-up max-w-2xl">
            <h2 id="how-title" className="text-3xl font-bold tracking-tight sm:text-4xl">How it works</h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Three steps between a spare phone and a fully automated payment desk.
            </p>
          </div>
          <ol className="mt-12 grid gap-6 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="anim-fade-up relative rounded-2xl border bg-card p-6" style={{ animationDelay: `${i * 70}ms` }}>
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground" aria-hidden="true">
                  {i + 1}
                </span>
                <h3 className="mt-4 text-lg font-semibold text-foreground">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.desc}</p>
              </li>
            ))}
          </ol>

          {/* Code teaser */}
          <div className="anim-fade-up mt-14 grid min-w-0 items-center gap-8 lg:grid-cols-2" style={{ animationDelay: '160ms' }}>
            <div>
              <h3 className="text-2xl font-bold tracking-tight">A merchant API your team can ship with today</h3>
              <p className="mt-3 leading-relaxed text-muted-foreground">
                Create checkouts, verify payments and receive signed webhooks from any stack. PipraPay-compatible endpoints
                make migration a one-line change, and idempotency keys keep retries safe.
              </p>
              <ul className="mt-5 space-y-2.5 text-sm text-foreground">
                {['Bearer API keys with store scoping', 'HMAC-SHA256 signed webhooks (t=, v1=)', 'Idempotency-Key header on every POST'].map((li) => (
                  <li key={li} className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                    {li}
                  </li>
                ))}
              </ul>
              <Link href="/docs/merchant-api" className="press mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
                Merchant API guide <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
            <div className="min-w-0 rounded-2xl border bg-card p-3 shadow-sm">
              <div className="flex items-center justify-between px-2 pb-2 pt-1">
                <p className="font-mono text-xs text-muted-foreground">create-checkout.sh</p>
                <CopyButton text={CODE_SNIPPET} />
              </div>
              <pre className="overflow-x-auto rounded-xl bg-muted p-4 font-mono text-xs leading-relaxed text-foreground" tabIndex={0} aria-label="Merchant API code example">
                <code>{CODE_SNIPPET}</code>
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Footer CTA ───────────────────────────────────────── */}
      <section aria-labelledby="cta-title" className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
        <div className="anim-fade-up relative overflow-hidden rounded-3xl border bg-card px-6 py-14 text-center sm:px-12">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(50%_60%_at_50%_100%,color-mix(in_srgb,var(--primary)_10%,transparent),transparent)]" />
          <h2 id="cta-title" className="text-3xl font-bold tracking-tight sm:text-4xl">Own your payment rails.</h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
            Deploy Invokeil Pay on your own server in minutes, pair a phone, and take your first verified MFS payment today.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/login"
              className="press inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-7 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 sm:w-auto"
            >
              Open Dashboard <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              href="/pricing"
              className="press inline-flex h-12 w-full items-center justify-center rounded-xl border bg-card px-7 text-sm font-semibold text-foreground transition-colors hover:bg-muted sm:w-auto"
            >
              Compare plans
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}
