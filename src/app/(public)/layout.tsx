import Link from 'next/link'
import { BrandLogo } from '@/components/panel/ui-bits'

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      {/* Branded header */}
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="press rounded-lg" aria-label="Invokeil Pay home">
            <BrandLogo size={34} />
          </Link>
          <Link
            href="/login"
            className="press inline-flex h-10 items-center rounded-lg border bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
          >
            Sign in
          </Link>
        </div>
      </header>

      {/* Page content */}
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 pb-10 sm:px-6 sm:py-8">
        {children}
      </main>

      {/* Sticky footer (mt-auto keeps it at the viewport bottom on short pages) */}
      <footer className="mt-auto border-t bg-background pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex w-full max-w-5xl flex-col items-center justify-between gap-3 px-4 py-5 sm:flex-row sm:px-6">
          <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} Invokeil Pay — Personal MFS Payment Automation</p>
          <nav aria-label="Legal" className="flex items-center gap-4 text-xs text-muted-foreground">
            <Link href="/" className="hover:text-foreground">Home</Link>
            <Link href="/login" className="hover:text-foreground">Sign in</Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}
