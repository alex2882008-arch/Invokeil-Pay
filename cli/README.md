# Invokeil Pay CLI

Zero-dependency developer CLI for **Invokeil Pay** (`cli/invokeil.js`).
Uses only Node's standard library (`node:http` / `node:https`) — Node 16+.

## Install

```bash
cp cli/invokeil.js ./invokeil.js        # or: ln -s cli/invokeil.js /usr/local/bin/invokeil
node invokeil.js --help
```

## Environment

| Variable | Used by | Purpose |
|---|---|---|
| `INVOKEIL_BASE_URL` | `api`, `trigger`, `replay` | Default `--base` (default `http://localhost:3000`) |
| `INVOKEIL_API_KEY` | `api`, `trigger`, `replay` | Default `--key` |
| `INVOKEIL_COOKIE` | `api`, `trigger`, `replay` | Session cookie for `/api/admin/*` endpoints |
| `INVOKEIL_TARGET` | `listen` | Forward target base URL |
| `INVOKEIL_SECRET` | `listen` | Webhook secret — enables signature verification |

## Commands

### `listen <localPort>` — webhook listener

Starts a local HTTP server that **prints every incoming webhook** (event,
signature, pretty body, validity check) and **forwards it** to
`INVOKEIL_TARGET` so your real endpoint still receives the payload:

```bash
INVOKEIL_TARGET=https://pay.example.com \
INVOKEIL_SECRET=whsec_xxx \
invokeil listen 9876
```

Point the store's webhook URL at `http://<your-ip>:9876` while developing.
The listener answers the sender with the exact status/body the target returned,
so retries behave realistically.

### `api <METHOD> <path>` — call any endpoint

```bash
invokeil api GET /api/v1/checkout/cabc123 --key sk_live_xxx --base https://pay.example.com

invokeil api POST /api/v1/checkout --key sk_live_xxx \
  --data '{"amount":500,"customer_name":"Rahim Uddin","customer_mobile":"01712345678"}'
```

Merchant API v1 endpoints authenticate with `sk_` API keys (`--key`).
Admin endpoints (`/api/admin/*`) use session auth — copy the `ilp_session`
cookie from your logged-in browser and pass `--cookie "ilp_session=…"`.

### `trigger <event>` — webhook simulator

Builds a realistic sample payload and dispatches it through the real pipeline
(same as the Developer Console's simulator):

```bash
invokeil trigger checkout.paid --cookie "ilp_session=…"
invokeil trigger test --data '{"hello":"custom"}'
```

Events: `checkout.paid`, `checkout.created`, `checkout.cancelled`,
`invoice.paid`, `payment_link.paid`, `transaction.matched`,
`transaction.reversed`, `device.online`, `test`.

### `replay <deliveryId>` — webhook replay

Re-POSTs a stored delivery with a fresh signature:

```bash
invokeil replay clx1234567890abcdef --cookie "ilp_session=…"
```

## Response handling

Responses are pretty-printed JSON; exit code is `0` for 2xx/3xx and `1`
otherwise — handy in scripts:

```bash
invokeil api POST /api/v1/verify-payment --key sk_live_xxx --data '{"pp_id":"tok_1"}' --quiet
```

## License

Invokeil Pay Community License 1.0 — see the repo root `LICENSE`.
