import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, Search } from 'lucide-react'
import { DocsSidebar } from '@/components/site/article-renderer'
import { ARTICLES } from '@/lib/site/docs-content'

export const metadata: Metadata = {
  title: 'Documentation — Invokeil Pay',
  description: 'Guides for installing Invokeil Pay, pairing devices, configuring gateways and integrating the merchant API, webhooks and SDKs.',
  alternates: { canonical: '/docs' },
}

export default function DocsIndexPage() {
  const featured = ARTICLES.slice(0, 6)
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      <header className="anim-fade-up max-w-2xl">
        <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">Documentation</h1>
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
          Everything you need to run Invokeil Pay — from pairing your first device to signing webhook payloads in production.
        </p>
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Search className="h-4 w-4" aria-hidden="true" /> Start with{' '}
          <Link href="/docs/getting-started" className="font-medium text-primary hover:underline">Getting started</Link> — most teams are live in under 30 minutes.
        </p>
      </header>

      <div className="mt-12 grid gap-10 lg:grid-cols-[240px_1fr]">
        <DocsSidebar />

        <div className="min-w-0">
          {/* Section cards */}
          <div className="grid min-w-0 gap-5 sm:grid-cols-2">
            {['Start here', 'Payments', 'Developers'].map((section, si) => (
              <section
                key={section}
                aria-labelledby={`sec-${si}`}
                className="anim-fade-up min-w-0 rounded-2xl border bg-card p-6"
                style={{ animationDelay: `${si * 60}ms` }}
              >
                <h2 id={`sec-${si}`} className="text-lg font-bold text-foreground">{section}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {section === 'Start here' && 'Install, pair a phone and take your first verified payment.'}
                  {section === 'Payments' && 'Checkouts, links, invoices, subscriptions and the gateway catalogue.'}
                  {section === 'Developers' && 'Merchant API, webhooks, SDKs, CLI and sandbox testing.'}
                </p>
                <ul className="mt-4 space-y-1">
                  {ARTICLES.filter((a) => a.section === section).map((a) => (
                    <li key={a.slug}>
                      <Link
                        href={`/docs/${a.slug}`}
                        className="flex min-h-[40px] items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        {a.title}
                        <ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}

            {/* API quick reference */}
            <section aria-labelledby="quickref" className="anim-fade-up min-w-0 rounded-2xl border bg-card p-6" style={{ animationDelay: '180ms' }}>
              <h2 id="quickref" className="text-lg font-bold text-foreground">Quick reference</h2>
              <pre className="mt-4 overflow-x-auto rounded-xl bg-muted p-4 font-mono text-xs leading-relaxed text-foreground" tabIndex={0} aria-label="API quick reference">
                <code>{`POST /api/v1/checkout          # create payment
GET  /api/v1/checkout/{token}  # poll status
POST /api/v1/verify-payment    # verify (pp_id ok)

Auth:  Authorization: Bearer sk_live_…
Signs: X-Invokeil-Signature: t=…,v1=…`}</code>
              </pre>
              <Link href="/docs/api-reference" className="press mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
                Full API reference <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </section>
          </div>

          {/* Recently updated strip */}
          <h2 className="mt-12 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Recently updated</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((a) => (
              <li key={a.slug}>
                <Link href={`/docs/${a.slug}`} className="press block rounded-xl border bg-card px-4 py-3 transition-colors hover:bg-muted">
                  <p className="text-sm font-semibold text-foreground">{a.title}</p>
                  <p className="text-xs text-muted-foreground">Updated {a.updated}</p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
