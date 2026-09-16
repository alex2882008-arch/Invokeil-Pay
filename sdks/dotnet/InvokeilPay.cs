// Invokeil Pay — official .NET / C# SDK (single file, HttpClient only).
//
// Usage:
//   var invokeil = new InvokeilPay("https://pay.example.com", "sk_live_xxx");
//   var checkout = await invokeil.CreateCheckoutAsync(new { amount = 500, customer_mobile = "01712345678" });
//
// Targets .NET Standard 2.0+ / .NET 6+ (System.Text.Json).
#nullable enable
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;

namespace Invokeil.Pay
{
    public class InvokeilPayException : Exception
    {
        public int Status { get; }
        public string? Body { get; }

        public InvokeilPayException(string message, int status = 0, string? body = null)
            : base(message)
        {
            Status = status;
            Body = body;
        }
    }

    public class InvokeilPay
    {
        private readonly HttpClient _http;
        private static readonly JsonSerializerOptions JsonOpts = new()
        {
            PropertyNameCaseInsensitive = true,
        };

        /// <param name="baseUrl">e.g. https://pay.example.com</param>
        /// <param name="apiKey">store API key (sk_live_… / sk_test_…)</param>
        /// <param name="httpClient">optional HttpClient (a default one is created otherwise)</param>
        public InvokeilPay(string baseUrl, string apiKey, HttpClient? httpClient = null)
        {
            if (string.IsNullOrWhiteSpace(baseUrl)) throw new ArgumentException("baseUrl is required");
            if (string.IsNullOrWhiteSpace(apiKey)) throw new ArgumentException("apiKey is required");
            BaseUrl = baseUrl.TrimEnd('/');
            _http = httpClient ?? new HttpClient { Timeout = TimeSpan.FromSeconds(30) };
            _http.DefaultRequestHeaders.Remove("Authorization");
            _http.DefaultRequestHeaders.TryAddWithoutValidation("Authorization", $"Bearer {apiKey}");
            _http.DefaultRequestHeaders.TryAddWithoutValidation("Accept", "application/json");
        }

        public string BaseUrl { get; }

        /// <summary>Create a hosted checkout. POST /api/v1/checkout</summary>
        public Task<JsonElement> CreateCheckoutAsync(object payment) =>
            SendAsync(HttpMethod.Post, "/api/v1/checkout", payment);

        /// <summary>PipraPay-compatible alias of CreateCheckoutAsync.</summary>
        public Task<JsonElement> CreatePaymentAsync(object payment) =>
            CreateCheckoutAsync(payment);

        /// <summary>Verify a payment by checkout id (PipraPay-style pp_id).</summary>
        public Task<JsonElement> VerifyPaymentAsync(string ppId) =>
            SendAsync(HttpMethod.Post, "/api/v1/verify-payment", new { pp_id = ppId });

        /// <summary>Fetch a checkout by token. GET /api/v1/checkout/{token}</summary>
        public Task<JsonElement> GetCheckoutAsync(string token) =>
            SendAsync(HttpMethod.Get, $"/api/v1/checkout/{Uri.EscapeDataString(token)}", null);

        /// <summary>
        /// Verify an X-Invokeil-Signature header.
        /// Scheme: t=&lt;ms-epoch&gt;,v1=hex(hmac_sha256(secret, "&lt;t&gt;.&lt;rawBody&gt;")), 5-minute replay window.
        /// Pass the RAW body exactly as received — never a re-serialized object.
        /// </summary>
        public static bool VerifyWebhookSignature(string rawBody, string header, string secret, int toleranceMs = 300_000)
        {
            if (string.IsNullOrEmpty(rawBody) || string.IsNullOrEmpty(header) || string.IsNullOrEmpty(secret))
                return false;

            var parts = new Dictionary<string, string>();
            foreach (var kv in header.Split(','))
            {
                int i = kv.IndexOf('=');
                if (i > 0)
                    parts[kv.Substring(0, i).Trim()] = kv.Substring(i + 1).Trim();
            }
            if (!parts.TryGetValue("t", out var t) || !parts.TryGetValue("v1", out var v1))
                return false;
            if (!long.TryParse(t, NumberStyles.Integer, CultureInfo.InvariantCulture, out var ts))
                return false;
            if (Math.Abs(DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - ts) > toleranceMs)
                return false;

            using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
            byte[] mac = hmac.ComputeHash(Encoding.UTF8.GetBytes($"{t}.{rawBody}"));
            var expected = Convert.ToHexString(mac).ToLowerInvariant();
            return FixedTimeEquals(expected, v1.ToLowerInvariant());
        }

        private static bool FixedTimeEquals(string a, string b)
        {
            if (a.Length != b.Length) return false;
            int diff = 0;
            for (int i = 0; i < a.Length; i++) diff |= a[i] ^ b[i];
            return diff == 0;
        }

        private async Task<JsonElement> SendAsync(HttpMethod method, string path, object? body)
        {
            using var req = new HttpRequestMessage(method, BaseUrl + path);
            if (body is not null)
            {
                req.Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json");
            }
            using var res = await _http.SendAsync(req);
            string text = await res.Content.ReadAsStringAsync();
            JsonElement data = JsonDocument.Parse(string.IsNullOrWhiteSpace(text) ? "{}" : text).RootElement.Clone();
            if (!res.IsSuccessStatusCode)
            {
                string msg = data.ValueKind == JsonValueKind.Object && data.TryGetProperty("error", out var e)
                    ? e.GetString() ?? $"HTTP {(int)res.StatusCode}"
                    : $"HTTP {(int)res.StatusCode}";
                throw new InvokeilPayException(msg, (int)res.StatusCode, text);
            }
            return data;
        }
    }
}
