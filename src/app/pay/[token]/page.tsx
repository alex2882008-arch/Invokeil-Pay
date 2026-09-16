import { CheckoutPublicClient } from '@/components/panel/checkout-public-client'

export const metadata = { title: 'Secure Checkout — Invokeil Pay' }

export default async function PayPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <CheckoutPublicClient token={token} />
}
