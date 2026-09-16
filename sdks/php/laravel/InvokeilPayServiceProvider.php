<?php
/**
 * Laravel service provider for the Invokeil Pay SDK.
 *
 * Setup:
 *   1. Copy sdks/php/src/InvokeilPay.php to app/Services/ (or add to composer classmap).
 *   2. Copy this file to app/Providers/InvokeilPayServiceProvider.php.
 *   3. Copy config/invokeil-pay.php to config/ and register the provider in
 *      bootstrap/providers.php (Laravel 11+) or config/app.php (older).
 *   4. Put INVOKEIL_BASE_URL / INVOKEIL_API_KEY / INVOKEIL_WEBHOOK_SECRET in .env.
 *
 * Usage:
 *   $checkout = invokeil()->createCheckout(['amount' => 500, 'customer_mobile' => '01712345678']);
 */

namespace App\Providers;

use Illuminate\Support\ServiceProvider;
use InvokeilPay;

class InvokeilPayServiceProvider extends ServiceProvider
{
    /**
     * Register the singleton client in the container.
     */
    public function register(): void
    {
        $this->mergeConfigFrom(__DIR__ . '/../../config/invokeil-pay.php', 'invokeil-pay');

        $this->app->singleton('invokeil', function ($app) {
            return new InvokeilPay(
                (string) config('invokeil-pay.base_url'),
                (string) config('invokeil-pay.api_key'),
                (int) config('invokeil-pay.timeout', 30)
            );
        });

        $this->app->alias('invokeil', InvokeilPay::class);
    }

    /**
     * Publish the config stub.
     */
    public function boot(): void
    {
        if ($this->app->runningInConsole()) {
            $this->publishes([
                __DIR__ . '/../../config/invokeil-pay.php' => config_path('invokeil-pay.php'),
            ], 'invokeil-pay-config');
        }
    }
}
