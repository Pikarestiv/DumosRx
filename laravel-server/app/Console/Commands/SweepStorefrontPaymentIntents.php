<?php

namespace App\Console\Commands;

use App\Services\Storefront\StorefrontPaymentReconciler;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

/**
 * Hourly reconciliation sweep for storefront payment intents nobody ever
 * turned into an order. Scheduled in routes/console.php; the behaviour and
 * the reason a stale intent is never auto-refunded are documented in
 * laravel-server/AGENTS.md (PG-2).
 */
class SweepStorefrontPaymentIntents extends Command
{
    protected $signature = 'storefront:sweep-payment-intents {--minutes= : Override how long an intent may sit unclaimed}';

    protected $description = 'Re-verify storefront payment intents left unclaimed, and alert on money that arrived with no order against it.';

    public function handle(StorefrontPaymentReconciler $reconciler): int
    {
        $minutes = (int) ($this->option('minutes') ?: config('payment.storefront_intent_stale_minutes', 60));

        $counts = $reconciler->sweep($minutes);

        $summary = collect($counts)->map(fn ($count, $key) => "{$key}={$count}")->implode(' ');
        $this->info("storefront:sweep-payment-intents ({$minutes}m) {$summary}");

        if ($counts['paid'] > 0 || $counts['refunded'] > 0 || $counts['alerted'] > 0) {
            Log::info("storefront:sweep-payment-intents {$summary}");
        }

        return self::SUCCESS;
    }
}
