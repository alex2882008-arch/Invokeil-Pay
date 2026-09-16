'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Menu, X } from 'lucide-react'

const LINKS = [
  { href: '/docs', label: 'Docs' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/changelog', label: 'Changelog' },
  { href: '/status', label: 'Status' },
  { href: '/contact', label: 'Contact' },
]

/** Responsive slide-down navigation for small screens (sticky header companion). */
export function MobileNav() {
  const [open, setOpen] = useState(false)

  // Close the menu on escape; lock scroll while open
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = open ? 'hidden' : ''
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open])

  return (
    <div className="lg:hidden" data-mobile-nav>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="site-mobile-menu"
        aria-label={open ? 'Close navigation menu' : 'Open navigation menu'}
        className="press inline-flex h-10 w-10 items-center justify-center rounded-lg border bg-card text-foreground transition-colors hover:bg-muted"
      >
        {open ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
      </button>

      {open && (
        <div
          id="site-mobile-menu"
          className="anim-fade-in absolute inset-x-0 top-full z-40 border-b bg-background/95 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/90"
        >
          <nav aria-label="Mobile" className="mx-auto flex max-w-6xl flex-col px-4 py-3 sm:px-6">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="flex min-h-[44px] items-center rounded-lg px-3 text-sm font-medium text-foreground/90 transition-colors hover:bg-muted"
              >
                {l.label}
              </Link>
            ))}
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="press mt-2 inline-flex min-h-[44px] items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"
            >
              Open Dashboard
            </Link>
          </nav>
        </div>
      )}
    </div>
  )
}
