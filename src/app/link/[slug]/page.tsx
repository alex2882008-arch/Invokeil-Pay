import { LinkPublicClient } from '@/components/panel/link-public-client'

export const metadata = { title: 'Payment — Invokeil Pay' }

export default async function LinkPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <LinkPublicClient slug={slug} />
}
