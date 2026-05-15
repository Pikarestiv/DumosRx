<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

// Namespaced Controllers
use App\Http\Controllers\Api\AuthController;

// Web Controllers
use App\Http\Controllers\Api\Web\DashboardController;
use App\Http\Controllers\Api\Web\NotificationController;
use App\Http\Controllers\Api\Web\StaffController;
use App\Http\Controllers\Api\Web\SubscriptionController;
use App\Http\Controllers\Api\Web\BackupController;
use App\Http\Controllers\Api\Web\ActivityLogController;

// App Controllers
use App\Http\Controllers\Api\App\MedicineController;
use App\Http\Controllers\Api\App\InventoryController;
use App\Http\Controllers\Api\App\SaleController;
use App\Http\Controllers\Api\App\CustomerController;
use App\Http\Controllers\Api\App\SupplierController;
use App\Http\Controllers\Api\App\CategoryController;
use App\Http\Controllers\Api\App\SyncController;

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

        // --- WEB DASHBOARD ROUTES ---
        Route::prefix('dashboard')->group(function () {
            Route::get('/summary', [DashboardController::class, 'summary']);
            Route::post('/reset', [DashboardController::class, 'resetData']);
        });
        Route::get('/notifications', [NotificationController::class, 'index']);
        Route::apiResource('staff', StaffController::class)->middleware('can:manage-staff');

        Route::prefix('subscription')->group(function () {
            Route::get('/status', [SubscriptionController::class, 'status']);
            Route::post('/verify', [SubscriptionController::class, 'verifyLicense']);
            Route::post('/pay', [SubscriptionController::class, 'initiatePayment']);
        });

        // Backups
        Route::prefix('backups')->group(function () {
            Route::post('/upload', [BackupController::class, 'upload']);
            Route::get('/', [BackupController::class, 'list']);
            Route::get('/{backup}/download', [BackupController::class, 'download']);
        });

        // Activity Logs
        Route::get('/logs', [ActivityLogController::class, 'index']);

        // --- APP / TERMINAL ROUTES ---
        Route::prefix('app')->group(function () {
            // Medicine Database
            Route::get('/medicines/search', [MedicineController::class, 'search']);
            Route::apiResource('medicines', MedicineController::class);

            // Inventory
            Route::prefix('inventory')->group(function () {
                Route::get('/low-stock', [InventoryController::class, 'lowStock']);
                Route::get('/expiring', [InventoryController::class, 'expiring']);
                Route::get('/value', [InventoryController::class, 'value']);
                Route::get('/', [InventoryController::class, 'index']);
            });

            // Sales & POS
            Route::prefix('sales')->group(function () {
                Route::get('/daily', [SaleController::class, 'dailySales']);
                Route::get('/top-medicines', [SaleController::class, 'topMedicines']);
                Route::apiResource('/', SaleController::class)->only(['index', 'store', 'show']);
            });

            // CRM & Supply Chain
            Route::apiResource('customers', CustomerController::class);
            Route::apiResource('suppliers', SupplierController::class);
            Route::apiResource('categories', CategoryController::class);

            // Sync
            Route::post('/sync/push', [SyncController::class, 'push']);
            Route::post('/sync/pull', [SyncController::class, 'pull']);
        });

        // Legacy compatibility routes (to avoid breaking current frontend immediately)
        // Once frontend is updated, these can be removed
        Route::get('/dashboard/summary', [DashboardController::class, 'summary']);
        Route::post('/dashboard/reset', [DashboardController::class, 'resetData']);
        Route::get('/medicines/search', [MedicineController::class, 'search']);
        Route::get('/inventory/low-stock', [InventoryController::class, 'lowStock']);
        Route::get('/inventory/expiring', [InventoryController::class, 'expiring']);
        Route::get('/inventory/value', [InventoryController::class, 'value']);
        Route::get('/inventory', [InventoryController::class, 'index']);
        Route::get('/sales/daily', [SaleController::class, 'dailySales']);
        Route::get('/sales/top-medicines', [SaleController::class, 'topMedicines']);
        Route::apiResource('sales', SaleController::class)->only(['index', 'store', 'show']);
        Route::apiResource('customers', CustomerController::class);
        Route::apiResource('suppliers', SupplierController::class);
        Route::apiResource('categories', CategoryController::class);
        Route::post('/sync/push', [SyncController::class, 'push']);
        Route::post('/sync/pull', [SyncController::class, 'pull']);
        Route::post('/backups/upload', [BackupController::class, 'upload']);
        Route::get('/backups', [BackupController::class, 'list']);
        Route::get('/backups/{backup}/download', [BackupController::class, 'download']);
        Route::get('/logs', [ActivityLogController::class, 'index']);
    });
});
