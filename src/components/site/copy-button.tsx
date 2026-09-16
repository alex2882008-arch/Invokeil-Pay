'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

/** Small copy-to-clipboard button used next to code blocks on public docs pages. */
export function CopyButton({ text, label = 'Copy code' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // Fallback for non-secure contexts
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label={label}
      className="press inline-flex h-8 items-center gap-1.5 rounded-md border bg-card px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}
