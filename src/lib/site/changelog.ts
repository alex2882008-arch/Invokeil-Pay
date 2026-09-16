/**
 * Public changelog content — rendered by /changelog (newest first).
 * Dates are ISO YYYY-MM-DD.
 */

export interface ChangelogGroup {
  label: 'Added' | 'Changed' | 'Improved' | 'Fixed' | 'Security' | 'Performance' | 'Note'
  items: string[]
}

export interface ChangelogEntry {
  version: string
  date: string
  tag: 'Major' | 'Minor' | 'Patch'
  title: string
  groups: ChangelogGroup[]
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '3.0.0',
    date: '2026-07-10',
    tag: 'Major',
    title: 'The communication & operations release',
    groups: [
      {
        label: 'Added',
        items: [
          'Communication suite — email providers with encrypted configs and failover chains (Resend, SES, MailerSend, Plunk, Loops, SMTP), identities, and a 320-template catalogue with variables.',
          'SMS provider layer (Twilio, Telynx, Plivo, textbee, AWS SNS) with per-brand message templates across SMS and email.',
          'Visual automation builder — trigger → condition → action workflows with waits, 20+ built-in templates and a run history inspector.',
          'Money operations: refunds with approval routing, disputes with message threads and deadlines, settlement reconciliation with mismatch detection, and an accounting ledger with CSV export.',
          'Trust & safety center — velocity/amount/list/hour risk rules, risk scoring with case queue, allow & block lists, and approval requests with amount thresholds.',
          'Operations center (OPS) with runbooks, plus a KYC profile workflow (PENDING → SUBMITTED → VERIFIED) for merchant onboarding.',
          'Developer console — API explorer, webhook simulator and fresh-signature replay, request inspector, event ledger, sandbox scenario injector and copy-ready snippets in five languages.',
          'Customer portal and public payment verification pages.',
          'Multi-brand support: per-brand gateways, identities, message templates and scoped API keys.',
          'Sandbox mode driving the real pipeline with six scenarios: success, failure, timeout, refund, chargeback and insufficient.',
          'Public website: docs, pricing, changelog, system status and a full legal library grounded in current Bangladeshi law.',
        ],
      },
      {
        label: 'Improved',
        items: [
          'Checkout pages gained a customer claim flow with SMS-matcher friendly TrxID entry, live polling and an animated success screen.',
          'English + বাংলা across the entire panel; dark mode audited on every new surface.',
          'Command palette covers every admin module; deep-linkable URL state on all list views.',
        ],
      },
    ],
  },
  {
    version: '2.0.0',
    date: '2026-03-02',
    tag: 'Major',
    title: 'Sixteen modules and the merchant API',
    groups: [
      {
        label: 'Added',
        items: [
          'Merchant API v1: POST /api/v1/checkout, GET /api/v1/checkout/{token} and the PipraPay-compatible POST /api/v1/verify-payment.',
          'Store system with scoped API keys, domain whitelists and HMAC-SHA256 signed webhooks (t=, v1=) with 5-attempt retry schedule.',
          '56-gateway catalogue with per-gateway charges, wallet numbers, QR instructions and brand-coloured payment pages.',
          'Invoices (line items, partials, reminders) and payment links (passwords, usage limits, expiry).',
          'Android companion app v2: QR pairing, custom sender whitelist, Bangla-negative OTP filter, heartbeat telemetry and app lock.',
          'Admin core: transactions, customers with tags, gateways, devices, settings, reports, users with roles and 2FA.',
        ],
      },
      {
        label: 'Security',
        items: [
          'Login throttling, session management, 2FA and an audit log (ActivityLog) across every privileged action.',
        ],
      },
    ],
  },
  {
    version: '1.0.0',
    date: '2025-11-18',
    tag: 'Major',
    title: 'First public release',
    groups: [
      {
        label: 'Added',
        items: [
          'The original idea, shipped: pair an Android phone, receive bKash/Nagad SMS, match them to open payments automatically.',
          'Hosted checkout pages with countdown expiry and manual verification queue.',
          'Single-tenant panel with transaction list, gateway settings and device management.',
        ],
      },
      {
        label: 'Note',
        items: [
          'v1 matched SMS by amount + sender only. The TrxID-precise matcher, tolerances and claim flow arrived in v1.4 and were rebuilt in v2.',
        ],
      },
    ],
  },
]
