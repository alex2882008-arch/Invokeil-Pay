# Invokeil Pay — .NET / C# SDK

Official C# SDK for the **Invokeil Pay Merchant API v1**. Single file built on
`HttpClient` + `System.Text.Json`. Targets .NET Standard 2.0+ / .NET 6+.

## Install

Copy `InvokeilPay.cs` into your project — it declares namespace
`Invokeil.Pay` with no external dependencies.

## Usage

```csharp
using Invokeil.Pay;

var invokeil = new InvokeilPay("https://pay.example.com", "sk_live_xxx");

// Create a hosted checkout
var checkout = await invokeil.CreateCheckoutAsync(new
{
    amount = 500,
    customer_name = "Rahim Uddin",
    customer_mobile = "01712345678",
    redirect_url = "https://myshop.com/thanks",
});
string paymentUrl = checkout.GetProperty("payment_url").GetString()!;

// Verify later (PipraPay-compatible pp_id)
var result = await invokeil.VerifyPaymentAsync(checkout.GetProperty("checkout_token").GetString()!);

// Fetch by token
var detail = await invokeil.GetCheckoutAsync(token);
```

## Webhook verification (ASP.NET Core minimal API)

```csharp
app.MapPost("/webhook", async (HttpRequest request) =>
{
    using var ms = new MemoryStream();
    await request.Body.CopyToAsync(ms);          // raw body — do not re-serialize
    var raw = Encoding.UTF8.GetString(ms.ToArray());

    var header = request.Headers["X-Invokeil-Signature"].ToString();
    if (!InvokeilPay.VerifyWebhookSignature(raw, header, config["WebhookSecret"]!))
        return Results.BadRequest("bad signature");

    var payload = JsonDocument.Parse(raw);
    // handle payload event: checkout.paid, invoice.paid, ...
    return Results.Ok(new { ok = true });
});
```

Scheme: `X-Invokeil-Signature: t=<ms-epoch>,v1=hex(hmac_sha256(secret, "<t>.<rawBody>"))`
with a 5-minute replay window (fixed-time compare).

## API surface

| Member | Description |
|---|---|
| `new InvokeilPay(baseUrl, apiKey, httpClient?)` | Create a client |
| `CreateCheckoutAsync(payment)` | `POST /api/v1/checkout` |
| `CreatePaymentAsync(payment)` | Alias (PipraPay compat) |
| `VerifyPaymentAsync(ppId)` | `POST /api/v1/verify-payment` |
| `GetCheckoutAsync(token)` | `GET /api/v1/checkout/{token}` |
| `InvokeilPay.VerifyWebhookSignature(rawBody, header, secret)` | HMAC verify (bool, static) |

Errors throw `InvokeilPayException` with `.Status` and `.Body`.

## License

Invokeil Pay Community License 1.0 — see the repo root `LICENSE`.
