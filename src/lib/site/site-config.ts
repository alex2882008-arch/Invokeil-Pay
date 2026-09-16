/**
 * Central public-site configuration (marketing content, contact points, nav).
 * Single source of truth for the (site) route group.
 */

export const SITE = {
  name: 'Invokeil Pay',
  tagline: 'Self-hosted payment automation for Bangladesh',
  description:
    'Invokeil Pay is a self-hosted payment gateway that turns Android phones into a verified MFS collection network — bKash, Nagad, Rocket, Upay and 50+ gateways with SMS auto-verification, invoices, payment links, subscriptions and a full merchant API.',
  brand: '#2563EB',
  version: '3.0.0',
  links: {
    dashboard: '/login',
    docs: '/docs',
    pricing: '/pricing',
    changelog: '/changelog',
    status: '/status',
    contact: '/contact',
    github: 'https://github.com/invokeil/pay',
  },
  emails: {
    support: 'support@invokeil.com',
    security: 'security@invokeil.com',
    legal: 'legal@invokeil.com',
    dpo: 'dpo@invokeil.com',
    grievance: 'grievance@invokeil.com',
    sales: 'sales@invokeil.com',
  },
  phone: '+880 1811-234567',
  whatsapp: '+880 1811-234567',
  telegram: 'invokeilpay',
  address: 'Level 6, House 12, Road 5, Dhanmondi, Dhaka 1205, Bangladesh',
  hours: 'Sunday–Thursday, 10:00–18:00 BST (UTC+6)',
  jurisdiction: 'People’s Republic of Bangladesh',
} as const

/** Footer navigation groups (legal slugs must mirror LEGAL_DOCS in legal-content.ts). */
export const FOOTER_NAV = [
  {
    label: 'Product',
    links: [
      { href: '/docs', label: 'Documentation' },
      { href: '/pricing', label: 'Pricing' },
      { href: '/changelog', label: 'Changelog' },
      { href: '/status', label: 'System status' },
      { href: '/contact', label: 'Contact' },
    ],
  },
  {
    label: 'Developers',
    links: [
      { href: '/docs/merchant-api', label: 'Merchant API' },
      { href: '/docs/api-reference', label: 'API reference' },
      { href: '/docs/webhooks', label: 'Webhooks' },
      { href: '/docs/sdks', label: 'SDKs' },
      { href: '/docs/sandbox-testing', label: 'Sandbox testing' },
    ],
  },
  {
    label: 'Legal',
    links: [
      { href: '/legal/terms', label: 'Terms of Service' },
      { href: '/legal/privacy', label: 'Privacy Policy' },
      { href: '/legal/merchant-agreement', label: 'Merchant Agreement' },
      { href: '/legal/aml-kyc', label: 'AML/CFT & KYC Policy' },
      { href: '/legal/grievance', label: 'Grievance & Complaints' },
      { href: '/legal/license', label: 'License' },
    ],
  },
] as const

/** Bengali courtesy line rendered in the footer. */
export const FOOTER_BN = 'নিজের সার্ভারে হোস্ট করা পেমেন্ট অটোমেশন — বাংলাদেশের এমএফএস গেটওয়ের জন্য তৈরি।'
