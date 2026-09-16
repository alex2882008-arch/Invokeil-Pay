import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth'
import { LoginClient } from '@/components/panel/login-client'
import { getMergedSettings } from '@/lib/settings-defaults'

export const metadata = { title: 'Sign in — Invokeil Pay' }

export default async function LoginPage() {
  const user = await getSessionUser()
  if (user) redirect('/admin/dashboard')
  const settings = await getMergedSettings()
  return <LoginClient brandName={settings.brandName} />
}
