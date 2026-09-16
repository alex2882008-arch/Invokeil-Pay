import { PortalPublicView } from '@/components/panel/portal-public'

export const metadata = { title: 'Customer Portal — Invokeil Pay' }

export default async function PortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <PortalPublicView token={token} />
}
