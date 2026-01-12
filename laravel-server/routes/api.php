<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function () {
    // Public Routes
    Route::post('/login', [AuthController::class, 'login']);
    Route::post('/register', [AuthController::class, 'register']);
    Route::get('/health', function () {
        return response()->json(['status' => 'ok', 'timestamp' => now()]);
    });

    // Protected Routes
    Route::middleware('auth:sanctum')->group(function () {
        Route::post('/logout', [AuthController::class, 'logout']);
        Route::get('/user', [AuthController::class, 'user']);

        // Staff Management
        Route::apiResource('staff', StaffController::class)->middleware('can:manage-staff');

        // Subscriptions
        Route::get('/subscription/status', [SubscriptionController::class, 'status']);
        Route::post('/subscription/verify', [SubscriptionController::class, 'verifyLicense']);
        Route::post('/subscription/pay', [SubscriptionController::class, 'initiatePayment']);

        // Backups
        Route::post('/backups/upload', [BackupController::class, 'upload']);
        Route::get('/backups', [BackupController::class, 'list']);
        Route::get('/backups/{backup}/download', [BackupController::class, 'download']);

        // Activity Logs
        Route::get('/logs', [ActivityLogController::class, 'index']);
    });
});

