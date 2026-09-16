import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, Check, Minus, ShieldCheck } from 'lucide-react'
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion'
import { SITE } from '@/lib/site/site-config'

export const metadata: Metadata = {
  title: 'Pricing — Invokeil Pay',
  description: 'Community Edition is free forever for self-hosting. Pro adds priority support and hosted updates; Enterprise adds white-label, SLA and compliance review.',
  alternates: { canonical: '/pricing' },
}

type Cell = boolean | string

const TIERS = [
  {
    name: 'Community',
    price: 'Free',
    cadence: 'forever',
    tag: 'Most popular',
    featured: true,
    blurb: 'The full platform, self-hosted. Built for personal use and small to semi-medium businesses that want to own their payment stack.',
    ctas: [{ label: 'Open Dashboard', href: '/login', primary: true }, { label: 'Read the docs', href: '/docs', primary: false }],
    perks: [
      'All features, no paywalls',
      'Unlimited devices, gateways and payments',
      '0% platform fee — MFS charges only',
      'Community support on GitHub',
    ],
  },
  {
    name: 'Pro',
    price: 'Contact us',
    cadence: 'per instance / year',
    featured: false,
    blurb: 'For merchants who want the convenience of managed releases and a team on call when it matters.',
    ctas: [{ label: 'Contact sales', href: `/contact?plan=pro`, primary: true }],
    perks: [
      'Priority support with response SLAs',
      'Hosted update channel & upgrade assistance',
      'Guided device fleet onboarding',
      'Private bug fixes before public release',
    ],
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    cadence: 'annual agreement',
    featured: false,
    blurb: 'White-label deployments, compliance review and contractual guarantees for organisations running serious volume.',
    ctas: [{ label: 'Talk to us', href: `/contact?plan=enterprise`, primary: true }],
    perks: [
      'White-label rebranding rights',
      '99.9% uptime SLA with credits',
      'Compliance review against Bangladesh Bank guidance',
      'Dedicated success engineer & training',
    ],
  },
]

const MATRIX: Array<{ feature: string; community: Cell; pro: Cell; enterprise: Cell }> = [
  { feature: 'Self-hosted deployment', community: true, pro: true, enterprise: true },
  { feature: 'SMS-verified MFS payments', community: true, pro: true, enterprise: true },
  { feature: '56 gateways & multi-brand stores', community: true, pro: true, enterprise: true },
  { feature: 'Checkouts, links, invoices, subscriptions', community: true, pro: true, enterprise: true },
  { feature: 'Merchant API, webhooks & SDKs', community: true, pro: true, enterprise: true },
  { feature: 'Automation & risk engines', community: true, pro: true, enterprise: true },
  { feature: 'Platform fee on transactions', community: '0%', pro: '0%', enterprise: '0%' },
  { feature: 'Support', community: 'Community', pro: 'Priority (SLA)', enterprise: 'Dedicated engineer' },
  { feature: 'Hosted update channel', community: false, pro: true, enterprise: true },
  { feature: 'White-label rebranding', community: false, pro: false, enterprise: true },
  { feature: 'Uptime SLA with credits', community: false, pro: false, enterprise: '99.9%' },
  { feature: 'Compliance review (BB / BFIU guidance)', community: false, pro: false, enterprise: true },
]

function CellView({ v }: { v: Cell }) {
  if (v === true) return <Check className="mx-auto h-4.5 w-4.5 text-emerald-600" aria-label="Included" />
  if (v === false) return <Minus className="mx-auto h-4.5 w-4.5 text-muted-foreground/50" aria-label="Not included" />
  return <span className="text-sm text-foreground">{v}</span>
}

const FAQ = [
  {
    q: 'Is the Community Edition really free? What is the catch?',
    a: 'There is no catch and no revenue share. Invokeil Pay is self-hosted software: you run it on your own server, payments settle directly into your own wallets, and we never see your money or your customers. The Community license permits free use for personal purposes and by small and semi-medium businesses — see the license note below.',
  },
  {
    q: 'What counts as a “small or semi-medium business”?',
    a: 'As a rule of thumb: if you are collecting payments for one or a handful of outlets with a device fleet you administer yourself, Community is for you. Organisations needing contractual support, hosted updates, white-labeling or an uptime SLA should choose Pro or Enterprise — those commercial commitments are what the paid plans fund.',
  },
  {
    q: 'Do you take a cut of my transactions?',
    a: 'No. Invokeil Pay charges nothing per transaction on any plan. The only costs you pay are the MFS/bank charges levied by bKash, Nagad, Rocket, your bank and so on — and our gateway charge engine simply surfaces those to customers transparently if you enable customer-pays pricing.',
  },
  {
    q: 'How does the Pro “hosted updates” channel work?',
    a: 'Pro instances receive a signed, pre-tested update channel with upgrade windows, database-migration assistance and rollback support. You stay self-hosted — we make sure upgrades never happen at your busiest hour.',
  },
]

export default function PricingPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
      {/* Header */}
      <header className="anim-fade-up mx-auto max-w-2xl text-center">
        <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">Pricing that respects self-hosters</h1>
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
          The whole platform is free to self-host. Paid plans exist for organisations that want support guarantees, managed
          upgrades and compliance sign-off — not for locking features away.
        </p>
      </header>

      {/* Tier cards */}
      <div className="mt-14 grid gap-6 lg:grid-cols-3">
        {TIERS.map((tier, i) => (
          <section
            key={tier.name}
            aria-label={`${tier.name} plan`}
            className={`anim-fade-up relative flex flex-col rounded-3xl border p-7 ${
              tier.featured ? 'border-primary/50 bg-card shadow-lg ring-1 ring-primary/30' : 'bg-card'
            }`}
            style={{ animationDelay: `${i * 70}ms` }}
          >
            {tier.tag && (
              <span className="absolute -top-3 left-7 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                {tier.tag}
              </span>
            )}
            <h2 className="text-lg font-bold text-foreground">{tier.name}</h2>
            <p className="mt-3">
              <span className="text-4xl font-bold tracking-tight text-foreground">{tier.price}</span>
              <span className="ml-2 text-sm text-muted-foreground">{tier.cadence}</span>
            </p>
            <p className="mt-3 min-h-[72px] text-sm leading-relaxed text-muted-foreground">{tier.blurb}</p>
            <ul className="mt-5 flex-1 space-y-2.5">
              {tier.perks.map((perk) => (
                <li key={perk} className="flex items-start gap-2 text-sm text-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                  {perk}
                </li>
              ))}
            </ul>
            <div className="mt-7 space-y-2">
              {tier.ctas.map((cta) => (
                <Link
                  key={cta.label}
                  href={cta.href}
                  className={`press flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-colors ${
                    cta.primary
                      ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                      : 'border bg-background text-foreground hover:bg-muted'
                  }`}
                >
                  {cta.label} {cta.primary && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Comparison table */}
      <section aria-labelledby="compare" className="mt-20">
        <h2 id="compare" className="anim-fade-up text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Compare plans</h2>
        <div className="anim-fade-up mt-6 overflow-x-auto rounded-2xl border" style={{ animationDelay: '60ms' }}>
          <table className="w-full min-w-[640px] text-left text-sm">
            <caption className="sr-only">Feature comparison between Community, Pro and Enterprise plans</caption>
            <thead>
              <tr className="border-b bg-muted/50">
                <th scope="col" className="px-5 py-3.5 font-semibold text-foreground">Feature</th>
                <th scope="col" className="px-5 py-3.5 text-center font-semibold text-foreground">Community</th>
                <th scope="col" className="px-5 py-3.5 text-center font-semibold text-foreground">Pro</th>
                <th scope="col" className="px-5 py-3.5 text-center font-semibold text-foreground">Enterprise</th>
              </tr>
            </thead>
            <tbody>
              {MATRIX.map((row) => (
                <tr key={row.feature} className="border-b last:border-0">
                  <th scope="row" className="px-5 py-3 text-left font-medium text-foreground">{row.feature}</th>
                  <td className="px-5 py-3 text-center"><CellView v={row.community} /></td>
                  <td className="px-5 py-3 text-center"><CellView v={row.pro} /></td>
                  <td className="px-5 py-3 text-center"><CellView v={row.enterprise} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* License note */}
      <aside
        aria-label="License note"
        className="anim-fade-up mt-14 flex flex-col gap-4 rounded-2xl border border-primary/25 bg-primary/5 p-6 sm:flex-row sm:items-center"
        style={{ animationDelay: '80ms' }}
      >
        <ShieldCheck className="h-8 w-8 shrink-0 text-primary" aria-hidden="true" />
        <div>
          <h2 className="text-base font-bold text-foreground">License in plain language</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Community Edition is free for personal use and for small and semi-medium businesses. If you need to
            white-label the product or resell it, that is what the Enterprise agreement licenses. The full terms live in the{' '}
            <Link href="/legal/license" className="font-medium text-primary underline underline-offset-2 hover:text-primary/80">Invokeil Pay Community License</Link>.
          </p>
        </div>
      </aside>

      {/* FAQ */}
      <section aria-labelledby="faq" className="mt-20 max-w-3xl">
        <h2 id="faq" className="anim-fade-up text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Frequently asked questions</h2>
        <Accordion type="single" collapsible className="anim-fade-up mt-6" style={{ animationDelay: '60ms' }}>
          {FAQ.map((f, i) => (
            <AccordionItem key={i} value={`faq-${i}`}>
              <AccordionTrigger className="text-left text-base font-semibold">{f.q}</AccordionTrigger>
              <AccordionContent className="text-sm leading-relaxed text-muted-foreground">{f.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
        <p className="mt-8 text-sm text-muted-foreground">
          Still deciding? <Link href="/contact" className="font-medium text-primary hover:underline">Talk to us</Link> — or{' '}
          <a href={SITE.links.github} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">open an issue on GitHub</a>.
        </p>
      </section>
    </div>
  )
}
