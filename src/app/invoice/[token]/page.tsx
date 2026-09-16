import { InvoicePublicClient } from '@/components/panel/invoice-public-client'

export const metadata = { title: 'Invoice — Invokeil Pay' }

export default async function InvoicePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <InvoicePublicClient token={token} />
}
