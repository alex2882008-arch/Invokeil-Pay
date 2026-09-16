'use client'

import { LangProvider } from '@/lib/i18n'
import { CheckoutPublicView } from './checkout-public'

export function CheckoutPublicClient({ token }: { token: string }) {
  return (
    <LangProvider>
      <CheckoutPublicView token={token} />
    </LangProvider>
  )
}
