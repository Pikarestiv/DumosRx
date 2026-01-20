<?php

use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
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
