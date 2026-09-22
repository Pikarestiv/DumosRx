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
                'free' => [
                    'name' => 'Free',
                    'price_monthly' => 0,
                    'price_yearly' => 0,
                    'active' => true,
                    'limits' => [
                        'stores' => 1,
                        'staff' => 0, // Owner only, so 0 staff
                        'inventories' => -1,
                    ],
                    'features' => [
                        'basic_inventory' => true,
                        'cloud_sync' => false,
                        'web_dashboard' => false,
                        'mobile_access' => false,
                        'prescriptions' => false,
                        'procurement' => false,
                        'expenses' => false,
                        'theme_customizer' => false,
                        'dark_mode' => false,
                        'store_url' => false,
                        'auto_lock' => false,
                        'audit_mode' => false,
                        'smart_suggestions' => false,
                        'daily_summary_email' => false,
                        'multi_store' => false,
                    ]
                ],
                'starter' => [
                    'name' => 'Starter',
                    'price_monthly' => 3000,
                    'price_yearly' => 30000,
                    'active' => true,
                    'limits' => [
                        'stores' => 1,
                        'staff' => 3,
                        'inventories' => -1,
                        'sync_interval' => 180,
                    ],
                    'features' => [
                        'basic_inventory' => true,
                        'cloud_sync' => true,
                        'web_dashboard' => true,
                        'mobile_access' => false,
                        'prescriptions' => true,
                        'procurement' => true,
                        'expenses' => true,
                        'theme_customizer' => true,
                        'dark_mode' => true,
                        'store_url' => false,
                        'auto_lock' => true,
                        'audit_mode' => true,
                        'smart_suggestions' => false,
                        'daily_summary_email' => false,
                        'multi_store' => false,
                    ]
                ],
                'pro' => [
                    'name' => 'Dumos Pro',
                    'price_monthly' => 8000,
                    'price_yearly' => 80000,
                    'active' => true,
                    'limits' => [
                        'stores' => 3,
                        'staff' => 10,
                        'inventories' => -1,
                        'sync_interval' => 30,
                    ],
                    'features' => [
                        'basic_inventory' => true,
                        'cloud_sync' => true,
                        'web_dashboard' => true,
                        'mobile_access' => true,
                        'prescriptions' => true,
                        'procurement' => true,
                        'expenses' => true,
                        'theme_customizer' => true,
                        'dark_mode' => true,
                        'store_url' => true,
                        'auto_lock' => true,
                        'audit_mode' => true,
                        'smart_suggestions' => true,
                        'daily_summary_email' => true,
                        'multi_store' => false,
                    ]
                ],
                'enterprise' => [
                    'name' => 'Enterprise',
                    'price_monthly' => 15000,
                    'price_yearly' => 150000,
                    'active' => true,
                    'limits' => [
                        'stores' => -1,
                        'staff' => -1,
                        'inventories' => -1,
                        // 0 = instant sync, matching the client's own
                        // fallback (use-feature-gate.ts's
                        // getDefaultMinimumSyncIntervalMinutes: isEnterprise
                        // ? 0 : ...) and web/'s bundled plan defaults
                        // (subscription-config-defaults.ts). This was
                        // previously 15, disagreeing with both — a stale
                        // value nobody had updated here when "Enterprise =
                        // instant sync" was established elsewhere, which
                        // made every fresh Enterprise-tier row start with a
                        // higher effective minimum sync interval than
                        // intended.
                        'sync_interval' => 0,
                    ],
                    'features' => [
                        'basic_inventory' => true,
                        'cloud_sync' => true,
                        'web_dashboard' => true,
                        'mobile_access' => true,
                        'prescriptions' => true,
                        'procurement' => true,
                        'expenses' => true,
                        'theme_customizer' => true,
                        'dark_mode' => true,
                        'store_url' => true,
                        'auto_lock' => true,
                        'audit_mode' => true,
                        'smart_suggestions' => true,
                        'multi_store' => true,
                        'custom_branding' => true,
                        'data_export' => true,
                        'daily_summary_email' => true,
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
