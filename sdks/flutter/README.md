# Invokeil Pay — Flutter / Dart SDK

Official Dart SDK for the **Invokeil Pay Merchant API v1**, built on
[`package:http`](https://pub.dev/packages/http). Dart 3 / Flutter 3+.

## Install

```yaml
# pubspec.yaml
dependencies:
  http: ^1.2.0
  crypto: ^3.0.3
```

```bash
cp sdks/flutter/lib/invokeil_pay.dart lib/invokeil_pay.dart
```

## Usage

```dart
import 'invokeil_pay.dart';

final invokeil = InvokeilPay(
  baseUrl: 'https://pay.example.com',
  apiKey: 'sk_live_xxx',
);

// Create a hosted checkout
final checkout = await invokeil.createCheckout({
  'amount': 500,
  'customer_name': 'Rahim Uddin',
  'customer_mobile': '01712345678',
  'redirect_url': 'https://myshop.com/thanks',
});
final url = checkout['payment_url'] as String; // open in webview / browser

// Verify later (PipraPay-compatible pp_id)
final result = await invokeil.verifyPayment(checkout['checkout_token'] as String);

// Fetch by token
final detail = await invokeil.getCheckout(token);
```

## Webhook verification

For server-side Dart (shelf / dart_frog):

```dart
final ok = invokeil.verifyWebhookSignature(rawBody, sigHeader, webhookSecret);
if (!ok) { /* respond 400 */ }
```

Scheme: `X-Invokeil-Signature: t=<ms-epoch>,v1=hex(hmac_sha256(secret, "<t>.<rawBody>"))`
with a 5-minute replay window.

## API surface

| Member | Description |
|---|---|
| `InvokeilPay(baseUrl:, apiKey:, timeout:, client:)` | Create a client |
| `createCheckout(payment)` | `POST /api/v1/checkout` |
| `createPayment(payment)` | Alias (PipraPay compat) |
| `verifyPayment(ppId)` | `POST /api/v1/verify-payment` |
| `getCheckout(token)` | `GET /api/v1/checkout/{token}` |
| `verifyWebhookSignature(rawBody, header, secret)` | HMAC verify (bool) |

Errors throw `InvokeilError` with `.status` and `.data`.

## License

Invokeil Pay Community License 1.0 — see the repo root `LICENSE`.
