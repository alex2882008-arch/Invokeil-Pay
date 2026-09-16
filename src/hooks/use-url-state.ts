'use client'

import { useCallback, useMemo } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

/**
 * URL-state hook: filters/pagination live in the query string, so refresh,
 * back/forward and share links restore the exact same view.
 */
export function useUrlState() {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()

  const get = useCallback((key: string, def = ''): string => sp.get(key) ?? def, [sp])

  const getNum = useCallback((key: string, def: number): number => {
    const raw = sp.get(key)
    if (!raw) return def
    const n = parseInt(raw, 10)
    return Number.isFinite(n) ? n : def
  }, [sp])

  /** Merge partial params into the URL (replace, no history spam). */
  const set = useCallback(
    (patch: Record<string, string | number | null | undefined>, opts?: { push?: boolean }) => {
      const next = new URLSearchParams(sp.toString())
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === undefined || v === '') next.delete(k)
        else next.set(k, String(v))
      }
      const qs = next.toString()
      const url = qs ? `${pathname}?${qs}` : pathname
      if (opts?.push) router.push(url)
      else router.replace(url, { scroll: false })
    },
    [pathname, router, sp]
  )

  const reset = useCallback(() => {
    router.replace(pathname, { scroll: false })
  }, [pathname, router])

  return useMemo(() => ({ get, getNum, set, reset, params: sp }), [get, getNum, set, reset, sp])
}
