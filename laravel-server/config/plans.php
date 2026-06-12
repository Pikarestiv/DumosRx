<?php

return [
    'trial_days' => 7,
    'grace_period_days' => 3,
    
    'tiers' => [
        'starter' => [
            'name' => 'Starter',
            'price_monthly' => 5000,
            'price_yearly' => 50000,
            'limits' => [
                'stores' => 1,
                'staff' => 2,
                'inventory' => 500, // max items
            ],
            'features' => [
                'basic_inventory' => true,
                'cloud_sync' => true,
                'alerts' => false,
                'remote_dashboard' => false,
            ]
        ],
        'pro' => [
            'name' => 'Professional',
            'price_monthly' => 8000,
            'price_yearly' => 96000,
            'limits' => [
                'stores' => 3,
                'staff' => -1, // unlimited
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
            'price_monthly' => 15000, // or custom
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
