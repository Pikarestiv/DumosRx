<?php

$r2Disk = fn (?string $bucket, string $keyEnv = 'R2_ACCESS_KEY_ID', string $secretEnv = 'R2_SECRET_ACCESS_KEY') => [
    'driver' => 's3',
    'key' => env($keyEnv),
    'secret' => env($secretEnv),
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
        'r2_backups' => $r2Disk(env('R2_BACKUP_BUCKET'), 'R2_BACKUP_ACCESS_KEY_ID', 'R2_BACKUP_SECRET_ACCESS_KEY'),
    ],
];
