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

    /*
    |--------------------------------------------------------------------------
    | GitHub Actions (storefront rebuild)
    |--------------------------------------------------------------------------
    |
    | Personal access token (classic, `repo` scope) used to trigger a
    | repository_dispatch event on the deploy-web.yml workflow when a
    | store's storefront goes online/offline or changes its slug. See
    | App\Console\Commands\RebuildStorefrontIfDirty.
    |
    */
    'github' => [
        'token' => env('GITHUB_TOKEN'),
        // "owner/repo" - no default; must be set explicitly in .env.
        'repo' => env('GITHUB_REPO'),
    ],

    /*
    |--------------------------------------------------------------------------
    | Storefront rebuild confirmation (inbound)
    |--------------------------------------------------------------------------
    |
    | The inbound counterpart to the outbound GitHub token above: the shared
    | secret deploy-web.yml presents (X-Storefront-Rebuild-Token) to confirm a
    | storefront rebuild actually shipped, so storefront_dirty_at is cleared on
    | success rather than on GitHub merely accepting the dispatch. Must match
    | the workflow's STOREFRONT_REBUILD_TOKEN repository secret.
    |
    | Unset (the default) keeps the older, optimistic clear-on-dispatch
    | behaviour, so the two sides can be configured in either order without a
    | window where every scheduled run re-dispatches a rebuild.
    |
    | rebuild_confirmation_timeout: how long to wait for a confirmation before
    | assuming the workflow died and re-dispatching. Longer than a full
    | build+FTP deploy takes.
    |
    */
    'storefront' => [
        'rebuild_token' => env('STOREFRONT_REBUILD_TOKEN'),
        'rebuild_confirmation_timeout' => (int) env('STOREFRONT_REBUILD_TIMEOUT_MINUTES', 45),
    ],
];
