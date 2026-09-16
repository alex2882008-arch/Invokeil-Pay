/// Invokeil Pay — official Flutter / Dart SDK (http-based).
///
/// Add to pubspec.yaml:
///   dependencies:
///     http: ^1.2.0
///
/// Then copy this file into lib/ and import it:
///   import 'invokeil_pay.dart';
///
///   final invokeil = InvokeilPay(baseUrl: 'https://pay.example.com', apiKey: 'sk_live_xxx');
///   final checkout = await invokeil.createCheckout({'amount': 500, 'customer_mobile': '01712345678'});
library invokeil_pay;

import 'dart:convert';

import 'package:crypto/crypto.dart' as crypto;
import 'package:http/http.dart' as http;

/// Error thrown when the API responds with a non-2xx status.
class InvokeilError implements Exception {
  InvokeilError(this.message, {this.status = 0, this.data = const {}});

  final String message;
  final int status;
  final Map<String, dynamic> data;

  @override
  String toString() => 'InvokeilError($status): $message';
}

/// Client for the Invokeil Pay Merchant API v1.
class InvokeilPay {
  InvokeilPay({
    required this.baseUrl,
    required this.apiKey,
    this.timeout = const Duration(seconds: 30),
    http.Client? client,
  })  : baseUrl = baseUrl.replaceAll(RegExp(r'/+$'), ''),
        _client = client ?? http.Client();

  /// Root URL of your self-hosted instance, e.g. https://pay.example.com
  final String baseUrl;

  /// Store API key (sk_live_… / sk_test_…).
  final String apiKey;

  final Duration timeout;
  final http.Client _client;

  Map<String, String> get _headers => {
        'Authorization': 'Bearer $apiKey',
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      };

  Future<Map<String, dynamic>> _send(
    String method,
    String path,
    Map<String, dynamic>? body,
  ) async {
    final uri = Uri.parse('$baseUrl$path');
    final res = await _client
        .send(http.Request(method, uri)
          ..headers.addAll(_headers)
          ..body = body == null ? '' : jsonEncode(body))
        .timeout(timeout);
    final text = await _utf8StreamToString(res.stream);
    Map<String, dynamic> data;
    try {
      data = text.isEmpty ? <String, dynamic>{} : jsonDecode(text) as Map<String, dynamic>;
    } on FormatException {
      data = <String, dynamic>{};
    }
    if (res.statusCode >= 400) {
      throw InvokeilError(
        (data['error'] as String?) ?? 'HTTP ${res.statusCode}',
        status: res.statusCode,
        data: data,
      );
    }
    return data;
  }

  Future<String> _utf8StreamToString(http.StreamedResponse res) async {
    final chunks = await res.stream.toBytes();
    return utf8.decode(chunks, allowMalformed: true);
  }

  /// Create a hosted checkout. POST /api/v1/checkout
  Future<Map<String, dynamic>> createCheckout(Map<String, dynamic> payment) =>
      _send('POST', '/api/v1/checkout', payment);

  /// PipraPay-compatible alias of [createCheckout].
  Future<Map<String, dynamic>> createPayment(Map<String, dynamic> payment) =>
      createCheckout(payment);

  /// Verify a payment by checkout id (PipraPay-style pp_id).
  Future<Map<String, dynamic>> verifyPayment(String ppId) =>
      _send('POST', '/api/v1/verify-payment', {'pp_id': ppId});

  /// Fetch a checkout by token. GET /api/v1/checkout/{token}
  Future<Map<String, dynamic>> getCheckout(String token) =>
      _send('GET', '/api/v1/checkout/${Uri.encodeComponent(token)}', null);

  /// Verify an X-Invokeil-Signature header.
  ///
  /// Scheme (identical to the server):
  ///   t=<ms-epoch>,v1=hex(hmac_sha256(secret, "<t>.<rawBody>"))
  /// with a 5-minute replay window. Pass the RAW body string exactly as
  /// received — never a re-serialized map.
  bool verifyWebhookSignature(
    String rawBody,
    String header,
    String secret, {
    int toleranceMs = 300000,
  }) {
    if (rawBody.isEmpty || header.isEmpty || secret.isEmpty) return false;
    final parts = <String, String>{};
    for (final kv in header.split(',')) {
      final i = kv.indexOf('=');
      if (i > 0) parts[kv.substring(0, i).trim()] = kv.substring(i + 1).trim();
    }
    final t = parts['t'];
    final v1 = parts['v1'];
    if (t == null || v1 == null) return false;
    final ts = int.tryParse(t);
    if (ts == null) return false;
    if ((DateTime.now().millisecondsSinceEpoch - ts).abs() > toleranceMs) {
      return false;
    }
    final key = crypto.utf8.encode('$t.$rawBody');
    final sig = crypto.Hmac(crypto.sha256, crypto.utf8.encode(secret)).convert(key);
    return sig.toString() == v1;
  }

  void close() => _client.close();
}
