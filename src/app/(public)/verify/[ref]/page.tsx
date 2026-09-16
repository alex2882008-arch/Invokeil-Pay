import { VerifyPublicView } from '@/components/panel/verify-public'

export const metadata = { title: 'Verify Receipt — Invokeil Pay' }

export default async function VerifyPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params
  // NOTE: prop must not be named `ref` (reserved — React server-component rule)
  return <VerifyPublicView receiptRef={ref} />
}
