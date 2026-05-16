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
use App\Http\Controllers\Api\Web\StoreController;

// Admin Controllers
use App\Http\Controllers\Api\Admin\AdminController;

// App Controllers
use App\Http\Controllers\Api\App\MedicineController;
use App\Http\Controllers\Api\App\InventoryController;
use App\Http\Controllers\Api\App\SaleController;
use App\Http\Controllers\Api\App\CustomerController;
use App\Http\Controllers\Api\App\SupplierController;
use App\Http\Controllers\Api\App\CategoryController;
use App\Http\Controllers\Api\App\SyncController;
use App\Http\Controllers\Api\BroadcastController;

Route::prefix('v1')->group(function () {
    // Public Routes
    Route::post('/login', [AuthController::class, 'login']);
    Route::post('/register', [AuthController::class, 'register']);
    Route::post('/forgot-password', [AuthController::class, 'forgotPassword']);
    Route::post('/reset-password', [AuthController::class, 'resetPassword']);
    Route::get('/health', function () {
        return response()->json(['status' => 'ok', 'timestamp' => now()]);
    });

    // Webhooks (Public)
    Route::post('/webhooks/paystack', [\App\Http\Controllers\Api\Web\PaymentController::class, 'handlePaystack']);
    Route::post('/webhooks/flutterwave', [\App\Http\Controllers\Api\Web\PaymentController::class, 'handleFlutterwave']);

    // Protected Routes
    Route::middleware('auth:sanctum')->group(function () {
        Route::post('/logout', [AuthController::class, 'logout']);
        Route::get('/user', [AuthController::class, 'user']);
        Route::post('/refresh', [AuthController::class, 'refresh']);
        Route::prefix('profile')->group(function () {
            Route::post('/update', [AuthController::class, 'updateProfile']);
            Route::post('/set-pin', [AuthController::class, 'updatePin']);
            Route::post('/change-password', [AuthController::class, 'changePassword']);
        });

        // --- WEB DASHBOARD ROUTES ---
        Route::prefix('dashboard')->middleware('subscription:remote_dashboard')->group(function () {
            Route::get('/summary', [DashboardController::class, 'summary']);
            Route::post('/reset', [DashboardController::class, 'resetData']);
        });
        Route::get('/notifications', [NotificationController::class, 'index']);
        Route::post('/notifications/{id}/read', [NotificationController::class, 'markAsRead']);
        Route::get('/broadcasts', [BroadcastController::class, 'index']);
        Route::apiResource('staff', StaffController::class)->middleware(['can:manage-staff', 'subscription']);
        Route::apiResource('stores', StoreController::class);

        Route::prefix('subscription')->group(function () {
            Route::get('/status', [SubscriptionController::class, 'status']);
            Route::post('/verify-license', [SubscriptionController::class, 'verifyLicense']);
            Route::post('/pay', [SubscriptionController::class, 'initiatePayment']);
            Route::post('/verify', [SubscriptionController::class, 'verifyPayment']);
            Route::get('/billing-history', [SubscriptionController::class, 'billingHistory']);
        });

        // Backups
        Route::prefix('backups')->middleware('subscription')->group(function () {
            Route::post('/upload', [BackupController::class, 'upload']);
            Route::get('/', [BackupController::class, 'list']);
            Route::get('/{backup}/download', [BackupController::class, 'download']);
        });

        // Activity Logs
        Route::get('/logs', [ActivityLogController::class, 'index'])->middleware('subscription');

        // Publicly accessible within authenticated session (for impersonation return)
        Route::post('/admin/restore-session', [AdminController::class, 'restoreSession']);

        Route::middleware(['can:manage-platform', 'subscription'])->prefix('admin')->group(function () {
            Route::get('/summary', [AdminController::class, 'summary']);
            Route::get('/pharmacies', [AdminController::class, 'pharmacies']);
            Route::post('/pharmacies', [AdminController::class, 'registerPharmacy']);
            Route::post('/pharmacies/{id}/suspend', [AdminController::class, 'suspendPharmacy']);
            Route::get('/products', [AdminController::class, 'products']);
            Route::post('/products/standardize', [AdminController::class, 'standardize']);
            Route::get('/users', [AdminController::class, 'users']);
            Route::get('/health', [AdminController::class, 'health']);
            Route::post('/users/{id}/deactivate', [AdminController::class, 'deactivateUser']);
            Route::post('/users/{id}/reset-password', [AdminController::class, 'forcePasswordReset']);
            Route::post('/users/{id}/notify', [AdminController::class, 'notifyUser']);
            Route::post('/users/bulk-notify', [AdminController::class, 'bulkNotify']);
            Route::get('/search', [AdminController::class, 'search']);
            Route::post('/pharmacies/{id}/impersonate', [AdminController::class, 'impersonatePharmacy']);

            // Broadcasts
            Route::prefix('broadcasts')->middleware('subscription:broadcast_create')->group(function () {
                Route::get('/', [BroadcastController::class, 'adminIndex']);
                Route::post('/', [BroadcastController::class, 'store']);
                Route::put('/{id}', [BroadcastController::class, 'update']);
                Route::patch('/{id}/toggle', [BroadcastController::class, 'toggle']);
                Route::delete('/{id}', [BroadcastController::class, 'destroy']);
            });
        });
        // --- APP / TERMINAL ROUTES ---
        Route::prefix('app')->middleware('subscription')->group(function () {
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
