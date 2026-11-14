<?php

return [
    'enabled' => (bool) env('PRODUCT_IMAGES_ENABLED', false),
    'disk' => env('PRODUCT_IMAGES_DISK', 'r2'),
    'incoming_disk' => env('PRODUCT_IMAGES_INCOMING_DISK', 'r2_incoming'),
    'public_base_url' => env('R2_PUBLIC_BASE_URL'),
    'max_bytes' => 262144,
    'upload_ttl_seconds' => 300,
    'allowed_types' => [
        'image/webp' => 'webp',
        'image/jpeg' => 'jpg',
        'image/png' => 'png',
    ],
];
