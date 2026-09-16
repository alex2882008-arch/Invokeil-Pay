'use client'

import { useCallback, useEffect, useState } from 'react'

export type Theme = 'light' | 'dark' | 'system'

function applyTheme(theme: Theme) {
  const root = document.documentElement
  const dark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  root.classList.toggle('dark', dark)
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>('system')

  useEffect(() => {
    const id = window.setTimeout(() => {
      const saved = (localStorage.getItem('ilp_theme') as Theme | null) ?? 'system'
      setThemeState(saved)
      applyTheme(saved)
    }, 0)
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      if ((localStorage.getItem('ilp_theme') as Theme | null) === 'system') applyTheme('system')
    }
    mq.addEventListener('change', onChange)
    return () => {
      window.clearTimeout(id)
      mq.removeEventListener('change', onChange)
    }
  }, [])

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t)
    localStorage.setItem('ilp_theme', t)
    applyTheme(t)
  }, [])

  return { theme, setTheme }
}

/** Inline script string for root layout — prevents dark-mode flash. */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('ilp_theme')||'system';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);var l=localStorage.getItem('ilp_lang');if(l)document.documentElement.lang=l==='bn'?'bn':'en';}catch(e){}})()`
