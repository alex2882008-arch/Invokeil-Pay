import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth'
import { LangProvider } from '@/lib/i18n'
import { AdminShell } from '@/components/panel/admin-shell'
import { getMergedSettings } from '@/lib/settings-defaults'

export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  const settings = await getMergedSettings()
  return (
    <LangProvider>
      <AdminShell user={user} brandName={settings.brandName || 'Invokeil Pay'}>
        {children}
      </AdminShell>
    </LangProvider>
  )
}
