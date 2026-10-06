<?php

namespace App\Console\Commands;

use App\Models\Subscription;
use App\Models\SystemConfig;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

class ExpireLapsedSubscriptions extends Command
{
    protected $signature = 'subscriptions:expire';

    protected $description = "Mark active subscriptions whose end_date and grace window have both elapsed as expired";

    public function handle(): int
    {
        $graceDays = SystemConfig::getVal('subscription_plans', [])['grace_period_days'] ?? 3;
        $cutoff = now()->subDays($graceDays);

        $expired = 0;

        Subscription::where('status', 'active')
            ->where('end_date', '<', $cutoff)
            ->chunkById(500, function ($subscriptions) use (&$expired) {
                foreach ($subscriptions as $subscription) {
                    $subscription->update(['status' => 'expired']);
                    $expired++;
                }
            });

        if ($expired > 0) {
            Log::info("subscriptions:expire marked {$expired} lapsed subscription(s) as expired.");
        }

        $this->info("Expired {$expired} lapsed subscription(s) (grace period: {$graceDays} days).");

        return self::SUCCESS;
    }
}
