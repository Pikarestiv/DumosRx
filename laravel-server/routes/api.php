<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\StaffController;
use App\Http\Controllers\SubscriptionController;
use App\Http\Controllers\BackupController;
use App\Http\Controllers\ActivityLogController;
use App\Http\Controllers\MedicineController;
use App\Http\Controllers\InventoryController;
use App\Http\Controllers\SaleController;
use App\Http\Controllers\CustomerController;
use App\Http\Controllers\SupplierController;
use App\Http\Controllers\CategoryController;

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


        // Medicine Database
        Route::get('/medicines/search', [MedicineController::class, 'search']);
        Route::apiResource('medicines', MedicineController::class);

        // Inventory
        Route::get('/inventory/low-stock', [InventoryController::class, 'lowStock']);
        Route::get('/inventory/expiring', [InventoryController::class, 'expiring']);
        Route::get('/inventory/value', [InventoryController::class, 'value']);
        Route::get('/inventory', [InventoryController::class, 'index']);

        // Sales & POS
        Route::get('/sales/daily', [SaleController::class, 'dailySales']);
        Route::get('/sales/top-medicines', [SaleController::class, 'topMedicines']);
        Route::apiResource('sales', SaleController::class)->only(['index', 'store', 'show']);

        // CRM & Supply Chain
        Route::apiResource('customers', CustomerController::class);
        Route::apiResource('suppliers', SupplierController::class);
        Route::apiResource('categories', CategoryController::class);

        // Activity Logs
        Route::get('/logs', [ActivityLogController::class, 'index']);
    });
});

