import type { Metadata } from 'next'
import Link from 'next/link'
import { Clock, Headset, MapPin, MessageCircle, Phone, ShieldAlert } from 'lucide-react'
import { ContactForm } from '@/components/site/contact-form'
import { SITE } from '@/lib/site/site-config'

export const metadata: Metadata = {
  title: 'Contact — Invokeil Pay',
  description: 'Support, sales and grievance contacts for Invokeil Pay — ticketed form, response SLAs and office hours.',
  alternates: { canonical: '/contact' },
}

const SLAS = [
  { channel: 'Support (dashboard users)', target: '1 business day', hours: 'Sun–Thu, 10:00–18:00 BST' },
  { channel: 'Sales enquiries', target: '1–2 business days', hours: 'Sun–Thu, 10:00–18:00 BST' },
  { channel: 'Security reports', target: '2 business days (triage)', hours: 'Monitored 24×7' },
  { channel: 'Grievances / complaints', target: '7 / 14 / 30-day escalation', hours: 'Sun–Thu, 10:00–18:00 BST' },
]

export default async function ContactPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const { plan } = await searchParams

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
      <header className="anim-fade-up max-w-2xl">
        <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">Talk to us</h1>
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
          Support, sales and grievances all land with a named human — no bots, no “do not reply” addresses.
        </p>
      </header>

      <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_1.2fr]">
        {/* Contact channels */}
        <div className="space-y-4">
          <section aria-labelledby="ch-support" className="anim-fade-up rounded-2xl border bg-card p-6">
            <h2 id="ch-support" className="flex items-center gap-2 text-base font-bold text-foreground">
              <Headset className="h-4.5 w-4.5 text-primary" aria-hidden="true" /> Support
            </h2>
            <ul className="mt-3 space-y-2.5 text-sm text-muted-foreground">
              <li>
                Email <a className="font-medium text-foreground hover:text-primary" href={`mailto:${SITE.emails.support}`}>{SITE.emails.support}</a>
              </li>
              <li className="flex items-center gap-2">
                <Phone className="h-4 w-4 shrink-0" aria-hidden="true" />
                <a className="hover:text-foreground" href={`tel:${SITE.phone.replace(/[^+\d]/g, '')}`}>{SITE.phone}</a>
              </li>
              <li className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                WhatsApp {SITE.whatsapp} · Telegram @{SITE.telegram}
              </li>
            </ul>
          </section>

          <section aria-labelledby="ch-office" className="anim-fade-up rounded-2xl border bg-card p-6" style={{ animationDelay: '60ms' }}>
            <h2 id="ch-office" className="flex items-center gap-2 text-base font-bold text-foreground">
              <MapPin className="h-4.5 w-4.5 text-primary" aria-hidden="true" /> Office
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{SITE.address}</p>
            <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4 shrink-0" aria-hidden="true" /> {SITE.hours}
            </p>
          </section>

          <section aria-labelledby="ch-sla" className="anim-fade-up rounded-2xl border bg-card p-6" style={{ animationDelay: '120ms' }}>
            <h2 id="ch-sla" className="flex items-center gap-2 text-base font-bold text-foreground">
              <ShieldAlert className="h-4.5 w-4.5 text-primary" aria-hidden="true" /> Response SLAs
            </h2>
            <table className="mt-3 w-full text-left text-sm">
              <caption className="sr-only">Response time commitments by channel</caption>
              <thead>
                <tr className="border-b">
                  <th scope="col" className="py-2 font-semibold text-foreground">Channel</th>
                  <th scope="col" className="py-2 font-semibold text-foreground">Target</th>
                </tr>
              </thead>
              <tbody>
                {SLAS.map((s) => (
                  <tr key={s.channel} className="border-b last:border-0">
                    <td className="py-2 pr-3 align-top text-muted-foreground">{s.channel}</td>
                    <td className="py-2 align-top text-muted-foreground">
                      {s.target}
                      <span className="block text-xs opacity-70">{s.hours}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-muted-foreground">
              Payment disputes follow the{' '}
              <Link href="/legal/grievance" className="font-medium text-primary hover:underline">7/14/30-day grievance clock</Link>.
              Security reports: <a className="font-medium text-primary hover:underline" href={`mailto:${SITE.emails.security}`}>{SITE.emails.security}</a>.
            </p>
          </section>
        </div>

        {/* Form */}
        <div className="anim-fade-up" style={{ animationDelay: '80ms' }}>
          <ContactForm initialPlan={plan} />
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            By sending this form you agree to our{' '}
            <Link href="/legal/terms" className="underline underline-offset-2 hover:text-foreground">Terms of Service</Link> and{' '}
            <Link href="/legal/privacy" className="underline underline-offset-2 hover:text-foreground">Privacy Policy</Link>.
            We store only what you typed plus the technical metadata needed to prevent abuse, for 24 months.
          </p>
        </div>
      </div>
    </div>
  )
}
