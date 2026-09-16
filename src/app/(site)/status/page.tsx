import type { Metadata } from 'next'
import Link from 'next/link'
import { StatusLive } from '@/components/site/status-live'
import { SITE } from '@/lib/site/site-config'

export const metadata: Metadata = {
  title: 'System status — Invokeil Pay',
  description: 'Live component health, incident history and uptime summary for Invokeil Pay instances.',
  alternates: { canonical: '/status' },
}

export default function StatusPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-16 sm:px-6">
      <header className="anim-fade-up mb-10">
        <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">System status</h1>
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
          Live health for components of this Invokeil Pay instance — components, active incidents and the last 90 days.
          Questions? <Link href="/contact" className="font-medium text-primary hover:underline">Contact support</Link> or email{' '}
          <a href={`mailto:${SITE.emails.support}`} className="font-medium text-primary hover:underline">{SITE.emails.support}</a>.
        </p>
      </header>
      <StatusLive />
    </div>
  )
}
