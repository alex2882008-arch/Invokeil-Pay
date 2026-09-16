<?php
/**
 * Laravel config stub — copy to config/invokeil-pay.php and fill from .env.
 *
 * INVOKEIL_BASE_URL=https://pay.example.com
 * INVOKEIL_API_KEY=sk_live_xxx
 * INVOKEIL_WEBHOOK_SECRET=whsec_xxx
 */

return [
    // Your self-hosted Invokeil Pay instance root URL (no trailing slash).
    'base_url' => env('INVOKEIL_BASE_URL', 'https://pay.example.com'),

    // Store API key (admin → Developers / API keys).
    'api_key' => env('INVOKEIL_API_KEY', ''),

    // Webhook signing secret for verifyWebhookSignature().
    'webhook_secret' => env('INVOKEIL_WEBHOOK_SECRET', ''),

    // HTTP timeout in seconds.
    'timeout' => env('INVOKEIL_TIMEOUT', 30),
];
