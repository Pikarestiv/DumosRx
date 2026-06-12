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
    'admin_emails' => explode(',', env('ADMIN_EMAILS', 'admin@dumosrx.com')),
];
