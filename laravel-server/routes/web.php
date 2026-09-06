<?php

use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return 'DumosRx API is running. Access /api/v1 for endpoints.';
});

Route::get('/migrate-db', function () {
    $expectedKey = config('app.migrate_db_key');

    if (!$expectedKey || !hash_equals($expectedKey, (string) request()->get('key', ''))) {
        abort(403, 'Unauthorized');
    }

    try {
        \Illuminate\Support\Facades\Artisan::call('migrate --seed --force');
        return 'Database migrated and seeded successfully! <pre>' . \Illuminate\Support\Facades\Artisan::output() . '</pre>';
    } catch (\Exception $e) {
        return 'Error: ' . $e->getMessage();
    }
});


