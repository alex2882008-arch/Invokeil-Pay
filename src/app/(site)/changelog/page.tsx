import type { Metadata } from 'next'
import Link from 'next/link'
import { Sparkles, Wrench } from 'lucide-react'
import { CHANGELOG } from '@/lib/site/changelog'
import { SITE } from '@/lib/site/site-config'

export const metadata: Metadata = {
  title: 'Changelog — Invokeil Pay',
  description: 'What is new in Invokeil Pay — releases, features and fixes, newest first.',
  alternates: { canonical: '/changelog' },
}

const TAG_STYLES: Record<string, string> = {
  Major: 'bg-primary/10 text-primary border-primary/30',
  Minor: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  Patch: 'bg-muted text-muted-foreground border',
}

const GROUP_STYLES: Record<string, string> = {
  Added: 'text-emerald-600 dark:text-emerald-400',
  Changed: 'text-primary',
  Improved: 'text-primary',
  Fixed: 'text-amber-600 dark:text-amber-400',
  Security: 'text-red-600 dark:text-red-400',
  Performance: 'text-emerald-600 dark:text-emerald-400',
  Note: 'text-muted-foreground',
}

export default function ChangelogPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6">
      <header className="anim-fade-up">
        <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">Changelog</h1>
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
          Every release of Invokeil Pay, newest first. Shipping cadence: roughly one feature release per quarter, patches as needed.
        </p>
      </header>

      <div className="relative mt-14 border-l pl-6 sm:pl-10" role="list">
        {CHANGELOG.map((entry, ei) => (
          <section
            key={entry.version}
            aria-labelledby={`v-${entry.version}`}
            role="listitem"
            className="anim-fade-up relative pb-14 last:pb-0"
            style={{ animationDelay: `${ei * 70}ms` }}
          >
            {/* Timeline dot */}
            <span
              aria-hidden="true"
              className="absolute -left-[31px] top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 border-primary bg-background sm:-left-[47px]"
            />
            <div className="flex flex-wrap items-center gap-3">
              <h2 id={`v-${entry.version}`} className="text-2xl font-bold tracking-tight text-foreground">v{entry.version}</h2>
              <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${TAG_STYLES[entry.tag]}`}>{entry.tag}</span>
              <time dateTime={entry.date} className="text-sm text-muted-foreground">{entry.date}</time>
            </div>
            <p className="mt-2 text-lg font-medium text-foreground/90">{entry.title}</p>

            <div className="mt-5 space-y-6 rounded-2xl border bg-card p-6">
              {entry.groups.map((group) => (
                <div key={group.label}>
                  <h3 className={`flex items-center gap-2 text-sm font-bold uppercase tracking-wider ${GROUP_STYLES[group.label] ?? 'text-foreground'}`}>
                    {group.label === 'Added' || group.label === 'Changed' || group.label === 'Improved'
                      ? <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                      : <Wrench className="h-3.5 w-3.5" aria-hidden="true" />}
                    {group.label}
                  </h3>
                  <ul className="mt-2.5 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground marker:text-foreground/60">
                    {group.items.map((item, i) => <li key={i}>{item}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <p className="mt-10 text-sm text-muted-foreground">
        Current release: <span className="font-semibold text-foreground">v{SITE.version}</span>. Upgrade paths and breaking-change
        notes live in the <Link href="/docs/getting-started" className="font-medium text-primary hover:underline">documentation</Link>.
      </p>
    </div>
  )
}
