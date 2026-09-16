'use client'

import React from 'react'
import { cn } from '@/lib/utils'

/**
 * Gateway Logo System — branded SVG-style tiles for every gateway in the catalog.
 * Brand-accurate colors + monograms for all BD MFS brands, banks and global PSPs.
 * Used in admin tables, checkout selector, wizard, links and invoices.
 */

interface BrandMeta {
  mono: string
  color: string
  color2?: string
  label?: string
}

const BRANDS: Record<string, BrandMeta> = {
  // Bangladesh MFS brands
  BKASH: { mono: 'b', color: '#E2136E', color2: '#fe5b9b', label: 'bKash' },
  NAGAD: { mono: 'ন', color: '#F6921E', color2: '#ffc46b', label: 'Nagad' },
  ROCKET: { mono: 'R', color: '#8C3494', color2: '#c86bd1', label: 'Rocket' },
  UPAY: { mono: 'u', color: '#00A99D', color2: '#4be0d5', label: 'Upay' },
  TAP: { mono: 't', color: '#0A6EDE', color2: '#5aa9ff', label: 'Tap' },
  TELECASH: { mono: 'tc', color: '#1B9AD2', color2: '#6cc8f5', label: 'TeleCash' },
  MCASH: { mono: 'mc', color: '#00723F', color2: '#3fbf82', label: 'mCash' },
  OKWALLET: { mono: 'ok', color: '#F1592A', color2: '#ff9d70', label: 'OK Wallet' },
  PATHAOPAY: { mono: 'P', color: '#E2151C', color2: '#ff6b6b', label: 'Pathao Pay' },
  CELLFIN: { mono: 'cf', color: '#00693E', color2: '#37a878', label: 'CellFin' },
  IPAY: { mono: 'ip', color: '#0E4C92', color2: '#4f8dd6', label: 'iPay' },
  SURECASH: { mono: 'sc', color: '#7C2582', color2: '#c168c9', label: 'SureCash' },
  MEGHNAPAY: { mono: 'mp', color: '#00529B', color2: '#4a90d9', label: 'Meghna Pay' },
  TRUSTMONEY: { mono: 'tm', color: '#003B71', color2: '#3a77bd', label: 'Trust Money' },
  DMONEY: { mono: 'd', color: '#E4136E', color2: '#ff6ba4', label: 'dMoney' },
  AWALLET: { mono: 'aw', color: '#6B2D8B', color2: '#b468d9', label: 'A Wallet' },
  // Banks / manual
  BANK_TRANSFER: { mono: '৳', color: '#475569', color2: '#94a3b8', label: 'Bank Transfer' },
  CARD_MANUAL: { mono: '▭', color: '#1E293B', color2: '#64748b', label: 'Card' },
  // Global PSPs
  SSLCOMMERZ: { mono: 'S', color: '#DA1F26', color2: '#ff7a70', label: 'SSLCommerz' },
  AAMARPAY: { mono: 'a', color: '#F7941D', color2: '#ffc46b', label: 'AamarPay' },
  SHURJOPAY: { mono: 'sh', color: '#ED1C24', color2: '#ff7a7a', label: 'ShurjoPay' },
  PAYSTATION: { mono: 'ps', color: '#0C7C59', color2: '#43c39a', label: 'PayStation' },
  PORTWALLET: { mono: 'pw', color: '#0F4C81', color2: '#4a8ac9', label: 'PortWallet' },
  NEXUSPAY: { mono: 'nx', color: '#5B21B6', color2: '#a875ec', label: 'NexusPay' },
  STRIPE: { mono: 'S', color: '#635BFF', color2: '#9d97ff', label: 'Stripe' },
  PAYPAL: { mono: 'P', color: '#003087', color2: '#009cde', label: 'PayPal' },
  GOOGLE_PAY: { mono: 'G', color: '#4285F4', color2: '#34A853', label: 'Google Pay' },
  APPLE_PAY: { mono: '', color: '#111111', color2: '#3d3d3d', label: 'Apple Pay' },
  SAMSUNG_PAY: { mono: 'S', color: '#1428A0', color2: '#5c6cff', label: 'Samsung Pay' },
  BINANCE_PAY: { mono: 'B', color: '#F0B90B', color2: '#ffe066', label: 'Binance Pay' },
  NOWPAYMENTS: { mono: 'N', color: '#1B314F', color2: '#4a6d9c', label: 'NowPayments' },
  OXAPAY: { mono: 'O', color: '#0BA5EC', color2: '#6ed0ff', label: 'OxaPay' },
  WISE: { mono: 'W', color: '#9FE870', color2: '#c8f5a0', label: 'Wise' },
  PAYONEER: { mono: 'Py', color: '#FF4800', color2: '#ff9a6b', label: 'Payoneer' },
}

const VARIANT_SUFFIX = /_(PERSONAL|AGENT|MERCHANT)$/

/** Resolve brand meta for a gateway code. Falls back to initials from the code. */
export function gatewayBrand(code?: string | null, mfs?: string | null, fallbackColor?: string | null): BrandMeta {
  const base = (code ?? '').replace(VARIANT_SUFFIX, '').toUpperCase()
  if (BRANDS[base]) return BRANDS[base]
  const m = (mfs ?? '').toUpperCase()
  if (BRANDS[m]) return BRANDS[m]
  if (base.startsWith('CARD') || base.includes('VISA') || base.includes('MASTERCARD')) return BRANDS.CARD_MANUAL
  if (base.startsWith('BANK')) return BRANDS.BANK_TRANSFER
  const initials = (base || m || 'GW').slice(0, 2)
  return { mono: initials, color: fallbackColor ?? '#2563EB', color2: undefined }
}

export function GatewayLogo({
  code,
  mfs,
  color,
  size = 36,
  className,
  rounded = 'rounded-xl',
}: {
  code?: string | null
  mfs?: string | null
  color?: string | null
  size?: number
  className?: string
  rounded?: string
}) {
  const brand = gatewayBrand(code, mfs, color)
  const c2 = brand.color2 ?? brand.color
  const fontSize = brand.mono.length > 2 ? size * 0.3 : brand.mono.length === 2 ? size * 0.38 : size * 0.52
  return (
    <span
      role="img"
      aria-label={brand.label ?? 'Gateway'}
      title={brand.label ?? undefined}
      className={cn(
        'ilp-gw-logo relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden font-extrabold leading-none text-white shadow-sm',
        rounded,
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize,
        background: `linear-gradient(135deg, ${brand.color} 0%, ${c2} 130%)`,
        letterSpacing: brand.mono.length > 2 ? '-0.02em' : undefined,
        textShadow: '0 1px 2px rgba(0,0,0,0.18)',
      }}
    >
      {/* subtle gloss */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(120% 90% at 20% 0%, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0) 55%)' }}
      />
      <span className="relative" style={{ transform: 'translateY(-1%)' }}>
        {brand.mono}
      </span>
    </span>
  )
}

/** Tile + name row for lists/tables. */
export function GatewayLogoName({
  code,
  mfs,
  color,
  name,
  size = 32,
  className,
}: {
  code?: string | null
  mfs?: string | null
  color?: string | null
  name: string
  size?: number
  className?: string
}) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <GatewayLogo code={code} mfs={mfs} color={color} size={size} />
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-foreground">{name}</span>
      </span>
    </span>
  )
}

export const GATEWAY_BRAND_COUNT = Object.keys(BRANDS).length
