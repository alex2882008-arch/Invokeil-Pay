'use client'

import { useState } from 'react'
import { CheckCircle2, Loader2, Send } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

const SUBJECTS = [
  'General enquiry',
  'Sales — Community & self-hosting',
  'Sales — Pro plan',
  'Sales — Enterprise / white-label',
  'Grievance / complaint',
  'Privacy or data request',
  'Report abuse of a payment page',
]

export function ContactForm({ initialPlan }: { initialPlan?: string }) {
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [ref, setRef] = useState<string | null>(null)
  const [subject, setSubject] = useState(initialPlan === 'enterprise' ? 'Sales — Enterprise / white-label' : initialPlan === 'pro' ? 'Sales — Pro plan' : 'General enquiry')

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const fd = new FormData(form)
    setStatus('sending')
    setError(null)
    try {
      const res = await fetch('/api/public/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: fd.get('name'),
          email: fd.get('email'),
          subject,
          plan: initialPlan ?? '',
          message: fd.get('message'),
          website: fd.get('website'), // honeypot — must stay empty
        }),
      })
      const json = (await res.json()) as { ok: boolean; error?: string; data?: { ref: string | null } }
      if (!res.ok || !json.ok) throw new Error(json.error ?? 'Could not send right now.')
      setRef(json.data?.ref ?? null)
      setStatus('sent')
      form.reset()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send right now.')
      setStatus('idle')
    }
  }

  if (status === 'sent') {
    return (
      <div className="anim-scale-in rounded-2xl border border-emerald-500/40 bg-emerald-500/5 p-8 text-center" role="status">
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" aria-hidden="true" />
        <h2 className="mt-4 text-xl font-bold text-foreground">Message received</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Your reference is <span className="font-mono font-semibold text-foreground">{ref ? ref.slice(-8).toUpperCase() : '—'}</span>.
          We reply within one business day (grievances follow the 7/14/30-day clock in our{' '}
          <a href="/legal/grievance" className="font-medium text-primary hover:underline">Grievance policy</a>).
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="rounded-2xl border bg-card p-6" noValidate={false}>
      <h2 className="text-lg font-bold text-foreground">Send us a message</h2>
      <p className="mt-1 text-sm text-muted-foreground">Ticketed and answered by a human — usually within one business day.</p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="cf-name">Your name</Label>
          <Input id="cf-name" name="name" required minLength={2} maxLength={120} placeholder="Rahim Uddin" autoComplete="name" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cf-email">Email</Label>
          <Input id="cf-email" name="email" type="email" required maxLength={160} placeholder="you@example.com" autoComplete="email" />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="cf-subject">Subject</Label>
          <Select value={subject} onValueChange={setSubject}>
            <SelectTrigger id="cf-subject" aria-label="Subject" className="w-full">
              <SelectValue placeholder="Choose a subject" />
            </SelectTrigger>
            <SelectContent>
              {SUBJECTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="cf-message">Message</Label>
          <Textarea
            id="cf-message" name="message" required minLength={10} maxLength={4000} rows={6}
            placeholder="Include the TrxID, payment page URL or instance URL where relevant…"
          />
        </div>
        {/* Honeypot — visually hidden, keyboard-hidden, bots fill it anyway */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden opacity-0">
          <label htmlFor="cf-website">Website</label>
          <input id="cf-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={status === 'sending'}
        className="press mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60 sm:w-auto"
      >
        {status === 'sending'
          ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Sending…</>
          : <><Send className="h-4 w-4" aria-hidden="true" /> Send message</>}
      </button>
    </form>
  )
}
