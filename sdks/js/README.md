# Invokeil Pay — JavaScript SDK

Official zero-dependency JavaScript SDK for the **Invokeil Pay Merchant API v1**.
A single file (`invokeil.js`) that works in **CommonJS, ESM and browsers**.

Requires a runtime with global `fetch` (Node ≥ 18, Bun, Deno, all modern browsers).

## Install

No package manager needed — copy `invokeil.js` into your project:

```bash
cp sdks/js/invokeil.js ./lib/invokeil.js
# Node.js convenience wrapper: sdks/node/invokeil.js (same API, re-exports the file above)
```

## Usage

```js
const InvokeilPay = require('./invokeil.js');           // CommonJS
// import InvokeilPay from './invokeil.js';              // ESM

const invokeil = new InvokeilPay({
  baseUrl: 'https://pay.example.com', // your self-hosted instance
  apiKey: 'sk_live_xxxxxxxx',         // Store → API keys
});

// 1. Create a hosted checkout
const checkout = await invokeil.createCheckout({
  amount: 500,
  customer_name: 'Rahim Uddin',
  customer_mobile: '01712345678',
  redirect_url: 'https://myshop.com/thanks',
  metadata: { order_id: 'INV-1042' },
});
console.log(checkout.payment_url); // redirect the customer here

// 2. Or verify later by checkout id (PipraPay-style pp_id)
const result = await invokeil.verifyPayment(checkout.checkout_token);

// 3. Fetch a checkout by token
const detail = await invokeil.getCheckout(checkout.checkout_token);
```

## Webhook verification

Invokeil signs every webhook with the header `X-Invokeil-Signature: t=<ms-epoch>,v1=<hmac>`
where `v1 = HMAC-SHA256(secret, "<t>.<rawBody>")`, plus a 5-minute replay window.
**Pass the raw body — do not re-serialize parsed JSON.**

```js
// Express example
app.post('/webhook', express.raw({ type: '*/*' }), (req, res) => {
  const ok = invokeil.verifyWebhookSignature(
    req.body.toString('utf8'),
    req.header('X-Invokeil-Signature'),
    process.env.INVOKEIL_WEBHOOK_SECRET,
  );
  if (!ok) return res.status(400).send('bad signature');
  const payload = JSON.parse(req.body.toString('utf8'));
  // handle payload.event: checkout.paid, invoice.paid, ...
  res.json({ ok: true });
});
```

## API surface

| Method | Description |
|---|---|
| `new InvokeilPay({ baseUrl, apiKey, timeoutMs?, fetch? })` | Create a client |
| `createCheckout(payment)` | `POST /api/v1/checkout` |
| `createPayment(payment)` | Alias of `createCheckout` (PipraPay compat) |
| `verifyPayment(ppId)` | `POST /api/v1/verify-payment` |
| `getCheckout(token)` | `GET /api/v1/checkout/{token}` |
| `verifyWebhookSignature(rawBody, header, secret, toleranceMs?)` | HMAC verify (returns boolean) |

## License

Invokeil Pay Community License 1.0 — see the repo root `LICENSE`.
