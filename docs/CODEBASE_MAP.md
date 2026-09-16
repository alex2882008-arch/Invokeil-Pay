# Invokeil Pay — Codebase Map

A short guided tour. Paths are relative to the repo root.

## Top level

```
prisma/schema.prisma      # all models (Device, Transaction, OutgoingPayment, Email/Sms providers, …)
db/                       # SQLite database files (git-ignored)
src/                      # Next.js 16 app (App Router)
android/                  # companion Android app (Kotlin, viewBinding, minSdk 29)
sdks/                     # official merchant-API SDKs (js, node, php, python, flutter, go, dotnet)
cli/                      # zero-dep developer CLI (webhook listener, API caller, trigger, replay)
examples/                 # socket.io / integration demos
docs/                     # this map and developer docs
scripts/                  # repo tooling (git-ignored) e.g. check-android.py
.github/workflows/        # CI (web) and Android Build (APK artifact / release)
```

## `src/app` — routes

### Admin panel (`src/app/admin/*` → `src/components/panel/*-view.tsx`)
One folder + one view per module. Highlights:

| Route | View | Purpose |
|---|---|---|
| `/admin` (dashboard) | `dashboard-view.tsx` | Live stats |
| `/admin/transactions` | `transactions-view.tsx`, `transaction-detail.tsx` | Payments, CSV export |
| `/admin/checkouts` | `checkouts-view.tsx` | Hosted checkout pages |
| `/admin/links` | `links-view.tsx` | Payment links |
| `/admin/invoices` | `invoices-view.tsx` | Invoicing |
| `/admin/gateways` | `gateways-view.tsx` | 56-gateway catalog, charges, `gateway-logo.tsx` |
| `/admin/devices` | `devices-view.tsx` | Phone pairing, balances, QR |
| `/admin/email` | `email-view.tsx` | Email automation + 320-template catalog |
| `/admin/sms-gateway` | `sms-gateway-view.tsx` | Twilio/Telnyx/Plivo/textbee/SNS |
| `/admin/sms` | `sms-view.tsx`, `sms-inbox-view.tsx` | Sent SMS + raw inbox |
| `/admin/refunds`, `/admin/approvals` | `refunds-view.tsx`, `approvals-view.tsx` | Refund + approval flows |
| `/admin/risk` | `risk-view.tsx` | Risk rules + cases |
| `/admin/settlements`, `/admin/accounting` | `settlements-view.tsx`, `accounting-view.tsx` | Reconciliation, accounting |
| `/admin/subscriptions` | `subscriptions-view.tsx` | Recurring billing |
| `/admin/customers` | `customers-view.tsx`, `customer-360-view.tsx` | CRM + Customer-360 |
| `/admin/brands` | `brands-view.tsx` | White-label brands |
| `/admin/developers` | `developers-console-view.tsx` | API explorer, webhook simulator/replay, sandbox, snippets |
| `/admin/operations`, `/admin/incidents` | `operations-view.tsx`, `incidents-view.tsx` | Ops console, status page |
| `/admin/imports`, `/admin/marketplace`, `/admin/kyc`, `/admin/users`, `/admin/security-center`, `/admin/settings`, `/admin/wizard` | … | Platform utilities |

Shared UI primitives: `ui-bits.tsx` (PageHeader, StatCard, EmptyState, ErrorCard, CopyButton…),
`admin-shell.tsx` (nav), `command-palette.tsx` (Ctrl+K).

### Public / merchant-facing
```
src/app/pay/[token]        # hosted checkout (checkout-public*.tsx)
src/app/link               # payment links
src/app/invoice            # public invoices
src/app/login              # panel login (login-client.tsx)
src/app/(public), (site)   # marketing / status pages
```

## `src/app/api`

- `api/v1/*` — **device & merchant APIs**:
  - `checkout`, `checkout/[token]`, `verify-payment` — Merchant API v1 (Bearer `sk_…`)
  - `sms` — device SMS ingest (`X-Device-Key`), `heartbeat` — device telemetry
  - `device/commands` — outgoing-payment queue (GET claim / POST result)
  - `device/notifications` — merged recent activity feed (payments + email + SMS)
  - `device/config` — device-scoped settings (brandName, gateways, appMode)
- `api/admin/*` — panel APIs (session + `requireRole`, one folder per module,
  `api/admin/dev/*` = Developer Console: console, webhook-simulate,
  webhook-replay, explorer, scenarios, snippets, requests)
- `api/auth/*`, `api/verify/[ref]`, `api/link/*`, `api/pay/*`, `api/public/*`

## `src/lib` — core services

| File | Role |
|---|---|
| `db.ts` | Prisma client singleton |
| `auth.ts` | `requireRole`, session/JWT, API-key auth, `jsonError`, activity log |
| `webhook.ts` | Signed webhook dispatch + retry queue + payload builders (HMAC `t=,v1=` scheme) |
| `event-ledger.ts` | Idempotent event ledger (dedupe, timeline) |
| `matcher.ts` | SMS → transaction matching pipeline |
| `automation-engine.ts` | Trigger/condition/action automations + waits |
| `risk-engine.ts` | Velocity/amount/list/hour rules |
| `providers/email`, `providers/sms`, `providers/vault` | Outbound channels; encrypted provider configs |
| `email-catalog.ts` | 320-template email catalog |
| `notifier.ts` | Unified notify() across channels |
| `sandbox.ts` | Sandbox scenario runner |
| `gateways.ts`, `charges.ts`, `format.ts`, `interval.ts` | Catalog & domain helpers |
| `settings-defaults.ts` | Merged settings (appMode, thresholds, failover chains) |
| `i18n/` + `i18n.tsx` | EN/বাংলা dictionaries (module files export `*_EN` / `*_BN`) |

## `android/` — companion app

```
app/src/main/java/com/invokeil/pay/
  MainActivity.kt            # 5-tab bottom nav (Dashboard/Log/Notifications/Outgoing/Settings)
  DashboardFragment.kt       # status, stats, SANDBOX badge, summary cards
  NotificationsFragment.kt   # /api/v1/device/notifications feed (kind icons, chips)
  OutgoingFragment.kt        # /api/v1/device/commands queue with Confirm/Failed actions
  ApiClient.kt               # OkHttp client (X-Device-Key auth) — all panel contracts
  ListenerService.kt, SmsReceiver.kt, SmsGate.kt, OutboxWorker.kt, HeartbeatWorker.kt
  Prefs.kt, SmsLogStore.kt, Notifier.kt, PinGateActivity.kt, OnboardingActivity.kt
res/
  values/strings.xml + values-bn/strings.xml   # EN/BN parity (checked by scripts/check-android.py)
  menu/bottom_nav.xml, layout/*, drawable/*
```

## CI

- `.github/workflows/ci.yml` — install, `prisma generate`, `tsc --noEmit`, eslint
- `.github/workflows/android.yml` — `assembleDebug` APK artifact (+ release APK on `v*` tags)
