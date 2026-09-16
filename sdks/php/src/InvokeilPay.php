<?php
/**
 * Invokeil Pay — official PHP SDK (single file, no dependencies, curl only).
 *
 *   $invokeil = new InvokeilPay('https://pay.example.com', 'sk_live_xxx');
 *   $checkout = $invokeil->createCheckout([...]);
 *
 * Compatible with PHP 7.2+.
 */

if (!class_exists('InvokeilPay')) {

class InvokeilPay
{
    /** @var string */
    private $baseUrl;
    /** @var string */
    private $apiKey;
    /** @var int */
    private $timeout;

    /**
     * @param string $baseUrl e.g. https://pay.example.com
     * @param string $apiKey  store API key (sk_live_… / sk_test_…)
     * @param int    $timeout request timeout in seconds
     */
    public function __construct($baseUrl, $apiKey, $timeout = 30)
    {
        $this->baseUrl = rtrim($baseUrl, '/');
        $this->apiKey = $apiKey;
        $this->timeout = $timeout;
    }

    /**
     * Create a hosted checkout (payment).
     *
     * @param array $payment { amount, customer_name?, customer_mobile?, customer_email?,
     *                        redirect_url?, cancel_url?, webhook_url?, metadata? }
     * @return array decoded API response
     * @throws RuntimeException on HTTP or API error
     */
    public function createCheckout(array $payment)
    {
        return $this->request('POST', '/api/v1/checkout', $payment);
    }

    /** PipraPay-compatible alias of createCheckout(). */
    public function createPayment(array $payment)
    {
        return $this->createCheckout($payment);
    }

    /**
     * Verify a payment by checkout id (PipraPay-style pp_id).
     *
     * @param string $ppId
     * @return array decoded API response
     */
    public function verifyPayment($ppId)
    {
        return $this->request('POST', '/api/v1/verify-payment', ['pp_id' => (string) $ppId]);
    }

    /**
     * Fetch a checkout by token.
     *
     * @param string $token
     * @return array decoded API response
     */
    public function getCheckout($token)
    {
        return $this->request('GET', '/api/v1/checkout/' . rawurlencode($token));
    }

    /**
     * Verify a webhook signature produced by Invokeil Pay.
     * Scheme: header "t=<ms-epoch>,v1=hex(hmac_sha256(secret, '<t>.<rawBody>'))"
     * with a 5-minute replay window.
     *
     * @param string $rawBody exact request body (file_get_contents('php://input'))
     * @param string $header  the X-Invokeil-Signature header value
     * @param string $secret  the store's webhook signing secret (whsec_…)
     * @param int    $toleranceMs replay window in milliseconds (default 300000)
     * @return bool
     */
    public function verifyWebhookSignature($rawBody, $header, $secret, $toleranceMs = 300000)
    {
        if (!$rawBody || !$header || !$secret) {
            return false;
        }
        $parts = [];
        foreach (explode(',', (string) $header) as $kv) {
            $i = strpos($kv, '=');
            if ($i > 0) {
                $parts[trim(substr($kv, 0, $i))] = trim(substr($kv, $i + 1));
            }
        }
        if (empty($parts['t']) || empty($parts['v1'])) {
            return false;
        }
        $t = $parts['t'];
        if (!ctype_digit($t) || abs((time() * 1000) - (int) $t) > $toleranceMs) {
            return false;
        }
        $expected = hash_hmac('sha256', $t . '.' . $rawBody, $secret);
        return hash_equals($expected, $parts['v1']);
    }

    /**
     * Internal HTTP helper via curl.
     *
     * @return array decoded JSON
     * @throws RuntimeException
     */
    private function request($method, $path, array $body = null)
    {
        if (!function_exists('curl_init')) {
            throw new RuntimeException('curl extension is required');
        }
        $ch = curl_init($this->baseUrl . $path);
        $headers = [
            'Authorization: Bearer ' . $this->apiKey,
            'Accept: application/json',
        ];
        if ($method === 'POST') {
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body ?? new stdClass()));
            $headers[] = 'Content-Type: application/json';
        }
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER     => $headers,
            CURLOPT_TIMEOUT        => $this->timeout,
            CURLOPT_CONNECTTIMEOUT => 10,
        ]);
        $res = curl_exec($ch);
        if ($res === false) {
            $err = curl_error($ch);
            curl_close($ch);
            throw new RuntimeException('HTTP request failed: ' . $err);
        }
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);

        $data = json_decode((string) $res, true);
        if (!is_array($data)) {
            throw new RuntimeException('Invalid JSON response (HTTP ' . $status . ')');
        }
        if ($status >= 400) {
            $msg = isset($data['error']) ? $data['error'] : ('HTTP ' . $status);
            throw new RuntimeException('Invokeil Pay API error: ' . $msg, $status);
        }
        return $data;
    }
}

}
