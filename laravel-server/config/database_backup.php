<?php

return [
    'disk' => 'r2_backups',
    'bucket' => env('R2_BACKUP_BUCKET'),
    'public_key' => env('BACKUP_ENCRYPTION_PUBLIC_KEY'),
    'min_bytes' => (int) env('BACKUP_MIN_BYTES', 1024),
];
