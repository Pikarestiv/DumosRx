<?php

$noStorefront = [
    'storefront_enabled' => false,
    'allowed_presets' => [],
    'custom_accent_colour' => false,
    'max_online_products' => null,
    'checkout_whatsapp' => false,
    'checkout_transfer_mobile_money' => false,
    'checkout_pay_on_delivery' => false,
    'checkout_paystack' => false,
    'checkout_flutterwave' => false,
    'remove_powered_by_badge' => false,
    'services_on_storefront' => false,
    'visitor_language_switch' => false,
    'owner_self_edit_look' => false,
    'rebuild_mode' => 'scheduled',
    'custom_domain' => false,
];

return [
    'pro_allowed_presets_key' => 'storefront.pro_allowed_presets',

    'owner_opt_in_plans' => ['starter'],

    'relist_trimmed_on_upgrade_plans' => ['starter'],

    'scheduled_rebuild' => [
        'time' => '03:00',
        'timezone' => 'Africa/Lagos',
    ],

    'plans' => [
        'free' => $noStorefront,
        'starter' => [
            ...$noStorefront,
            'storefront_enabled' => true,
            'allowed_presets' => 'store_type_default',
            'max_online_products' => 50,
            'checkout_whatsapp' => true,
            'checkout_pay_on_delivery' => true,
        ],
        'pro' => [
            'storefront_enabled' => true,
            'allowed_presets' => ['workshop', 'clinic', 'market'],
            'custom_accent_colour' => false,
            'max_online_products' => 300,
            'checkout_whatsapp' => true,
            'checkout_transfer_mobile_money' => true,
            'checkout_pay_on_delivery' => true,
            'checkout_paystack' => false,
            'checkout_flutterwave' => false,
            'remove_powered_by_badge' => false,
            'services_on_storefront' => false,
            'visitor_language_switch' => false,
            'owner_self_edit_look' => false,
            'rebuild_mode' => 'scheduled',
            'custom_domain' => false,
        ],
        'enterprise' => [
            'storefront_enabled' => true,
            'allowed_presets' => 'all',
            'custom_accent_colour' => true,
            'max_online_products' => null,
            'checkout_whatsapp' => true,
            'checkout_transfer_mobile_money' => true,
            'checkout_pay_on_delivery' => true,
            'checkout_paystack' => true,
            'checkout_flutterwave' => true,
            'remove_powered_by_badge' => true,
            'services_on_storefront' => true,
            'visitor_language_switch' => true,
            'owner_self_edit_look' => true,
            'rebuild_mode' => 'on_demand',
            'custom_domain' => true,
        ],
    ],
];
