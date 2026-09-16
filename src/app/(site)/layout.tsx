import Link from 'next/link'
import { Github } from 'lucide-react'
import { BrandLogo } from '@/components/panel/ui-bits'
import { MobileNav } from '@/components/site/mobile-nav'
import { SITE, FOOTER_NAV, FOOTER_BN } from '@/lib/site/site-config'

const NAV = [
  { href: '/docs', label: 'Docs' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/changelog', label: 'Changelog' },
  { href: '/status', label: 'Status' },
  { href: '/contact', label: 'Contact' },
]

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Sticky header */}
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/65">
        <div className="relative mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" className="press rounded-lg" aria-label="Invokeil Pay — home">
            <BrandLogo size={34} />
          </Link>

          <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
            {NAV.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <a
              href={SITE.links.github}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Invokeil Pay on GitHub"
              className="press hidden h-10 w-10 items-center justify-center rounded-lg border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:inline-flex"
            >
              <Github className="h-4.5 w-4.5" aria-hidden="true" />
            </a>
            <Link
              href={SITE.links.dashboard}
              className="press hidden h-10 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 sm:inline-flex"
            >
              Open Dashboard
            </Link>
            <MobileNav />
          </div>
        </div>
      </header>

      {/* Page content */}
      <main id="main" className="flex-1">
        {children}
      </main>

      {/* Sticky footer (mt-auto keeps it pinned on short pages, pushed naturally on long ones) */}
      <footer className="mt-auto border-t bg-muted/30 pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
          <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
            <div>
              <BrandLogo size={30} />
              <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">{SITE.tagline}. {SITE.jurisdiction}.</p>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground" lang="bn">{FOOTER_BN}</p>
            </div>
            {FOOTER_NAV.map((group) => (
              <nav key={group.label} aria-label={group.label}>
                <h2 className="text-sm font-semibold text-foreground">{group.label}</h2>
                <ul className="mt-3 space-y-2.5">
                  {group.links.map((l) => (
                    <li key={l.href + l.label}>
                      <Link href={l.href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>

          <div className="mt-10 flex flex-col gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              © {new Date().getFullYear()} Invokeil Pay. Self-hosted software — you keep the keys, we keep the lights on. Not legal or financial advice; see{' '}
              <Link href="/legal/grievance" className="underline underline-offset-2 hover:text-foreground">Grievance &amp; Complaints</Link>.
            </p>
            <p className="text-xs text-muted-foreground">
              v{SITE.version} · <Link href="/status" className="underline underline-offset-2 hover:text-foreground">All systems status</Link>
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
