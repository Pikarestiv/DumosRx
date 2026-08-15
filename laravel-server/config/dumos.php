<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Super Admin Emails
    |--------------------------------------------------------------------------
    |
    | A comma-separated list of emails that should receive critical system
    | alerts such as new registrations, first-time syncs, and payments.
    |
    */
    'admin_emails' => explode(',', env('ADMIN_EMAILS', 'admin@dumosrx.com, josh@dumostech.com')),

    /*
    |--------------------------------------------------------------------------
    | Sentry Admin API
    |--------------------------------------------------------------------------
    |
    | Internal integration token (event:read/project:read scope) used to pull
    | recent issues into the super-admin dashboard. Distinct from
    | SENTRY_LARAVEL_DSN (config/sentry.php), which is for this app's own
    | crash reporting, not reading issues back out.
    |
    */
    'sentry' => [
        'api_token' => env('SENTRY_API_TOKEN'),
        'org_slug' => env('SENTRY_ORG_SLUG', 'dumos-technologies'),
    ],
];
