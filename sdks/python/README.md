# Invokeil Pay — Python SDK

Official Python SDK for the **Invokeil Pay Merchant API v1**, built on
[`requests`](https://pypi.org/project/requests/). Python 3.8+.

## Install

```bash
pip install requests            # the only dependency
cp -r sdks/python/invokeil_pay ./invokeil_pay
```

## Usage

```python
from invokeil_pay import InvokeilPay, InvokeilError

invokeil = InvokeilPay("https://pay.example.com", "sk_live_xxx")

# Create a hosted checkout
checkout = invokeil.create_checkout({
    "amount": 500,
    "customer_name": "Rahim Uddin",
    "customer_mobile": "01712345678",
    "redirect_url": "https://myshop.com/thanks",
    "metadata": {"order_id": "INV-1042"},
})
print(checkout["payment_url"])  # redirect the customer here

# Verify later (PipraPay-compatible pp_id)
result = invokeil.verify_payment(checkout["checkout_token"])

# Fetch by token
detail = invokeil.get_checkout(checkout["checkout_token"])
```

## Webhook verification (Flask example)

```python
from flask import request

@app.post("/webhook")
def webhook():
    raw = request.get_data()  # raw bytes — do NOT re-serialize
    if not invokeil.verify_webhook_signature(
        raw, request.headers.get("X-Invokeil-Signature", ""), WEBHOOK_SECRET
    ):
        return "bad signature", 400
    payload = request.get_json()
    # handle payload["event"]: checkout.paid, invoice.paid, ...
    return {"ok": True}
```

Scheme: `X-Invokeil-Signature: t=<ms-epoch>,v1=hex(hmac_sha256(secret, "<t>.<raw_body>"))`
with a 5-minute replay window (verified with `hmac.compare_digest`).

## API surface

| Method | Description |
|---|---|
| `InvokeilPay(base_url, api_key, timeout=30)` | Create a client |
| `create_checkout(payment)` | `POST /api/v1/checkout` |
| `create_payment(payment)` | Alias (PipraPay compat) |
| `verify_payment(pp_id)` | `POST /api/v1/verify-payment` |
| `get_checkout(token)` | `GET /api/v1/checkout/{token}` |
| `verify_webhook_signature(raw_body, header, secret)` | HMAC verify (bool) |

Errors raise `InvokeilError` with `.status` and `.data` attributes.

## License

Invokeil Pay Community License 1.0 — see the repo root `LICENSE`.
