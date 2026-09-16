/**
 * Public documentation content — 14 articles rendered by /docs.
 * Format is intentionally markdown-ish-structured (typed blocks) so the
 * renderer stays a dumb, safe React component (no dangerouslySetInnerHTML).
 */

export type DocBlock =
  | { type: 'h2'; text: string }
  | { type: 'p'; text: string }
  | { type: 'code'; lang?: string; title?: string; code: string }
  | { type: 'list'; items: string[]; ordered?: boolean }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'note'; tone?: 'info' | 'warn'; text: string }

export interface DocArticle {
  slug: string
  title: string
  section: string
  updated: string
  intro: string
  blocks: DocBlock[]
}

export const DOC_SECTIONS = ['Start here', 'Payments', 'Developers'] as const

export const ARTICLES: DocArticle[] = [
  // ───────────────────────────── Start here ─────────────────────────────
  {
    slug: 'getting-started',
    title: 'Getting started',
    section: 'Start here',
    updated: '2026-07-10',
    intro: 'Install Invokeil Pay on your own server, sign in, and take your first SMS-verified payment in under thirty minutes.',
    blocks: [
      { type: 'h2', text: 'What you need' },
      { type: 'list', items: [
        'A server or VPS with 1 vCPU / 1 GB RAM (a $5 droplet is plenty) running any modern Linux.',
        'Node.js 20+ and Bun, or the bundled Docker image — Invokeil Pay ships as a single Next.js app with an embedded SQLite database.',
        'One Android phone (Android 10+) with a SIM that receives MFS confirmation SMS from bKash, Nagad, Rocket, Upay or your bank.',
        'An active wallet or merchant account on at least one mobile financial service.',
      ] },
      { type: 'h2', text: 'Install' },
      { type: 'p', text: 'The fastest path is the official image. Both options keep all data — database, uploads, logs — inside one volume you control.' },
      { type: 'code', lang: 'bash', title: 'Docker (recommended)', code: `docker run -d \\
  --name invokeil-pay \\
  -p 3000:3000 \\
  -v invokeil-data:/app/data \\
  --restart unless-stopped \\
  ghcr.io/invokeil/pay:3` },
      { type: 'code', lang: 'bash', title: 'From source', code: `git clone https://github.com/invokeil/pay.git && cd pay \\
bun install \\
bun run db:push \\
bun run build && bun run start   # serves on :3000` },
      { type: 'note', tone: 'info', text: 'Put the app behind a reverse proxy with TLS (Caddy is bundled in the repo and needs a two-line Caddyfile) before pairing devices — the Android app requires HTTPS.' },
      { type: 'h2', text: 'First-run wizard' },
      { type: 'p', text: 'Open your domain and the setup wizard walks you through four screens: create the owner account, set your brand name and currency, pick a default expiry for checkouts, and generate your first API key. Every setting can be changed later under Admin → Settings.' },
      { type: 'h2', text: 'Pair your first device' },
      { type: 'list', ordered: true, items: [
        'Open Admin → Devices and click Pair device to get a QR code.',
        'Install “Invokeil Pay” from the Play Store (or the signed APK from the releases page).',
        'Scan the QR — it contains your instance URL, a device key and a pairing code.',
        'Grant the SMS read/receive permission and the battery-optimization exemption when prompted.',
        'Watch the dashboard: the device dot turns green and the heartbeat shows battery, signal and SIM state.',
      ] },
      { type: 'h2', text: 'Take a test payment' },
      { type: 'p', text: 'Create a checkout from Admin → Checkouts, send ৳1 to the shown wallet number from any phone, and keep the page open. When the gateway confirmation SMS reaches your paired device, the page flips to PAID on its own — usually in under a second. That is the whole loop: SMS in, verified transaction out.' },
      { type: 'h2', text: 'Where to next' },
      { type: 'list', items: [
        'Wire your store to the Merchant API and get webhooks on every payment.',
        'Turn on sandbox mode to test integrations without touching real money.',
        'Browse Admin → Automations to auto-notify customers the moment a payment lands.',
      ] },
    ],
  },
  {
    slug: 'devices-sms-setup',
    title: 'Devices & SMS setup',
    section: 'Start here',
    updated: '2026-07-10',
    intro: 'Your paired Android phones are the verification engine. Here is how pairing, permissions, sender filtering and heartbeats work.',
    blocks: [
      { type: 'h2', text: 'How a device becomes a gateway' },
      { type: 'p', text: 'A “device” is one Android phone running the Invokeil Pay companion app. After pairing, the app listens to the notification-level SMS inbox and uploads only messages from recognised MFS senders to your server over HTTPS. The server matches each SMS against open checkouts, invoices and links, then stores it as a Transaction with the extracted TrxID, amount and sender number.' },
      { type: 'h2', text: 'Pairing' },
      { type: 'list', ordered: true, items: [
        'Admin → Devices → Pair device shows a QR containing { url, key, code } as JSON.',
        'In the app, tap Scan QR or paste the values manually.',
        'Connect & test makes one authenticated call to /api/v1/heartbeat — you will see “Connected” when it succeeds.',
        'The device appears in the panel as LISTENING within a few seconds.',
      ] },
      { type: 'note', tone: 'warn', text: 'The device key is a credential. Anyone holding it can post SMS to your instance. Unpair immediately from Admin → Devices if a phone is lost.' },
      { type: 'h2', text: 'Permissions Android will ask for' },
      { type: 'table', headers: ['Permission', 'Why it is needed', 'Required?'], rows: [
        ['SMS — read & receive', 'Read gateway confirmation messages the moment they arrive.', 'Yes'],
        ['Notifications', 'Foreground status and per-event alerts (payment received, auth errors).', 'Yes'],
        ['Battery optimization exemption', 'Keeps the listener alive on Xiaomi, Oppo, Vivo and Samsung battery managers.', 'Recommended'],
        ['Biometrics / PIN', 'Optional app lock so a shared phone cannot open the panel.', 'Optional'],
      ] },
      { type: 'h2', text: 'Sender whitelist & privacy filter' },
      { type: 'p', text: 'The app uploads messages only from a built-in sender whitelist — bKash, Nagad, Rocket, Upay, uPay, CellFin, TeleCash, mCash, Pathao Pay, iPay, 16216, 8446 and any custom senders you add in app Settings. Messages containing OTP/PIN/password patterns (English and Bangla) are filtered locally and never leave the phone.' },
      { type: 'h2', text: 'Heartbeats & health' },
      { type: 'p', text: 'Every 15 minutes the app posts battery %, signal, model, Android version and SIM list to /api/v1/heartbeat. The devices grid turns a device amber after two missed heartbeats and red after five, and the device.online webhook fires when it reconnects — useful for pager integrations.' },
      { type: 'h2', text: 'Multiple SIMs and shared phones' },
      { type: 'p', text: 'Each message is tagged with the SIM it arrived on (subscription id + carrier), so one phone can hold a personal bKash SIM and a business Nagad SIM without ambiguity. Balances per device and per gateway are tracked on the Devices page for reconciliation.' },
    ],
  },

  // ───────────────────────────── Payments ─────────────────────────────
  {
    slug: 'gateways',
    title: 'Gateways',
    section: 'Payments',
    updated: '2026-07-10',
    intro: 'Configure the 56 built-in MFS, bank and PSP gateways — wallet numbers, charges, account types and customer-facing instructions.',
    blocks: [
      { type: 'h2', text: 'The gateway catalogue' },
      { type: 'p', text: 'Invokeil Pay ships with 56 pre-seeded gateways across mobile financial services (bKash, Nagad, Rocket, Upay, CellFin, TeleCash, mCash, Pathao Pay, iPay…), banks with card support, and generic PSPs. Each entry carries a code, category, brand colour and logo, so customer-facing pages always look native to the wallet the customer already trusts.' },
      { type: 'h2', text: 'Account types' },
      { type: 'table', headers: ['Account type', 'Meaning', 'Typical use'], rows: [
        ['AGENT', 'Agent-style wallet with cash-in/cash-out limits.', 'Shop collecting from walk-in customers'],
        ['PERSONAL', 'Personal wallet number receiving payments.', 'Freelancers, personal invoices'],
        ['MERCHANT', 'Registered merchant account with approved limits.', 'Businesses with an MFS merchant onboarding'],
        ['BANK', 'Bank account / card route with reference numbers.', 'Larger invoices, B2B payments'],
      ] },
      { type: 'h2', text: 'Charges & customer-pays pricing' },
      { type: 'p', text: 'Each gateway can define a percentage charge, a flat fee, or both — optionally billed to the customer. When “customer pays charge” is enabled, a ৳800 checkout on a gateway charging 1.5% shows an ৳812 total with a transparent breakdown on the payment page, and the matched transaction records the gross, fee and net separately.' },
      { type: 'h2', text: 'Wallet numbers & instructions' },
      { type: 'list', items: [
        'Set one or more wallet numbers per gateway; the payment page shows them with copy buttons and a QR where the wallet app supports deep links.',
        'Write per-gateway instructions (Bangla and English) — they appear verbatim on the checkout page.',
        'Stipulate “amount must match exactly”; the SMS matcher enforces the tolerance you configure in Settings.',
      ] },
      { type: 'h2', text: 'Enable, reorder, brand' },
      { type: 'p', text: 'Only enabled gateways appear to customers. Drag to reorder — the order is respected on checkout pages. On multi-brand installs, Admin → Brands lets you attach a different gateway subset per brand, so a store can run bKash-only while another offers the full catalogue.' },
      { type: 'note', tone: 'info', text: 'Gateway changes are captured as ApprovalRequest events when the amount threshold applies, and every edit is written to the audit log with actor and diff.' },
    ],
  },
  {
    slug: 'checkouts',
    title: 'Checkouts',
    section: 'Payments',
    updated: '2026-07-10',
    intro: 'Hosted payment pages with live SMS matching, gateway selection, expiry and customer claims — the core object everything else builds on.',
    blocks: [
      { type: 'h2', text: 'Life cycle' },
      { type: 'list', ordered: true, items: [
        'PENDING — checkout created (panel, API, link or invoice), customer has not paid.',
        'PAID — the confirmation SMS matched the amount and gateway; TrxID stored, webhooks fired.',
        'CANCELLED — customer cancelled, merchant cancelled, or the API was used to cancel.',
        'EXPIRED — expiry passed with no payment (default 24 h, configurable 1–168 h).',
      ] },
      { type: 'h2', text: 'The payment page' },
      { type: 'p', text: 'Every checkout gets a public page at /pay/{token}: your brand, the amount in large type, gateway selector with native logos, step-by-step payment instructions, QR, and a “I have paid” claim flow where customers enter the TrxID from their SMS. Claims are matched against pending transactions and resolved automatically when the SMS arrives.' },
      { type: 'h2', text: 'Expiry & countdown' },
      { type: 'p', text: 'A live countdown runs on the page. When it reaches zero the checkout auto-persists as EXPIRED, polls stop, and any late SMS is recorded as an unmatched transaction for manual review instead of silently overwriting state.' },
      { type: 'h2', text: 'Custom fields & metadata' },
      { type: 'p', text: 'Checkouts accept up to five custom fields (created in Admin → Checkouts) and an arbitrary metadata JSON object through the API. Metadata is echoed in webhooks and the verify endpoint — the standard place to keep your internal order ID.' },
      { type: 'code', lang: 'json', title: 'metadata example', code: `{
  "order_id": "8471",
  "items": 2,
  "channel": "web",
  "utm_campaign": "eid_sale"
}` },
      { type: 'note', tone: 'info', text: 'Checkouts are store-scoped: API keys can only see and pay checkouts belonging to their own store, and the domain whitelist applies to every redirect URL.' },
    ],
  },
  {
    slug: 'payment-links',
    title: 'Payment links',
    section: 'Payments',
    updated: '2026-07-10',
    intro: 'Short, shareable URLs for getting paid from any messenger — with passwords, limits, expiry and per-gateway routing.',
    blocks: [
      { type: 'h2', text: 'Create a link' },
      { type: 'p', text: 'Admin → Links → New link: set amount (or “customer chooses”), title, a short slug (link/{slug}) or let the system generate one, and optional restrictions. Links are the fastest way to get paid — no integration needed.' },
      { type: 'h2', text: 'Options' },
      { type: 'table', headers: ['Option', 'Behaviour'], rows: [
        ['Fixed amount', 'Customer pays exactly what you set; editable charge breakdown shown.', ],
        ['Open amount', 'Customer types any amount above your minimum (useful for donations).'],
        ['Password', 'Link asks for a passphrase before showing payment instructions.'],
        ['Expiry', 'Link stops accepting payments at the chosen date/time.'],
        ['Usage limit', 'Total number of successful payments allowed before auto-disabling.'],
        ['Gateway routing', 'Restrict which gateways are offered on this link.'],
      ] },
      { type: 'h2', text: 'Views and analytics' },
      { type: 'p', text: 'Each link counts views and conversions. The admin table shows views, payments collected and conversion rate; the public page keeps referrers out of the data set — no third-party trackers are loaded.' },
      { type: 'h2', text: 'SMS cascade' },
      { type: 'p', text: 'When a link payment succeeds, the same SMS-matching pipeline applies: the incoming wallet SMS is matched to the generated checkout, the payer is upserted as a customer, notifications fire, and payment_link.paid is dispatched to your endpoints.' },
    ],
  },
  {
    slug: 'invoices',
    title: 'Invoices',
    section: 'Payments',
    updated: '2026-07-10',
    intro: 'Itemised invoices with reminders, partial payments and recurring generation — settled through the same SMS-verified rails.',
    blocks: [
      { type: 'h2', text: 'Anatomy of an invoice' },
      { type: 'list', items: [
        'Header — invoice number (sequential, e.g. INV-2026-0042), your brand, dates.',
        'Line items — description, quantity, unit price, optional per-line discount.',
        'Totals — subtotal, discount, tax, paid-to-date (partials), balance due.',
        'Public page — invoice/{token} with the same gateway selector as checkouts.',
      ] },
      { type: 'h2', text: 'Partial payments' },
      { type: 'p', text: 'Enable partials per invoice to let customers pay in instalments. Each matched SMS adds a payment entry with its own TrxID; the invoice flips to PAID when the balance reaches zero and PARTIAL is shown until then, with everything visible on the public page.' },
      { type: 'h2', text: 'Reminders' },
      { type: 'p', text: 'Schedule up to three reminders (email and/or SMS) at offsets before or after the due date. Reminders respect quiet hours, include the payment link, and stop automatically once the invoice is settled.' },
      { type: 'h2', text: 'Recurring invoices' },
      { type: 'p', text: 'Set an interval (weekly to yearly) and a parent invoice generates children on schedule — the same engine subscriptions use. Children inherit line items and can be edited before sending. Every generated invoice is visible in the series timeline.' },
      { type: 'note', tone: 'info', text: 'invoice.paid carries invoice_number, amount, trx_id and customer details, so accounting systems (or the CSV export under Admin → Accounting) stay in sync without manual entry.' },
    ],
  },
  {
    slug: 'subscriptions',
    title: 'Subscriptions',
    section: 'Payments',
    updated: '2026-07-10',
    intro: 'Recurring plans with trials, automatic dunning and customer-level retry limits — all collected through MFS payments your devices verify.',
    blocks: [
      { type: 'h2', text: 'Plans and billing' },
      { type: 'p', text: 'A subscription ties a customer to a plan amount and interval (WEEKLY, MONTHLY, QUARTERLY or YEARLY). On every billing date, Invokeil generates an invoice for the cycle; you can collect it by sending the customer the payment link, or let automations message them automatically.' },
      { type: 'h2', text: 'Trials' },
      { type: 'p', text: 'Set a trial length in days — the subscription sits in TRIALING with a visible trial-end date, and the first invoice is generated the day the trial ends. Trial state transitions are logged so support can see exactly when billing started.' },
      { type: 'h2', text: 'Dunning and retries' },
      { type: 'p', text: 'When a cycle goes unpaid, the subscription enters PAST_DUE and the dunning engine takes over: configurable retries with backoff, per-subscription retry caps, and a CANCELLED transition when retries are exhausted. Customers are notified at every step through your configured channels.' },
      { type: 'h2', text: 'States' },
      { type: 'table', headers: ['State', 'Meaning'], rows: [
        ['TRIALING', 'Free trial running; first billing date scheduled.'],
        ['ACTIVE', 'Latest cycle paid; next billing date queued.'],
        ['PAST_DUE', 'Cycle unpaid; dunning retries in progress.'],
        ['CANCELLED', 'Ended — by customer, merchant, or failed dunning.'],
        ['COMPLETED', 'Reached the optional total-cycles limit.'],
      ] },
      { type: 'note', tone: 'warn', text: 'MFS wallets have no native mandate system — subscriptions are enforced by invoicing + dunning, not automatic card charges. Communicate this to customers at signup.' },
    ],
  },

  // ───────────────────────────── Developers ─────────────────────────────
  {
    slug: 'merchant-api',
    title: 'Merchant API',
    section: 'Developers',
    updated: '2026-07-10',
    intro: 'Create and verify payments programmatically — three endpoints, Bearer auth, PipraPay-compatible field names for painless migration.',
    blocks: [
      { type: 'h2', text: 'Authentication' },
      { type: 'p', text: 'Every call needs a store API key as a Bearer token. Master keys (sk_live_… / sk_sandbox_…) have full store access; scoped keys carry a subset of permissions — create_payment, verify_payment, refunds — and are the right choice for storefront backends.' },
      { type: 'code', lang: 'bash', code: `Authorization: Bearer sk_live_9f2K…   # never expose in browsers` },
      { type: 'h2', text: 'POST /api/v1/checkout' },
      { type: 'p', text: 'Creates a hosted payment and returns the URL to redirect the customer to. Amount is in BDT. Provide at least a customer name or mobile number.' },
      { type: 'code', lang: 'json', title: 'Request', code: `{
  "amount": 2500,
  "currency": "BDT",
  "title": "Order #8471 — Silk saree",
  "description": "Eid delivery within 3 days",
  "customer_name": "Rahim Uddin",
  "customer_email": "rahim@example.com",
  "customer_mobile": "+8801712345678",
  "redirect_url": "https://shop.bd/thanks",
  "cancel_url": "https://shop.bd/cart",
  "webhook_url": "https://shop.bd/hooks/invokeil",
  "metadata": { "order_id": "8471" }
}` },
      { type: 'code', lang: 'json', title: '201 Created', code: `{
  "payment_id": "ck_9f2Kx8…",
  "token": "9c4f7a2b…",
  "checkout_url": "/pay/9c4f7a2b…",
  "status": "PENDING",
  "amount": 2500,
  "currency": "BDT",
  "expires_at": "2026-07-11T12:00:00.000Z"
}` },
      { type: 'h2', text: 'GET /api/v1/checkout/{token}' },
      { type: 'p', text: 'Polls a checkout in store scope: status, amount, paid_at, trx_id and customer info. Poll at most once per second; prefer webhooks and use this as a fallback.' },
      { type: 'h2', text: 'POST /api/v1/verify-payment' },
      { type: 'p', text: 'Verifies a payment by token. Accepts { "token": "…" } or { "pp_id": "…" } — the latter is wire-compatible with PipraPay, so existing integrations migrate by changing the base URL and key.' },
      { type: 'code', lang: 'json', title: '200 OK (paid)', code: `{
  "payment_id": "ck_9f2Kx8…",
  "token": "9c4f7a2b…",
  "status": "PAID",
  "amount": 2500,
  "currency": "BDT",
  "paid_at": "2026-07-10T09:14:22.000Z",
  "trx_id": "9GX7K2LM",
  "customer": { "name": "Rahim Uddin", "phone": "+8801712345678" },
  "metadata": { "order_id": "8471" }
}` },
      { type: 'h2', text: 'Errors' },
      { type: 'table', headers: ['HTTP', 'code', 'When'], rows: [
        ['400', 'MISSING_FIELD', 'amount missing/non-positive, or no customer identifier'],
        ['400', 'INVALID_AMOUNT', 'amount above the 10,000,000 BDT ceiling'],
        ['400', 'DOMAIN_NOT_WHITELISTED', 'redirect/cancel/webhook host not allowed for the store'],
        ['403', 'CUSTOMER_SUSPENDED', 'payer is on the suspended list (with reason)'],
        ['401', 'INVALID_API_KEY', 'missing/unknown key, or scope not granted'],
        ['404', 'NOT_FOUND', 'unknown token in verify/get'],
      ] },
      { type: 'note', tone: 'info', text: 'Suspension is customer-level: a suspended phone number is blocked at checkout creation with the reason attached, protecting you from chargeback-prone payers.' },
    ],
  },
  {
    slug: 'webhooks',
    title: 'Webhooks',
    section: 'Developers',
    updated: '2026-07-10',
    intro: 'Signed, retried, inspectable event delivery to your endpoints — with a simulator and replay built into the developer console.',
    blocks: [
      { type: 'h2', text: 'Events' },
      { type: 'list', items: [
        'checkout.created — a hosted checkout was created.',
        'checkout.paid — SMS matched the payment; the money event most integrations care about.',
        'checkout.cancelled — customer or merchant cancelled.',
        'invoice.paid — an invoice (or invoice instalment) settled.',
        'payment_link.paid — a link payment succeeded.',
        'transaction.matched / transaction.reversed — ledger-level match and reversal events.',
        'device.online — a paired phone reconnected after being offline.',
        'test — sent by the “Send test” button and the webhook simulator.',
      ] },
      { type: 'h2', text: 'Envelope & payload' },
      { type: 'p', text: 'Every delivery is a JSON POST with the same envelope: event, sentAt and data. checkout.paid carries the full payment snapshot built by the platform.' },
      { type: 'code', lang: 'json', code: `{
  "event": "checkout.paid",
  "sentAt": "2026-07-10T09:14:22.318Z",
  "data": {
    "checkout_token": "9c4f7a2b…",
    "title": "Order #8471 — Silk saree",
    "amount": 2500,
    "currency": "BDT",
    "mfs": "BKASH",
    "status": "PAID",
    "paid_at": "2026-07-10T09:14:22.000Z",
    "trx_id": "9GX7K2LM",
    "customer": { "name": "Rahim Uddin", "phone": "+8801712345678" }
  }
}` },
      { type: 'h2', text: 'Headers' },
      { type: 'table', headers: ['Header', 'Value'], rows: [
        ['X-Invokeil-Event', 'Event name, e.g. checkout.paid'],
        ['X-Invokeil-Signature', 't=<unix-ms>,v1=<hex HMAC-SHA256>'],
        ['X-Invokeil-Delivery', 'Attempt counter starting at 1'],
      ] },
      { type: 'h2', text: 'Verifying signatures' },
      { type: 'p', text: 'Signatures are HMAC-SHA256 over the string "{timestamp}.{rawBody}" using the endpoint secret, exactly like Stripe-style schemes. Verify on every request and reject anything older than five minutes to stop replay.' },
      { type: 'code', lang: 'javascript', title: 'Node.js verification', code: `import { createHmac, timingSafeEqual } from 'node:crypto'

export function verifyInvokeilSignature(rawBody, header, secret) {
  const parts = Object.fromEntries(
    header.split(',').map((kv) => kv.split('='))
  ) // { t: '1752143662318', v1: 'a41c…' }
  const expected = createHmac('sha256', secret)
    .update(\`\${parts.t}.\${rawBody}\`)
    .digest('hex')
  const fresh = Date.now() - Number(parts.t) < 5 * 60 * 1000
  return fresh && timingSafeEqual(
    Buffer.from(expected), Buffer.from(parts.v1)
  )
}` },
      { type: 'note', tone: 'warn', text: 'Verify against the raw request body, not a re-serialised object — JSON key order changes break the signature.' },
      { type: 'h2', text: 'Retries' },
      { type: 'p', text: 'Any non-2xx response, timeout (8 s) or network error is retried up to 5 attempts with delays of 1 min, 5 min, 30 min and 2 h. Respond 2xx quickly and process asynchronously. Every attempt is stored as a WebhookDelivery row you can inspect and replay from Admin → Developers → Webhooks.' },
      { type: 'h2', text: 'Simulator & replay' },
      { type: 'p', text: 'The developer console can fire any event with a realistic sample payload (or your custom JSON) to one endpoint or every matching endpoint, and re-deliver any stored delivery with a fresh signature. Use it before going live — it exercises the exact production delivery path.' },
    ],
  },
  {
    slug: 'api-reference',
    title: 'API reference',
    section: 'Developers',
    updated: '2026-07-10',
    intro: 'Conventions shared by the whole v1 surface: auth, errors, rate limits, idempotency and versioning.',
    blocks: [
      { type: 'h2', text: 'Base URL & versioning' },
      { type: 'code', lang: 'bash', code: `https://pay.yourdomain.com/api/v1` },
      { type: 'p', text: 'Breaking changes ship under a new /vN prefix; additive fields may appear inside v1 responses at any time, so ignore unknown keys. Dates are ISO-8601 UTC; amounts are decimal BDT strings-safe floats.' },
      { type: 'h2', text: 'Authentication' },
      { type: 'list', items: [
        'Authorization: Bearer <key> on every request — keys are issued per store under Admin → Developers.',
        'Master keys: sk_live_… (production) and sk_sandbox_… (sandbox mode) — full scope.',
        'Scoped keys: restrict permissions and (optionally) a brand — ideal for storefront backends and agencies.',
        'Rotate keys from the dashboard; rotation keeps the old key valid for a grace window you set.',
      ] },
      { type: 'h2', text: 'Idempotency' },
      { type: 'p', text: 'Send an Idempotency-Key header (any string ≤ 255 chars) on POST /api/v1/checkout. Replays with the same key within 24 hours return the original response instead of creating a duplicate — the standard safety net for network retries.' },
      { type: 'code', lang: 'bash', code: `Idempotency-Key: order_8471` },
      { type: 'h2', text: 'Error format' },
      { type: 'p', text: 'Errors are always JSON with a stable code and a human message — safe to branch on.' },
      { type: 'code', lang: 'json', code: `{ "error": "'amount' must be a positive number", "code": "MISSING_FIELD" }` },
      { type: 'table', headers: ['HTTP', 'Meaning'], rows: [
        ['400', 'Invalid request — fix the field named in the message.'],
        ['401', 'Missing or invalid API key.'],
        ['403', 'Key lacks the scope, domain not whitelisted, or customer suspended.'],
        ['404', 'Unknown token/resource in your scope.'],
        ['429', 'Rate limited — back off per Retry-After.'],
        ['500', 'Server fault — safe to retry with the same idempotency key.'],
      ] },
      { type: 'h2', text: 'Rate limits' },
      { type: 'table', headers: ['Scope', 'Limit'], rows: [
        ['checkout creation', '60 requests / minute / key'],
        ['verification & polling', '120 requests / minute / key'],
        ['webhook deliveries (outbound)', '8 s timeout per attempt, 5 attempts max'],
      ] },
      { type: 'note', tone: 'info', text: 'Responses include X-RateLimit-Remaining. Hit the limit and you get 429 with Retry-After in seconds.' },
    ],
  },
  {
    slug: 'sdks',
    title: 'SDKs',
    section: 'Developers',
    updated: '2026-07-10',
    intro: 'Official client libraries for JavaScript/TypeScript, PHP, Python, Flutter and Go — thin wrappers that sign nothing you have to think about.',
    blocks: [
      { type: 'h2', text: 'JavaScript / TypeScript' },
      { type: 'code', lang: 'bash', code: `npm install @invokeil/pay` },
      { type: 'code', lang: 'javascript', code: `import { Invokeil } from '@invokeil/pay'

const invokeil = new Invokeil(process.env.INVOKEIL_KEY!, {
  baseUrl: 'https://pay.yourdomain.com',
})

const checkout = await invokeil.checkout.create({
  amount: 2500,
  title: 'Order #8471',
  customer_mobile: '+8801712345678',
  metadata: { order_id: '8471' },
})

// redirect the browser:
location.href = checkout.checkout_url` },
      { type: 'h2', text: 'PHP' },
      { type: 'code', lang: 'bash', code: `composer require invokeil/pay` },
      { type: 'code', lang: 'php', code: `use Invokeil\\Pay\\Client;

$invokeil = new Client(getenv('INVOKEIL_KEY'));

$checkout = $invokeil->createCheckout([
  'amount'         => 2500,
  'title'          => 'Order #8471',
  'customer_mobile'=> '+8801712345678',
]);

header('Location: ' . $checkout['checkout_url']);` },
      { type: 'h2', text: 'Python' },
      { type: 'code', lang: 'bash', code: `pip install invokeil-pay` },
      { type: 'code', lang: 'python', code: `from invokeil import Client

invokeil = Client(api_key=os.environ["INVOKEIL_KEY"])

checkout = invokeil.checkouts.create(
    amount=2500,
    title="Order #8471",
    customer_mobile="+8801712345678",
)

return redirect(checkout["checkout_url"])` },
      { type: 'h2', text: 'Flutter / Dart' },
      { type: 'code', lang: 'bash', code: `flutter pub add invokeil` },
      { type: 'code', lang: 'dart', code: `final invokeil = InvokeilClient(
  apiKey: const String.fromEnvironment('INVOKEIL_KEY'),
  baseUrl: 'https://pay.yourdomain.com',
);

final checkout = await invokeil.createCheckout(
  amount: 2500,
  title: 'Order #8471',
);

// open in an in-app browser:
await launchUrl(Uri.https('pay.yourdomain.com', checkout.checkoutUrl));` },
      { type: 'h2', text: 'Go' },
      { type: 'code', lang: 'bash', code: `go get github.com/invokeil/pay-go` },
      { type: 'code', lang: 'go', code: `client := invokeil.New(os.Getenv("INVOKEIL_KEY"), nil)

checkout, _, err := client.Checkouts.Create(context.Background(),
  &invokeil.CheckoutRequest{
    Amount:         2500,
    Title:          "Order #8471",
    CustomerMobile: "+8801712345678",
  })
if err != nil { log.Fatal(err) }

http.Redirect(w, r, checkout.CheckoutURL, http.StatusFound)` },
      { type: 'note', tone: 'info', text: 'All SDKs pin to /api/v1, raise typed errors with the API code attached, and expose verify() helpers that validate webhook signatures for you.' },
    ],
  },
  {
    slug: 'integrations',
    title: 'Integrations',
    section: 'Developers',
    updated: '2026-07-10',
    intro: 'Connect WooCommerce, Shopify, Zapier, Discord and Slack — mostly webhooks plus a little glue.',
    blocks: [
      { type: 'h2', text: 'WooCommerce / WordPress' },
      { type: 'list', ordered: true, items: [
        'Install any PipraPay-compatible gateway plugin (or the dedicated “Invokeil Pay for WooCommerce” bridge).',
        'API base URL: https://pay.yourdomain.com — credentials: a scoped key with create_payment + verify_payment.',
        'Redirect URL: the WooCommerce thank-you page; webhook URL: ?wc-api=invokeil endpoint the bridge registers.',
        'The verify-payment endpoint’s pp_id field means existing PipraPay plugins work unchanged.',
      ] },
      { type: 'h2', text: 'Shopify' },
      { type: 'p', text: 'Shopify requires a payment provider app for checkout integration. The pragmatic pattern most merchants use: mark orders “pending payment”, email the customer an Invokeil checkout link, and have checkout.paid call the Shopify Admin API to mark the order paid. Keep the order ID in checkout metadata for the join.' },
      { type: 'h2', text: 'Zapier / Make' },
      { type: 'p', text: 'Create a “Catch Hook” zap, paste its URL as a webhook endpoint filtered to checkout.paid and invoice.paid, then map data.trx_id and data.amount into sheets, CRMs or email tools. The simulator in the developer console sends sample payloads so you can build the zap without real money.' },
      { type: 'h2', text: 'Discord' },
      { type: 'p', text: 'Add a Discord channel webhook URL as an Invokeil endpoint. A tiny relay (or the built-in template in the marketplace) turns checkout.paid into an embed: amount, TrxID, customer and a link back to the transaction in your panel.' },
      { type: 'code', lang: 'json', title: 'Minimal Discord relay payload', code: `{
  "embeds": [{
    "title": "Payment received — ৳2,500",
    "description": "Order #8471 paid via bKash (TrxID 9GX7K2LM)",
    "color": 2495554
  }]
}` },
      { type: 'h2', text: 'Slack' },
      { type: 'p', text: 'Same pattern as Discord: Slack incoming-webhook URL + a relay, or use the marketplace app that formats events into Block Kit messages with ✅/⚠️ status colouring by gateway and amount thresholds.' },
      { type: 'note', tone: 'info', text: 'Integrations run from your infrastructure — Invokeil never needs credentials to your store, only your endpoints need the webhook secret.' },
    ],
  },
  {
    slug: 'cli',
    title: 'CLI',
    section: 'Developers',
    updated: '2026-07-10',
    intro: 'The invokeil CLI streams live SMS-verification events, triggers sandbox scenarios and replays webhooks from your terminal.',
    blocks: [
      { type: 'h2', text: 'Install' },
      { type: 'code', lang: 'bash', code: `npx invokeil --help        # one-off
npm install -g invokeil    # global` },
      { type: 'h2', text: 'invokeil listen' },
      { type: 'p', text: 'Streams device events (SMS received, transaction matched, device online) to your terminal in real time — the fastest way to debug pairing and matching.' },
      { type: 'code', lang: 'bash', code: `npx invokeil listen \\
  --base https://pay.yourdomain.com \\
  --key sk_live_9f2…

# 09:14:21  sms     bKash ← +8801712345678  "You have received Tk 2500…"
# 09:14:21  match   checkout 9c4f7a2b → PAID (trx 9GX7K2LM)
# 09:14:22  webhook checkout.paid → 200 OK (attempt 1)` },
      { type: 'h2', text: 'invokeil trigger' },
      { type: 'p', text: 'Runs a sandbox scenario against your instance — success, failure, timeout, refund, chargeback or insufficient — and prints the generated checkout token and TrxID. Requires sandbox mode.' },
      { type: 'code', lang: 'bash', code: `npx invokeil trigger refund --amount 500 --gateway bkash` },
      { type: 'h2', text: 'invokeil replay' },
      { type: 'p', text: 'Replays a stored webhook delivery with a freshly signed header — identical to pressing Replay in the developer console.' },
      { type: 'code', lang: 'bash', code: `npx invokeil replay wd_7Kx2mQ      # by delivery id
npx invokeil replay --event checkout.paid --last 5` },
      { type: 'note', tone: 'warn', text: 'The CLI reads INVOKEIL_KEY and INVOKEIL_BASE from the environment. Never commit keys; scoped keys with read-only scopes are enough for listen.' },
    ],
  },
  {
    slug: 'sandbox-testing',
    title: 'Sandbox testing',
    section: 'Developers',
    updated: '2026-07-10',
    intro: 'Test the entire pipeline — webhooks, automations, risk, notifications — with fake money before your first real payment.',
    blocks: [
      { type: 'h2', text: 'Turn sandbox on' },
      { type: 'p', text: 'Admin → Settings → App mode → SANDBOX. A permanent amber ribbon appears in the panel, checkout pages show a SANDBOX watermark, and sk_sandbox_… keys are issued. Nothing touches real wallets; the simulator drives the same code paths production does.' },
      { type: 'h2', text: 'Scenarios' },
      { type: 'table', headers: ['Scenario', 'What it exercises'], rows: [
        ['success', 'Happy path: checkout created → paid → webhook + notifications fire.'],
        ['failure', 'Gateway declines; failure notification path and retry-safe state.'],
        ['timeout', 'Customer never completes; checkout expires and cleans up.'],
        ['refund', 'Payment succeeds, then a full refund is processed and notified.'],
        ['chargeback', 'Payment succeeds, then a dispute opens with a deadline.'],
        ['insufficient', 'Customer sends less than required; tolerance check triggers.'],
      ] },
      { type: 'h2', text: 'Run a scenario' },
      { type: 'list', ordered: true, items: [
        'Admin → Developers → Sandbox, pick a scenario, gateway and amount.',
        'Run — the console prints each pipeline step as it happens (checkout → match → webhook → automations).',
        'Inspect the generated transaction, deliveries and automation runs exactly as you would production rows.',
        'Clean up with one click when you are done — sandbox rows are tagged and removable.',
      ] },
      { type: 'code', lang: 'bash', title: 'Same thing from the CLI', code: `npx invokeil trigger chargeback --amount 1200 --gateway nagad` },
      { type: 'h2', text: 'Test credentials' },
      { type: 'list', items: [
        'Keys: sk_sandbox_… — created under Developers while sandbox mode is on.',
        'Customers: any name; phones must be syntactically valid (+8801XXXXXXXXX) and are auto-tagged @sandbox.',
        'Webhooks: point at webhook.site or your local tunnel (ngrok) and watch signatures verify.',
      ] },
      { type: 'note', tone: 'warn', text: 'Sandbox does not send real SMS or emails — notification rows are created with a SIMULATED flag so you can inspect what would have been sent.' },
    ],
  },
]

export function getArticle(slug: string): DocArticle | undefined {
  return ARTICLES.find((a) => a.slug === slug)
}

export function getAdjacent(slug: string): { prev?: DocArticle; next?: DocArticle } {
  const i = ARTICLES.findIndex((a) => a.slug === slug)
  return { prev: i > 0 ? ARTICLES[i - 1] : undefined, next: i >= 0 && i < ARTICLES.length - 1 ? ARTICLES[i + 1] : undefined }
}
