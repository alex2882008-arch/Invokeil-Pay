import { Customer360View } from '@/components/panel/customer-360-view'

export const metadata = { title: 'Customer 360 — Invokeil Pay' }

export default async function Customer360Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <Customer360View customerId={id} />
}
