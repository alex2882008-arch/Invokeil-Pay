# Invokeil Pay — Node.js SDK

Node.js entry point that re-exports the shared zero-dependency SDK
(see [`../js`](../js)). Same file, same API — just a friendlier require path
for Node projects.

```js
const InvokeilPay = require('./invokeil.js');
// or: import InvokeilPay from './invokeil.js';

const invokeil = new InvokeilPay({ baseUrl: 'https://pay.example.com', apiKey: 'sk_live_xxx' });
const checkout = await invokeil.createCheckout({ amount: 250, customer_mobile: '01712345678' });
await invokeil.verifyPayment(checkout.checkout_token);
invokeil.verifyWebhookSignature(rawBody, sigHeader, webhookSecret); // → boolean
```

Full documentation: [`../js/README.md`](../js/README.md).

Node ≥ 18 required (global `fetch`).

## License

Invokeil Pay Community License 1.0 — see the repo root `LICENSE`.
