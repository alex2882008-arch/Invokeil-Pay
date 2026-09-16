import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AlertTriangle, ChevronRight, Scale } from 'lucide-react'
import { LEGAL_DOCS, getLegalDoc } from '@/lib/site/legal-content'

export function generateStaticParams() {
  return LEGAL_DOCS.map((d) => ({ slug: d.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const doc = getLegalDoc(slug)
  if (!doc) return { title: 'Not found — Invokeil Pay Legal' }
  return {
    title: `${doc.title} — Invokeil Pay`,
    description: doc.summary,
    alternates: { canonical: `/legal/${doc.slug}` },
  }
}

export default async function LegalDocPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const doc = getLegalDoc(slug)
  if (!doc) notFound()

  const index = LEGAL_DOCS.findIndex((d) => d.slug === doc.slug)
  const prev = index > 0 ? LEGAL_DOCS[index - 1] : undefined
  const next = index < LEGAL_DOCS.length - 1 ? LEGAL_DOCS[index + 1] : undefined

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      <div className="grid gap-12 lg:grid-cols-[260px_1fr]">
        {/* Index of all legal documents */}
        <nav aria-label="Legal documents" className="lg:sticky lg:top-24 lg:self-start">
          <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Scale className="h-3.5 w-3.5" aria-hidden="true" /> Legal library
          </h2>
          <ul className="mt-3 space-y-0.5">
            {LEGAL_DOCS.map((d) => (
              <li key={d.slug}>
                <Link
                  href={`/legal/${d.slug}`}
                  aria-current={d.slug === doc.slug ? 'page' : undefined}
                  className={`flex min-h-[36px] items-center rounded-lg px-3 py-1.5 text-sm transition-colors ${
                    d.slug === doc.slug
                      ? 'bg-primary/10 font-semibold text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  {d.title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Document body */}
        <article className="min-w-0">
          <header className="anim-fade-up">
            <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs text-muted-foreground">
              <Link href="/" className="hover:text-foreground">Home</Link>
              <ChevronRight className="h-3 w-3" aria-hidden="true" />
              <span>Legal</span>
            </nav>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{doc.title}</h1>
            <p className="mt-3 text-lg leading-relaxed text-muted-foreground">{doc.summary}</p>
            <p className="mt-2 text-xs text-muted-foreground">Last updated {doc.updated} · Governing law: People’s Republic of Bangladesh</p>
          </header>

          {/* Not-legal-advice disclaimer */}
          <aside
            role="note"
            aria-label="Disclaimer"
            className="anim-fade-up mt-6 flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm leading-relaxed text-amber-900 dark:text-amber-200"
            style={{ animationDelay: '40ms' }}
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>
              This document is provided for information only and is <strong>not legal advice</strong>. Statutes are cited
              generically “(as amended)” because amendment instruments change; consult a qualified Bangladeshi lawyer for advice
              on your specific situation. See the{' '}
              <Link href="/legal/grievance" className="font-semibold underline underline-offset-2">Grievance page</Link> for complaint pathways.
            </p>
          </aside>

          <div className="anim-fade-up" style={{ animationDelay: '80ms' }}>
            {doc.sections.map((s, i) => (
              <section key={i} aria-labelledby={`ls-${i}`} className="mt-8">
                <h2 id={`ls-${i}`} className="scroll-mt-24 text-xl font-bold tracking-tight text-foreground">{s.h}</h2>
                {s.ps.map((p, j) => (
                  <p key={j} className="mt-3 leading-relaxed text-muted-foreground">{p}</p>
                ))}
                {s.list && (
                  <ul className="mt-3 list-disc space-y-2 pl-5 leading-relaxed text-muted-foreground marker:text-foreground/70">
                    {s.list.map((li, j) => <li key={j}>{li}</li>)}
                  </ul>
                )}
              </section>
            ))}
          </div>

          {/* Prev / next */}
          <nav aria-label="Legal document pagination" className="mt-14 grid gap-3 border-t pt-6 sm:grid-cols-2">
            {prev ? (
              <Link href={`/legal/${prev.slug}`} className="press group rounded-xl border bg-card p-4 transition-colors hover:bg-muted">
                <p className="text-xs text-muted-foreground">← Previous</p>
                <p className="mt-1 text-sm font-semibold text-foreground group-hover:text-primary">{prev.title}</p>
              </Link>
            ) : <span aria-hidden="true" />}
            {next && (
              <Link href={`/legal/${next.slug}`} className="press group rounded-xl border bg-card p-4 text-right transition-colors hover:bg-muted sm:col-start-2">
                <p className="text-xs text-muted-foreground">Next →</p>
                <p className="mt-1 text-sm font-semibold text-foreground group-hover:text-primary">{next.title}</p>
              </Link>
            )}
          </nav>
        </article>
      </div>
    </div>
  )
}
