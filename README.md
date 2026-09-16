<div align="center">

<img src="public/logo.svg" alt="Invokeil Pay" width="120" />

# Invokeil Pay

**Self-hosted payment automation for Bangladesh.**

[![CI](https://github.com/invokeil/pay/actions/workflows/ci.yml/badge.svg)](https://github.com/invokeil/pay/actions/workflows/ci.yml)
[![Android Build](https://github.com/invokeil/pay/actions/workflows/android.yml/badge.svg)](https://github.com/invokeil/pay/actions/workflows/android.yml)
[![License](https://img.shields.io/badge/license-Community%201.0-blueviolet)](LICENSE)
[![Platforms](https://img.shields.io/badge/platform-Web%20·%20Android%20·%20API-16A34A)](#)

A PipraPay-parity, SMS-verification payment gateway panel: pair an Android
phone, receive bKash / Nagad / Rocket / Upay payment SMS in real time, match
them to checkouts, invoices and links, and manage everything from a modern
admin panel — fully self-hosted.

</div>

---

## ✨ Features (v3 — 25+ modules)

| Area | Modules |
|---|---|
| **Payments core** | Dashboard & live stats, Transactions (+ detail, CSV), Checkouts (hosted pages), Payment links, Invoices (+ public view & reminders) |
| **Gateways** | 66-gateway catalog with full PipraPay parity — every MFS tier (Personal/Agent/Merchant) keeps its own flow: bKash/Nagad/Rocket/Upay/Tap/TeleCash/mCash/OK Wallet/iPay/PathaoPay/CellFin + banks, PSPs, crypto; per-gateway charges, real brand-wordmark logos, EN+BN step-by-step payment instructions |
| **Automation** | Device/SMS verification pipeline, Email automation (320-template catalog, provider failover), SMS gateway (Twilio/Telnyx/Plivo/textbee/AWS SNS), Message templates per brand |
| **Operations** | Refunds & approvals, Disputes, Settlements & accounting, Risk engine (velocity / amount / list / hour rules), KYC profiles |
| **Growth** | Subscriptions & recurring billing, Customers + Customer-360, Brands (white-label), Notification preferences, Marketplace apps |
| **Platform** | Devices & device balances, Webhooks (signed, retry queue, replay), Developer Console (API explorer, webhook simulator, sandbox scenarios, snippets), User management & RBAC, 2FA, audit log, imports, incidents/status page, feature flags |
| **UX** | URL-state deep routing, dark mode, English + বাংলা, command palette, mobile bottom nav, QR device pairing, sandbox mode |

<!-- SCREENSHOTS: drop PNGs in docs/screenshots/ and uncomment
| Dashboard | Transactions | Developer Console |
|---|---|---|
| ![dashboard](docs/screenshots/dashboard.png) | ![transactions](docs/screenshots/transactions.png) | ![devconsole](docs/screenshots/devconsole.png) |
| Mobile checkout | Android app | Notifications feed |
|---|---|---|
| ![checkout](docs/screenshots/checkout.png) | ![android](docs/screenshots/android.png) | ![notifications](docs/screenshots/notifications.png) |
-->

## 🚀 Quickstart

```bash
# 1. Install dependencies (bun recommended; npm works too)
bun install

# 2. Configure
cp .env.example .env   # if present, or create .env with DATABASE_URL="file:./db/dev.db"

# 3. Create the database schema
bunx prisma db push

# 4. Seed the demo dataset (66 gateways, devices, checkouts, invoices, …)
bun run db:seed

# 5. Run
bun run dev            # http://localhost:3000
```

Default login after seeding: `admin` / `admin1234` (**change it immediately**).
The instance boots in **SANDBOX** mode — all outbound provider calls are
simulated until you switch to PRODUCTION in Settings.

## 🔌 Merchant API (v1)

Create a store in **Admin → Merchants**, copy the `sk_…` key, then:

```bash
curl https://your-panel.com/api/v1/checkout \
  -H "Authorization: Bearer sk_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 500,
    "customer_name": "Rahim Uddin",
    "customer_mobile": "01712345678",
    "redirect_url": "https://myshop.com/thanks",
    "metadata": { "order_id": "INV-1042" }
  }'
# → { "checkout_token": "…", "payment_url": "https://your-panel.com/pay/…" }
```

Verify a payment (PipraPay-compatible): `POST /api/v1/verify-payment`
with `{ "pp_id": "<checkout_token>" }`, or `GET /api/v1/checkout/{token}`.
Official SDKs for every major platform — see the table below.

## 📡 Webhooks

Every store can register signed webhook endpoints. Deliveries are signed with
`X-Invokeil-Signature: t=<ms-epoch>,v1=hex(hmac_sha256(secret, "<t>.<rawBody>"))`
(fresh signature on every retry, 5-minute replay window). Events:
`checkout.paid`, `checkout.created`, `checkout.cancelled`, `invoice.paid`,
`payment_link.paid`, `transaction.matched`, `transaction.reversed`,
`device.online`, `test`. Failed deliveries retry automatically
(1m → 5m → 30m → 2h), and can be replayed manually from the Developer Console.

Debug locally with the CLI listener:

```bash
INVOKEIL_TARGET=https://your-panel.com INVOKEIL_SECRET=whsec_xxx node cli/invokeil.js listen 9876
```

## 📱 Android app (companion device)

The Android app (`android/`) pairs with your panel via QR code / device key,
forwards payment SMS in real time (whitelist-only, OTP-filtered locally —
see `android/PROMINENT_DISCLOSURE.md`), sends heartbeats, and now (v3) shows
the notifications feed and the outgoing-payments queue on the phone.

Build it two ways:

- **Locally:** `gradle -p android assembleDebug` (Android Studio works too).
- **GitHub Actions:** push a change under `android/**` — the **Android Build**
  workflow produces an `app-debug.apk` artifact on every run and attaches a
  release APK to `v*` tags.

## 🧰 SDKs & CLI

| Package | Path | Notes |
|---|---|---|
| JavaScript | [`sdks/js`](sdks/js) | Single file, ESM + CJS + browser, zero deps |
| Node.js | [`sdks/node`](sdks/node) | Re-export of the JS SDK |
| PHP | [`sdks/php`](sdks/php) | curl-only class + Laravel service provider & config |
| Python | [`sdks/python`](sdks/python) | `requests`-based client |
| Flutter / Dart | [`sdks/flutter`](sdks/flutter) | `package:http` client |
| Go | [`sdks/go`](sdks/go) | Std-lib only, single file |
| .NET / C# | [`sdks/dotnet`](sdks/dotnet) | `HttpClient` + `System.Text.Json` |
| CLI | [`cli`](cli) | Webhook listener, API caller, event trigger, replay — std-lib only |

## 🏪 Sandbox

Settings → **App mode: SANDBOX** simulates every outbound integration (email,
SMS, webhooks, gateways) so you can try the full pipeline without touching a
real taka. The Developer Console adds one-click sandbox scenarios that drive
the real checkout → SMS → match → webhook pipeline. The Android app shows a
SANDBOX badge when its panel is in sandbox mode.

## 🤝 Contributing

PRs welcome — read [`CONTRIBUTING.md`](CONTRIBUTING.md) first (conventional
commits, PR checklist, no secrets). Security issues go to
[`SECURITY.md`](SECURITY.md) → security@invokeil.com.

## 📚 Docs

- [`docs/CODEBASE_MAP.md`](docs/CODEBASE_MAP.md) — guided tour of the codebase
- `PROMINENT_DISCLOSURE.md` — SMS handling disclosure for the Android app

## 📄 License

Invokeil Pay Community License 1.0 — free for individuals, education,
non-profits and businesses under 50 employees / USD 250k revenue.
Modification, derivative works, enterprise use, OEM and SaaS hosting need
written permission or an Enterprise License (sales@invokeil.com).
See [`LICENSE`](LICENSE).

## ⚠️ Disclaimer

Invokeil Pay is an independent, self-hosted automation tool. It is **not
affiliated with, endorsed by, or connected to bKash, Nagad, Rocket, Upay,
CellFin, TeleCash, PathaoPay or any other mobile financial service provider**.
All trademarks belong to their respective owners. Nothing in this repository
constitutes legal, financial, or compliance advice — verify your obligations
under Bangladesh Bank and applicable regulations yourself.
