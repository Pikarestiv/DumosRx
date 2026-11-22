<?php

use App\Models\SystemConfig;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Cache;

return new class extends Migration
{
    public function up(): void
    {
        $config = SystemConfig::getVal('subscription_plans');
        if (! is_array($config)) {
            return;
        }

        $current = $config['tiers']['enterprise']['limits']['sync_interval'] ?? null;
        if ($current === 15) {
            $config['tiers']['enterprise']['limits']['sync_interval'] = 0;
            SystemConfig::setVal(
                'subscription_plans',
                $config,
                'Configuration for the 3-tier DumosRx pricing model including features and limits'
            );
            Cache::forget('system_config_subscription_plans');
        }
    }

    public function down(): void {}
};
