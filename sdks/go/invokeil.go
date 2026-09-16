// Invokeil Pay — official Go SDK (single file, standard library only).
//
// Usage:
//   invokeil := invokeilpay.New("https://pay.example.com", "sk_live_xxx")
//   checkout, err := invokeil.CreateCheckout(map[string]any{ "amount": 500, ... })
//
// Package name: invokeilpay (drop this file into your module, or vendor it).
package invokeilpay

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// Client talks to a self-hosted Invokeil Pay instance.
type Client struct {
	BaseURL string
	APIKey  string
	HTTP    *http.Client
}

// New creates a client with a 30s timeout.
func New(baseURL, apiKey string) *Client {
	return &Client{
		BaseURL: strings.TrimRight(baseURL, "/"),
		APIKey:  apiKey,
		HTTP:    &http.Client{Timeout: 30 * time.Second},
	}
}

func (c *Client) do(method, path string, body any, out any) error {
	var rdr io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return err
		}
		rdr = bytes.NewReader(b)
	}
	req, err := http.NewRequest(method, c.BaseURL+path, rdr)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.APIKey)
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	res, err := c.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	data, err := io.ReadAll(res.Body)
	if err != nil {
		return err
	}
	if res.StatusCode >= 400 {
		var e struct {
			Error string `json:"error"`
		}
		_ = json.Unmarshal(data, &e)
		if e.Error == "" {
			e.Error = "HTTP " + strconv.Itoa(res.StatusCode)
		}
		return errors.New(e.Error)
	}
	if out != nil && len(data) > 0 {
		return json.Unmarshal(data, out)
	}
	return nil
}

// CreateCheckout creates a hosted checkout. POST /api/v1/checkout
func (c *Client) CreateCheckout(payment map[string]any) (map[string]any, error) {
	out := map[string]any{}
	if err := c.do(http.MethodPost, "/api/v1/checkout", payment, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// VerifyPayment verifies a payment by checkout id (PipraPay-style pp_id).
func (c *Client) VerifyPayment(ppID string) (map[string]any, error) {
	out := map[string]any{}
	if err := c.do(http.MethodPost, "/api/v1/verify-payment", map[string]any{"pp_id": ppID}, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// GetCheckout fetches a checkout by token. GET /api/v1/checkout/{token}
func (c *Client) GetCheckout(token string) (map[string]any, error) {
	out := map[string]any{}
	if err := c.do(http.MethodGet, "/api/v1/checkout/"+url.PathEscape(token), nil, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// VerifyWebhookSignature validates an X-Invokeil-Signature header.
// Scheme: t=<ms-epoch>,v1=hex(hmac_sha256(secret, "<t>.<rawBody>")), 5-minute replay window.
// Pass the RAW body exactly as received.
func (c *Client) VerifyWebhookSignature(rawBody []byte, header, secret string) bool {
	return VerifyWebhookSignature(rawBody, header, secret, 5*time.Minute)
}

// VerifyWebhookSignature is the package-level variant with custom tolerance.
func VerifyWebhookSignature(rawBody []byte, header, secret string, tolerance time.Duration) bool {
	if len(rawBody) == 0 || header == "" || secret == "" {
		return false
	}
	parts := map[string]string{}
	for _, kv := range strings.Split(header, ",") {
		if i := strings.Index(kv, "="); i > 0 {
			parts[strings.TrimSpace(kv[:i])] = strings.TrimSpace(kv[i+1:])
		}
	}
	t, v1 := parts["t"], parts["v1"]
	if t == "" || v1 == "" {
		return false
	}
	ts, err := strconv.ParseInt(t, 10, 64)
	if err != nil {
		return false
	}
	if d := time.Since(time.UnixMilli(ts)); d > tolerance || d < -tolerance {
		return false
	}
	mac := hmac.New(sha256.New, []byte(secret))
	fmt.Fprintf(mac, "%s.", t)
	mac.Write(rawBody)
	expected := hex.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(expected), []byte(v1))
}
