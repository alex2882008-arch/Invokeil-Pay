'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * Gateway Logo System — real brand wordmark SVGs from /public/gateways/*.svg
 * rendered on a white rounded tile (UddoktaPay-checkout style), with the
 * colored monogram gradient tile kept as an automatic fallback whenever a
 * logo image is missing or fails to load. Used in admin tables, checkout
 * selector, wizard, links and invoices.
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
  IPAY: { mono: 'ip', color: '#019789', color2: '#4fc9bc', label: 'iPay' },
  SURECASH: { mono: 'sc', color: '#7C2582', color2: '#c168c9', label: 'SureCash' },
  MEGHNAPAY: { mono: 'mp', color: '#00529B', color2: '#4a90d9', label: 'Meghna Pay' },
  TRUSTMONEY: { mono: 'tm', color: '#003B71', color2: '#3a77bd', label: 'Trust Money' },
  DMONEY: { mono: 'd', color: '#E4136E', color2: '#ff6ba4', label: 'dMoney' },
  AWALLET: { mono: 'aw', color: '#6B2D8B', color2: '#b468d9', label: 'A Wallet' },
  // Banks / manual
  BANK_TRANSFER: { mono: '৳', color: '#334155', color2: '#64748b', label: 'Bank Transfer' },
  CARD_MANUAL: { mono: '▭', color: '#1A1F36', color2: '#64748b', label: 'Card' },
  // BD banks (branded)
  ISLAMI_BANK: { mono: 'IB', color: '#006B3F', color2: '#37a878', label: 'Islami Bank' },
  DBSL_BANK: { mono: 'DB', color: '#00563F', color2: '#8C3494', label: 'Dutch-Bangla Bank' },
  // BD PSPs
  SSLCOMMERZ: { mono: 'S', color: '#ED1C24', color2: '#1B3F94', label: 'SSLCommerz' },
  AAMARPAY: { mono: 'a', color: '#F7941D', color2: '#ffc46b', label: 'AamarPay' },
  SHURJOPAY: { mono: 'sh', color: '#229454', color2: '#E2151C', label: 'ShurjoPay' },
  PAYSTATION: { mono: 'ps', color: '#351E53', color2: '#6d4a9e', label: 'PayStation' },
  PORTWALLET: { mono: 'pw', color: '#0F4C81', color2: '#4a8ac9', label: 'PortWallet' },
  NEXUSPAY: { mono: 'nx', color: '#5B21B6', color2: '#a875ec', label: 'NexusPay' },
  NEXPAY: { mono: 'nx', color: '#5B21B6', color2: '#a875ec', label: 'NexusPay' },
  EPS: { mono: 'EP', color: '#EE2D42', color2: '#ff7d8c', label: 'EPS' },
  // Global PSPs
  STRIPE: { mono: 'S', color: '#635BFF', color2: '#9d97ff', label: 'Stripe' },
  PAYPAL: { mono: 'P', color: '#003087', color2: '#009cde', label: 'PayPal' },
  GOOGLE_PAY: { mono: 'G', color: '#4285F4', color2: '#34A853', label: 'Google Pay' },
  APPLE_PAY: { mono: '', color: '#111111', color2: '#3d3d3d', label: 'Apple Pay' },
  SAMSUNG_PAY: { mono: 'S', color: '#1428A0', color2: '#5c6cff', label: 'Samsung Pay' },
  BINANCE_PAY: { mono: 'B', color: '#F0B90B', color2: '#ffe066', label: 'Binance Pay' },
  BINANCE: { mono: 'B', color: '#F0B90B', color2: '#ffe066', label: 'Binance Pay' },
  NOWPAYMENTS: { mono: 'N', color: '#1B314F', color2: '#6C35C3', label: 'NowPayments' },
  OXAPAY: { mono: 'O', color: '#0BA5EC', color2: '#6ed0ff', label: 'OxaPay' },
  WISE: { mono: 'W', color: '#9FE870', color2: '#c8f5a0', label: 'Wise' },
  PAYONEER: { mono: 'Py', color: '#FF4800', color2: '#ff9a6b', label: 'Payoneer' },
  PAYEER: { mono: 'P', color: '#1B75BB', color2: '#5aa9e0', label: 'Payeer' },
  TAPTAP_SEND: { mono: 'TT', color: '#03691F', color2: '#3fa860', label: 'TapTap Send' },
  // Card brands
  VISA: { mono: 'V', color: '#1A1F71', color2: '#4a5ab8', label: 'Visa' },
  MASTERCARD: { mono: 'MC', color: '#EB001B', color2: '#F79E1B', label: 'Mastercard' },
  AMEX: { mono: 'AX', color: '#2E77BC', color2: '#5a9de0', label: 'American Express' },
}

/** Brand key → public SVG wordmark under /public/gateways/. */
export const LOGO_MAP: Record<string, string> = {
  BKASH: '/gateways/bkash.svg',
  NAGAD: '/gateways/nagad.svg',
  ROCKET: '/gateways/rocket.svg',
  UPAY: '/gateways/upay.svg',
  TAP: '/gateways/tap.svg',
  TELECASH: '/gateways/telecash.svg',
  MCASH: '/gateways/mcash.svg',
  OKWALLET: '/gateways/okwallet.svg',
  PATHAOPAY: '/gateways/pathaopay.svg',
  CELLFIN: '/gateways/cellfin.svg',
  IPAY: '/gateways/ipay.svg',
  SURECASH: '/gateways/surecash.svg',
  MEGHNAPAY: '/gateways/meghnapay.svg',
  TRUSTMONEY: '/gateways/trustmoney.svg',
  DMONEY: '/gateways/dmoney.svg',
  AWALLET: '/gateways/awallet.svg',
  BANK_TRANSFER: '/gateways/bank-transfer.svg',
  SSLCOMMERZ: '/gateways/sslcommerz.svg',
  AAMARPAY: '/gateways/aamarpay.svg',
  SHURJOPAY: '/gateways/shurjopay.svg',
  PAYSTATION: '/gateways/paystation.svg',
  PORTWALLET: '/gateways/portwallet.svg',
  NEXPAY: '/gateways/nexpay.svg',
  NEXUSPAY: '/gateways/nexpay.svg',
  EPS: '/gateways/eps.svg',
  STRIPE: '/gateways/stripe.svg',
  PAYPAL: '/gateways/paypal.svg',
  GOOGLE_PAY: '/gateways/google-pay.svg',
  APPLE_PAY: '/gateways/apple-pay.svg',
  SAMSUNG_PAY: '/gateways/samsung-pay.svg',
  BINANCE_PAY: '/gateways/binance.svg',
  BINANCE: '/gateways/binance.svg',
  NOWPAYMENTS: '/gateways/nowpayments.svg',
  OXAPAY: '/gateways/oxapay.svg',
  WISE: '/gateways/wise.svg',
  PAYONEER: '/gateways/payoneer.svg',
  PAYEER: '/gateways/payeer.svg',
  TAPTAP_SEND: '/gateways/taptap-send.svg',
  CARD_MANUAL: '/gateways/card.svg',
  VISA: '/gateways/visa.svg',
  MASTERCARD: '/gateways/mastercard.svg',
  AMEX: '/gateways/amex.svg',
  ISLAMI_BANK: '/gateways/islami-bank.svg',
  DBSL_BANK: '/gateways/dbsl-bank.svg',
}

const VARIANT_SUFFIX = /_(PERSONAL|AGENT|MERCHANT)$/

/** Resolve brand meta for a gateway code. Falls back to initials from the code. */
export function gatewayBrand(code?: string | null, mfs?: string | null, fallbackColor?: string | null): BrandMeta {
  const base = (code ?? '').replace(VARIANT_SUFFIX, '').toUpperCase()
  if (BRANDS[base]) return BRANDS[base]
  const m = (mfs ?? '').toUpperCase()
  if (BRANDS[m]) return BRANDS[m]
  if (base.includes('MASTERCARD')) return BRANDS.MASTERCARD
  if (base.includes('VISA')) return BRANDS.VISA
  if (base.includes('AMEX') || base.includes('AMERICAN')) return BRANDS.AMEX
  if (base.startsWith('CARD')) return BRANDS.CARD_MANUAL
  if (base.startsWith('BANK')) return BRANDS.BANK_TRANSFER
  const initials = (base || m || 'GW').slice(0, 2)
  return { mono: initials, color: fallbackColor ?? '#2563EB', color2: undefined }
}

/** Resolve the public wordmark SVG for a gateway code/mfs. null → monogram fallback. */
export function gatewayLogoSrc(code?: string | null, mfs?: string | null): string | null {
  const base = (code ?? '').replace(VARIANT_SUFFIX, '').toUpperCase()
  if (LOGO_MAP[base]) return LOGO_MAP[base]
  if (base.includes('MASTERCARD')) return LOGO_MAP.MASTERCARD
  if (base.includes('VISA')) return LOGO_MAP.VISA
  if (base.includes('AMEX') || base.includes('AMERICAN')) return LOGO_MAP.AMEX
  const m = (mfs ?? '').toUpperCase()
  if (LOGO_MAP[m]) return LOGO_MAP[m]
  if (base.startsWith('CARD') || m === 'GLOBAL') return LOGO_MAP.CARD_MANUAL
  if (base.startsWith('BANK') || m === 'BANK') return LOGO_MAP.BANK_TRANSFER
  return null
}

/** Classic colored monogram gradient tile — fallback when no logo image. */
function BrandMonogram({
  brand,
  size = 36,
  className,
  rounded = 'rounded-xl',
}: {
  brand: BrandMeta
  size?: number
  className?: string
  rounded?: string
}) {
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

export function GatewayLogo({
  code,
  mfs,
  color,
  size = 36,
  className,
  rounded = 'rounded-xl',
  variant = 'tile',
}: {
  code?: string | null
  mfs?: string | null
  color?: string | null
  size?: number
  className?: string
  rounded?: string
  /** 'tile' = white rounded tile with the wordmark; 'wordmark' = bare image for white cards. */
  variant?: 'tile' | 'wordmark'
}) {
  const brand = gatewayBrand(code, mfs, color)
  const src = gatewayLogoSrc(code, mfs)
  // Track WHICH src failed so the fallback resets itself whenever the resolved
  // logo changes (no effect needed — pure derived state).
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const imgFailed = src != null && failedSrc === src
  const label = brand.label ?? 'Gateway'

  if (src && !imgFailed) {
    if (variant === 'wordmark') {
      return (
        <span
          role="img"
          aria-label={label}
          title={label}
          className={cn('inline-flex shrink-0 select-none items-center', className)}
        >
          <img
            key={src}
            src={src}
            alt=""
            onError={() => setFailedSrc(src)}
            style={{ height: size }}
            className="w-auto object-contain"
          />
        </span>
      )
    }
    return (
      <span
        role="img"
        aria-label={label}
        title={label}
        className={cn(
          'relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden bg-white shadow-sm ring-1 ring-black/5',
          rounded,
          className,
        )}
        style={{ width: size, height: size }}
      >
        <img
          key={src}
          src={src}
          alt=""
          onError={() => setFailedSrc(src)}
          className="h-full w-full object-contain"
          style={{ padding: Math.max(2, Math.round(size * 0.15)) }}
        />
      </span>
    )
  }

  return <BrandMonogram brand={brand} size={size} className={className} rounded={rounded} />
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

/** Small inline row of card-brand wordmarks (Visa / Mastercard / Amex). */
export function GatewayCardLogos({ className }: { className?: string }) {
  const logos = [
    { src: LOGO_MAP.VISA, alt: 'Visa' },
    { src: LOGO_MAP.MASTERCARD, alt: 'Mastercard' },
    { src: LOGO_MAP.AMEX, alt: 'American Express' },
  ]
  return (
    <span
      role="img"
      aria-label="Visa, Mastercard and American Express accepted"
      className={cn('inline-flex shrink-0 items-center gap-2', className)}
    >
      {logos.map((l) => (
        <CardWordmark key={l.alt} src={l.src} alt={l.alt} />
      ))}
    </span>
  )
}

function CardWordmark({ src, alt }: { src: string; alt: string }) {
  // Derived failure state — auto-resets if the src prop ever changes.
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  if (failedSrc === src) return null
  return (
    <img
      key={src}
      src={src}
      alt={alt}
      title={alt}
      onError={() => setFailedSrc(src)}
      className="h-4 w-auto object-contain md:h-5"
    />
  )
}

export const GATEWAY_BRAND_COUNT = Object.keys(BRANDS).length
