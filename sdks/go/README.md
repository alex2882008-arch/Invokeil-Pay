# Invokeil Pay — Go SDK

Official Go SDK for the **Invokeil Pay Merchant API v1**. Single file,
standard library only (no external modules). Go 1.20+.

## Install

Copy the file into your project (package `invokeilpay`):

```bash
mkdir -p internal/invokeilpay && cp sdks/go/invokeil.go internal/invokeilpay/
```

## Usage

```go
package main

import (
	"fmt"
	"log"

	"yourmodule/internal/invokeilpay"
)

func main() {
	client := invokeilpay.New("https://pay.example.com", "sk_live_xxx")

	checkout, err := client.CreateCheckout(map[string]any{
		"amount":          500,
		"customer_name":   "Rahim Uddin",
		"customer_mobile": "01712345678",
		"redirect_url":    "https://myshop.com/thanks",
	})
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println(checkout["payment_url"]) // redirect the customer here

	result, err := client.VerifyPayment(checkout["checkout_token"].(string))
	_ = result

	// Webhook verification (net/http)
	http.HandleFunc("/webhook", func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body) // raw body — do not re-serialize
		if !client.VerifyWebhookSignature(raw, r.Header.Get("X-Invokeil-Signature"), secret) {
			http.Error(w, "bad signature", http.StatusBadRequest)
			return
		}
		w.Write([]byte(`{"ok":true}`))
	})
}
```

## API surface

| Function | Description |
|---|---|
| `New(baseURL, apiKey)` | Create a client (30s timeout) |
| `CreateCheckout(map[string]any)` | `POST /api/v1/checkout` |
| `VerifyPayment(ppID)` | `POST /api/v1/verify-payment` |
| `GetCheckout(token)` | `GET /api/v1/checkout/{token}` |
| `VerifyWebhookSignature(rawBody, header, secret)` | HMAC verify (bool) |

Scheme: `X-Invokeil-Signature: t=<ms-epoch>,v1=hex(hmac_sha256(secret, "<t>.<rawBody>"))`
with a 5-minute replay window (constant-time compare via `hmac.Equal`).

## License

Invokeil Pay Community License 1.0 — see the repo root `LICENSE`.
