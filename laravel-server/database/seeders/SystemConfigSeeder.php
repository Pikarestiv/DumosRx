<?php

namespace Database\Seeders;

use App\Models\SystemConfig;
use Illuminate\Database\Seeder;

class SystemConfigSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $subscriptionPlans = json_decode((string) file_get_contents(__DIR__.'/data/subscription_plans.json'), true, flags: JSON_THROW_ON_ERROR);

        $this->seedIfMissing('subscription_plans', $subscriptionPlans, 'Configuration for the 3-tier DumosRx pricing model including features and limits');
        $this->seedIfMissing('global_suggestions', [], 'Global autocomplete suggestions configuration');

        $referralConfig = [
            'enabled' => true,
            'reward_percentage' => 10.0,
            'reward_trigger' => 'recurring', // 'first' or 'recurring'
            'allow_full_credit_payment' => true,
        ];
        $this->seedIfMissing('referral_program', $referralConfig, 'Configuration for the subscription referral program and credit rewards');

        // Live Chat
        $this->seedIfMissing('smartsupp_key', '', 'Smartsupp Live Chat widget key. Leave empty to disable the chat widget.');
    }

    private function seedIfMissing(string $key, $value, ?string $description = null): void
    {
        if (SystemConfig::where('key', $key)->exists()) {
            return;
        }

        SystemConfig::setVal($key, $value, $description);
    }
}
