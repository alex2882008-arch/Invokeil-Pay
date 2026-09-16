/**
 * Invokeil Pay — official JavaScript SDK (ESM + CJS friendly, zero dependencies).
 *
 * CommonJS:   const InvokeilPay = require('./invokeil.js');
 * ESM:        import InvokeilPay, { InvokeilPay as Named } from './invokeil.js';
 * Browser:    <script src="invokeil.js"></script> → window.InvokeilPay
 *
 * Requires a runtime with global `fetch` (Node ≥ 18, browsers, Bun, Deno).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && typeof module.exports === 'object') {
    // CommonJS / Node — class as default export plus a named property
    module.exports = api.InvokeilPay;
    module.exports.InvokeilPay = api.InvokeilPay;
    module.exports.default = api.InvokeilPay;
  } else {
    root.InvokeilPay = api.InvokeilPay;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var cryptoRef = null;
  try {
    if (typeof require === 'function') cryptoRef = require('crypto');
  } catch (e) { /* browsers: no crypto hmac — verify() needs Node */ }

  function hmacHex(secret, message) {
    if (cryptoRef) return cryptoRef.createHmac('sha256', secret).update(message, 'utf8').digest('hex');
    throw new Error('verifyWebhookSignature requires Node.js (crypto module)');
  }

  function timingSafeEqualHex(a, b) {
    if (cryptoRef && cryptoRef.timingSafeEqual && a.length === b.length) {
      return cryptoRef.timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
    }
    // Constant-time-ish fallback for non-Node runtimes
    var diff = a.length === b.length ? 0 : 1;
    var n = Math.min(a.length, b.length);
    for (var i = 0; i < n; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
  }

  function InvokeilPay(opts) {
    opts = opts || {};
    if (!opts.baseUrl) throw new Error('baseUrl is required');
    if (!opts.apiKey) throw new Error('apiKey is required');
    this.baseUrl = String(opts.baseUrl).replace(/\/+$/, '');
    this.apiKey = String(opts.apiKey);
    this.timeoutMs = opts.timeoutMs || 30000;
    this.fetchImpl = opts.fetch || (typeof fetch === 'function' ? fetch : null);
    if (!this.fetchImpl) throw new Error('global fetch not available (Node >= 18 required)');
  }

  /** Internal: request JSON with bearer auth. */
  InvokeilPay.prototype._request = function (method, path, body) {
    var self = this;
    var headers = {
      'Authorization': 'Bearer ' + self.apiKey,
      'Accept': 'application/json',
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    return self.fetchImpl(self.baseUrl + path, {
      method: method,
      headers: headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(self.timeoutMs) : undefined,
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) {
          var err = new Error((data && (data.error || data.message)) || ('HTTP ' + res.status));
          err.status = res.status;
          err.code = data && data.code;
          err.data = data;
          throw err;
        }
        return data;
      });
    });
  };

  /**
   * Create a hosted checkout (payment).
   * @param {object} payment  { amount, customer_name?, customer_mobile?, customer_email?,
   *                                 redirect_url?, cancel_url?, webhook_url?, metadata? }
   * @returns {Promise<object>} API response (checkout_token, payment_url, ...)
   */
  InvokeilPay.prototype.createCheckout = function (payment) {
    return this._request('POST', '/api/v1/checkout', payment || {});
  };

  /** Alias kept for PipraPay-style integrations. */
  InvokeilPay.prototype.createPayment = function (payment) {
    return this.createCheckout(payment);
  };

  /**
   * Verify a payment by checkout id (pp_id for PipraPay compatibility).
   * @param {string} ppId  checkout token or numeric id
   * @returns {Promise<object>}
   */
  InvokeilPay.prototype.verifyPayment = function (ppId) {
    return this._request('POST', '/api/v1/verify-payment', { pp_id: String(ppId) });
  };

  /** Fetch a checkout by token. */
  InvokeilPay.prototype.getCheckout = function (token) {
    return this._request('GET', '/api/v1/checkout/' + encodeURIComponent(token));
  };

  /**
   * Verify a webhook signature produced by Invokeil Pay.
   * Scheme (identical to the server): header `t=<ms-epoch>,v1=hex(hmac_sha256(secret, "<t>.<rawBody>"))`,
   * with a 5-minute replay window.
   *
   * @param {string} rawBody  exact request body as received (do NOT re-serialize)
   * @param {string} header   the X-Invokeil-Signature header value
   * @param {string} secret   the store's webhook signing secret (whsec_…)
   * @param {number} [toleranceMs] replay window in ms (default 300000 = 5 minutes)
   * @returns {boolean}
   */
  InvokeilPay.prototype.verifyWebhookSignature = function (rawBody, header, secret, toleranceMs) {
    toleranceMs = toleranceMs || 300000;
    if (!rawBody || !header || !secret) return false;
    var parts = {};
    String(header).split(',').forEach(function (kv) {
      var i = kv.indexOf('=');
      if (i > 0) parts[kv.slice(0, i).trim()] = kv.slice(i + 1).trim();
    });
    var t = parts['t'];
    var v1 = parts['v1'];
    if (!t || !v1) return false;
    var ts = Number(t);
    if (!Number.isFinite(ts)) return false;
    if (Math.abs(Date.now() - ts) > toleranceMs) return false;
    var expected = hmacHex(secret, t + '.' + rawBody);
    return timingSafeEqualHex(expected, v1);
  };

  return { InvokeilPay: InvokeilPay };
});
