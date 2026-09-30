<?php

return [
    'max_upload_kilobytes' => (int) env('BACKUP_MAX_UPLOAD_KB', 102400),

    'tenant_quota_kilobytes' => (int) env('BACKUP_TENANT_QUOTA_KB', 512000),

    'retention_days' => (int) env('BACKUP_RETENTION_DAYS', 60),

    'allowed_extensions' => ['zip', 'json', 'sqlite', 'db'],
];
