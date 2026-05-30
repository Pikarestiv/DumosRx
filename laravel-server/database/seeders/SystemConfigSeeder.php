<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\SystemConfig;

class SystemConfigSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $subscriptionPlans = [
            'trial_days' => 14,
            'grace_period_days' => 3,
            'enable_paystack' => true,
            'tiers' => [
                'local' => [
                    'name' => 'Dumos Local',
                    'price_one_time' => 50000,
                    'period' => 'One-Time',
                    'active' => true,
                    'limits' => [
                        'stores' => 1,
                        'staff' => 3,
                        'inventory' => -1,
                    ],
                    'features' => [
                        'basic_inventory' => true,
                        'cloud_sync' => false,
                        'alerts' => false,
                        'remote_dashboard' => false,
                    ]
                ],
                'pro' => [
                    'name' => 'Dumos Pro',
                    'price_monthly' => 3000,
                    'price_yearly' => 30000,
                    'active' => true,
                    'limits' => [
                        'stores' => 3,
                        'staff' => 10,
                        'inventory' => -1,
                    ],
                    'features' => [
                        'basic_inventory' => true,
                        'cloud_sync' => true,
                        'alerts' => true,
                        'remote_dashboard' => true,
                        'broadcast_receive' => true,
                    ]
                ],
                'enterprise' => [
                    'name' => 'Enterprise',
                    'price_monthly' => 8000,
                    'price_yearly' => 80000,
                    'active' => true,
                    'limits' => [
                        'stores' => -1,
                        'staff' => -1,
                        'inventory' => -1,
                    ],
                    'features' => [
                        'basic_inventory' => true,
                        'cloud_sync' => true,
                        'alerts' => true,
                        'remote_dashboard' => true,
                        'broadcast_receive' => true,
                        'broadcast_create' => true,
                        'custom_branding' => true,
                        'data_export' => true,
                    ]
                ]
            ]
        ];

        SystemConfig::setVal('subscription_plans', $subscriptionPlans, 'Configuration for the 3-tier DumosRx pricing model including features and limits');
        SystemConfig::setVal('global_suggestions', [], 'Global autocomplete suggestions configuration');

        $referralConfig = [
            'enabled' => true,
            'reward_percentage' => 10.0,
            'reward_trigger' => 'recurring', // 'first' or 'recurring'
            'allow_full_credit_payment' => true
        ];
        SystemConfig::setVal('referral_program', $referralConfig, 'Configuration for the subscription referral program and credit rewards');

        // Live Chat
        SystemConfig::setVal('smartsupp_key', '', 'Smartsupp Live Chat widget key. Leave empty to disable the chat widget.');
    }
}
