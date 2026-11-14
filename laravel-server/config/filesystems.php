<?php

$r2Disk = fn (?string $bucket) => [
    'driver' => 's3',
    'key' => env('R2_ACCESS_KEY_ID'),
    'secret' => env('R2_SECRET_ACCESS_KEY'),
    'region' => 'auto',
    'bucket' => $bucket,
    'endpoint' => env('R2_ENDPOINT', env('R2_ACCOUNT_ID') ? 'https://'.env('R2_ACCOUNT_ID').'.r2.cloudflarestorage.com' : null),
    'use_path_style_endpoint' => true,
    'throw' => true,
    'report' => false,
];

return [
    'disks' => [
        'r2' => $r2Disk(env('R2_BUCKET')),
        'r2_incoming' => $r2Disk(env('R2_INCOMING_BUCKET')),
    ],
];
