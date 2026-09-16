# Invokeil Pay — PHP SDK

Official PHP SDK for the **Invokeil Pay Merchant API v1**. Single class, no
dependencies, uses curl only. PHP 7.2+.

## Install

Copy `src/InvokeilPay.php` into your project (or add the folder to your
composer classmap):

```bash
cp sdks/php/src/InvokeilPay.php app/Services/InvokeilPay.php
```

## Usage

```php
require_once __DIR__ . '/InvokeilPay.php';

$invokeil = new InvokeilPay('https://pay.example.com', 'sk_live_xxx');

// Create a hosted checkout
$checkout = $invokeil->createCheckout([
    'amount'          => 500,
    'customer_name'   => 'Rahim Uddin',
    'customer_mobile' => '01712345678',
    'redirect_url'    => 'https://myshop.com/thanks',
    'metadata'        => ['order_id' => 'INV-1042'],
]);
header('Location: ' . $checkout['payment_url']);

// Verify later (PipraPay-compatible pp_id)
$result = $invokeil->verifyPayment($checkout['checkout_token']);

// Fetch by token
$detail = $invokeil->getCheckout($checkout['checkout_token']);
```

## Webhook verification

```php
$raw = file_get_contents('php://input');
if (!$invokeil->verifyWebhookSignature($raw, $_SERVER['HTTP_X_INVOKEIL_SIGNATURE'] ?? '', $secret)) {
    http_response_code(400);
    exit('bad signature');
}
$payload = json_decode($raw, true);
// handle $payload['event']: checkout.paid, invoice.paid, ...
```

Scheme: `X-Invokeil-Signature: t=<ms-epoch>,v1=hex(hmac_sha256(secret, "<t>.<rawBody>"))`
with a 5-minute replay window (verified with `hash_equals`).

## Laravel

Copy the three files:

```bash
cp sdks/php/src/InvokeilPay.php                  app/Services/
cp sdks/php/laravel/InvokeilPayServiceProvider.php app/Providers/
cp sdks/php/laravel/config/invokeil-pay.php      config/
```

Register `App\Providers\InvokeilPayServiceProvider` in `bootstrap/providers.php`
(Laravel 11+) or `config/app.php` (older), then use the container binding:

```php
$checkout = invokeil()->createCheckout(['amount' => 250, 'customer_mobile' => '01712345678']);
// or: app(InvokeilPay::class)->createCheckout([...]);
```

## API surface

| Method | Description |
|---|---|
| `new InvokeilPay($baseUrl, $apiKey, $timeout = 30)` | Create a client |
| `createCheckout(array $payment)` | `POST /api/v1/checkout` |
| `createPayment(array $payment)` | Alias (PipraPay compat) |
| `verifyPayment($ppId)` | `POST /api/v1/verify-payment` |
| `getCheckout($token)` | `GET /api/v1/checkout/{token}` |
| `verifyWebhookSignature($rawBody, $header, $secret)` | HMAC verify (bool) |

## License

Invokeil Pay Community License 1.0 — see the repo root `LICENSE`.
