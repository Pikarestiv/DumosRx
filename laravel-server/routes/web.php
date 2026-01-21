<?php

use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return 'DumosRx API is running. Access /api/v1 for endpoints.';
});

Route::get('/migrate-db', function () {
    if (request()->get('key') !== 'dumos-setup') {
        abort(403, 'Unauthorized');
    }

    try {
        \Illuminate\Support\Facades\Artisan::call('migrate --seed --force');
        return 'Database migrated and seeded successfully! <pre>' . \Illuminate\Support\Facades\Artisan::output() . '</pre>';
    } catch (\Exception $e) {
        return 'Error: ' . $e->getMessage();
    }
});

Route::get('/debug-config', function () {
    if (request()->get('key') !== 'dumos-setup') {
        abort(403, 'Unauthorized');
    }

    return response()->json([
        'session_driver' => config('session.driver'),
        'session_domain' => config('session.domain'),
        'session_secure' => config('session.secure'),
        'session_same_site' => config('session.same_site'),
        'sanctum_stateful' => config('sanctum.stateful'),
        'cors_allowed_origins' => config('cors.allowed_origins'),
        'cors_supports_credentials' => config('cors.supports_credentials'),
        'app_url' => config('app.url'),
    ]);
});
