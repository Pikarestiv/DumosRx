<?php

return [
    // Currency every charge is expected to settle in. Verified against what
    // the provider reports before any payment is accepted.
    'currency' => env('PAYMENT_CURRENCY', 'NGN'),

    // How long a storefront payment intent may sit unclaimed before
    // storefront:sweep-payment-intents re-verifies it against the provider.
    'storefront_intent_stale_minutes' => (int) env('STOREFRONT_INTENT_STALE_MINUTES', 60),

    'paystack' => [
        'public_key' => env('PAYSTACK_PUBLIC_KEY'),
        'secret_key' => env('PAYSTACK_SECRET_KEY'),
        'merchant_email' => env('PAYSTACK_MERCHANT_EMAIL'),
    ],
    'flutterwave' => [
        'public_key' => env('FLUTTERWAVE_PUBLIC_KEY'),
        'secret_key' => env('FLUTTERWAVE_SECRET_KEY'),
        'encryption_key' => env('FLUTTERWAVE_ENCRYPTION_KEY'),
        // Webhook auth credential ("Secret Hash" in the Flutterwave
        // dashboard's webhook settings). Distinct from the encryption key,
        // which is only for encrypting card payloads.
        'secret_hash' => env('FLUTTERWAVE_SECRET_HASH'),
    ],
];
