<?php

use App\Http\Controllers\Api\Admin\AdminController;
// Namespaced Controllers
use App\Http\Controllers\Api\Admin\MailController;
// Web Controllers
use App\Http\Controllers\Api\App\CategoryController;
use App\Http\Controllers\Api\App\CustomerController;
use App\Http\Controllers\Api\App\ProductController;
use App\Http\Controllers\Api\App\SaleController;
use App\Http\Controllers\Api\App\StockBatchController;
use App\Http\Controllers\Api\App\SupplierController;
use App\Http\Controllers\Api\App\SyncController;
use App\Http\Controllers\Api\AuthController;
// Admin Controllers
use App\Http\Controllers\Api\BroadcastController;
use App\Http\Controllers\Api\SystemConfigController;
// App Controllers
use App\Http\Controllers\Api\Web\ActivityLogController;
use App\Http\Controllers\Api\Web\BackupController;
use App\Http\Controllers\Api\Web\DashboardController;
use App\Http\Controllers\Api\Web\NotificationController;
use App\Http\Controllers\Api\Web\SessionController;
use App\Http\Controllers\Api\Web\StaffController;
use App\Http\Controllers\Api\Web\StoreController;
use App\Http\Controllers\Api\Web\SubscriptionController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function () {
    // Public Routes
    Route::get('/system-configs/{key}', [SystemConfigController::class, 'show']);
    Route::post('/support', [\App\Http\Controllers\Api\Web\FeedbackController::class, 'store']);
    Route::middleware('throttle:auth')->group(function () {
        Route::post('/login', [AuthController::class, 'login']);
        Route::post('/register', [AuthController::class, 'register']);
        Route::post('/forgot-password', [AuthController::class, 'forgotPassword']);
        Route::post('/reset-password', [AuthController::class, 'resetPassword']);
        Route::post('/verify-email', [AuthController::class, 'verifyEmail']);
        Route::post('/resend-verification', [AuthController::class, 'resendVerification']);
    });
    Route::get('/health', function () {
        return response()->json(['status' => 'ok', 'timestamp' => now()]);
    });

    // Tracking Routes
    Route::post('/track/download', [\App\Http\Controllers\Api\TrackController::class, 'download']);

    // Public Storefront
    Route::get('/storefront/{store_slug}', [\App\Http\Controllers\Api\Public\StorefrontController::class, 'show']);
    Route::post('/storefront/{store_slug}/checkout', [\App\Http\Controllers\Api\Public\StorefrontController::class, 'checkout']);

    // Webhooks (Public)
    Route::post('/webhooks/paystack', [\App\Http\Controllers\Api\Web\PaymentController::class, 'handlePaystack']);
    Route::post('/webhooks/flutterwave', [\App\Http\Controllers\Api\Web\PaymentController::class, 'handleFlutterwave']);

    Route::get('/dev/clear-stock-batches', function () {
        \Illuminate\Support\Facades\DB::table('stock_batches')->delete();
        \Illuminate\Support\Facades\DB::table('categories')->delete();

        return 'Cleared';
    });

    // Protected Routes
    Route::middleware(['auth:sanctum', 'account_status', \App\Http\Middleware\EnsureEmailIsVerified::class, 'throttle:60,1'])->group(function () {
        Route::post('/logout', [AuthController::class, 'logout']);
        Route::get('/user', [AuthController::class, 'user']);
        Route::post('/refresh', [AuthController::class, 'refresh']);
        Route::prefix('profile')->group(function () {
            Route::post('/update', [AuthController::class, 'updateProfile']);
            Route::post('/set-pin', [AuthController::class, 'updatePin']);
            Route::post('/change-password', [AuthController::class, 'changePassword']);
            Route::post('/request-deletion', [AuthController::class, 'requestDeletion']);
            Route::post('/cancel-deletion', [AuthController::class, 'cancelDeletion']);
        });

        Route::prefix('sessions')->group(function () {
            Route::get('/', [SessionController::class, 'index']);
            Route::post('/revoke-all', [SessionController::class, 'revokeAll']);
            Route::delete('/{id}', [SessionController::class, 'destroy']);
        });

        // --- WEB DASHBOARD ROUTES ---
        Route::prefix('dashboard')->group(function () {
            Route::get('/summary', [DashboardController::class, 'summary']);
            Route::post('/reset', [DashboardController::class, 'resetData']);
            Route::post('/send-summary', [\App\Http\Controllers\Api\StoreSummaryController::class, 'sendSummary'])->middleware('subscription:web_dashboard');
        });
        Route::get('/alerts', [NotificationController::class, 'index']);
        Route::post('/alerts/{id}/read', [NotificationController::class, 'markAsRead']);
        Route::get('/announcements', [BroadcastController::class, 'index']);

        // Stock Movements, Adjustments & Purchase Orders
        Route::get('/stock-movements', [\App\Http\Controllers\Api\App\StockMovementController::class, 'index']);
        Route::get('/stock-adjustments', [\App\Http\Controllers\Api\App\StockMovementController::class, 'adjustments']);
        Route::get('/purchase-orders', [\App\Http\Controllers\Api\App\PurchaseOrderController::class, 'index']);

        Route::apiResource('staff', StaffController::class)->middleware(['permission:manage_staff', 'subscription']);
        Route::get('stores/check-slug', [StoreController::class, 'checkSlug']);
        Route::apiResource('stores', StoreController::class);

        Route::prefix('subscription')->group(function () {
            Route::get('/status', [SubscriptionController::class, 'status']);
            Route::post('/verify-license', [SubscriptionController::class, 'verifyLicense']);
            Route::post('/validate-coupon', [SubscriptionController::class, 'validateCoupon']);
            Route::post('/pay', [SubscriptionController::class, 'initiatePayment']);
            Route::post('/verify', [SubscriptionController::class, 'verifyPayment']);
            Route::get('/billing-history', [SubscriptionController::class, 'billingHistory']);
            Route::get('/referral-stats', [SubscriptionController::class, 'getReferralStats']);
        });

        // Backups
        Route::prefix('backups')->middleware('subscription')->group(function () {
            Route::post('/upload', [BackupController::class, 'upload']);
            Route::get('/', [BackupController::class, 'list']);
            Route::get('/{backup}/download', [BackupController::class, 'download']);
        });

        // Activity Logs
        Route::get('/logs', [ActivityLogController::class, 'index'])->middleware(['permission:view_reports', 'subscription']);
        Route::post('/logs/client-error', [ActivityLogController::class, 'logClientError']);

        // Publicly accessible within authenticated session (for impersonation return)
        Route::post('/admin/restore-session', [AdminController::class, 'restoreSession']);

        Route::middleware(['permission:manage_platform', 'subscription'])->prefix('admin')->group(function () {
            Route::get('/summary', [AdminController::class, 'summary']);
            Route::get('/stores', [AdminController::class, 'stores']);
            Route::post('/stores', [AdminController::class, 'registerStore']);
            Route::post('/stores/{id}/suspend', [AdminController::class, 'suspendStore']);
            Route::post('/stores/{id}/unsuspend', [AdminController::class, 'unsuspendStore']);
            Route::post('/stores/{id}/grant-trial', [AdminController::class, 'grantTrial']);
            Route::post('/users/{id}/grant-trial', [AdminController::class, 'grantUserTrial']);
            Route::get('/products', [AdminController::class, 'products']);
            Route::post('/products/standardize', [AdminController::class, 'standardize']);
            Route::get('/users', [AdminController::class, 'users']);
            Route::post('/users', [AdminController::class, 'createPlatformAdmin']);
            Route::get('/health', [AdminController::class, 'health']);
            Route::delete('/users/{id}', [AdminController::class, 'deleteUser']);
            Route::post('/users/{id}/deactivate', [AdminController::class, 'deactivateUser']);
            Route::post('/users/{id}/reactivate', [AdminController::class, 'reactivateUser']);
            Route::post('/users/{id}/reset-password', [AdminController::class, 'forcePasswordReset']);
            Route::post('/users/{id}/notify', [AdminController::class, 'notifyUser']);
            Route::post('/users/bulk-notify', [AdminController::class, 'bulkNotify']);
            Route::get('/search', [AdminController::class, 'search']);
            Route::post('/stores/{id}/impersonate', [AdminController::class, 'impersonateStore']);

            // Email Templates
            Route::apiResource('email-templates', \App\Http\Controllers\Api\Admin\EmailTemplateController::class)->only(['index', 'show', 'update']);

            // Feedback
            Route::get('/feedback', [\App\Http\Controllers\Api\Web\FeedbackController::class, 'index']);
            Route::post('/feedback/{id}/status', [\App\Http\Controllers\Api\Web\FeedbackController::class, 'updateStatus']);

            // Broadcasts
            Route::prefix('announcements')->middleware('subscription:broadcast_create')->group(function () {
                Route::get('/', [BroadcastController::class, 'adminIndex']);
                Route::post('/', [BroadcastController::class, 'store']);
                Route::put('/{id}', [BroadcastController::class, 'update']);
                Route::patch('/{id}/toggle', [BroadcastController::class, 'toggle']);
                Route::delete('/{id}', [BroadcastController::class, 'destroy']);
            });

            // Emails
            Route::post('/mail/send', [MailController::class, 'send']);

            // System Configs
            Route::put('/system-configs/{key}', [SystemConfigController::class, 'update']);

            // Coupons
            Route::get('/coupons', [\App\Http\Controllers\Api\Admin\CouponController::class, 'index']);
            Route::post('/coupons', [\App\Http\Controllers\Api\Admin\CouponController::class, 'store']);
            Route::put('/coupons/{coupon}/toggle', [\App\Http\Controllers\Api\Admin\CouponController::class, 'toggleActive']);
            Route::get('/coupons/{coupon}/usages', [\App\Http\Controllers\Api\Admin\CouponController::class, 'usages']);
            Route::delete('/coupons/{coupon}', [\App\Http\Controllers\Api\Admin\CouponController::class, 'destroy']);

            // Referrals
            Route::get('/referrals/summary', [\App\Http\Controllers\Api\Admin\ReferralController::class, 'getSummary']);
            Route::get('/referrals', [\App\Http\Controllers\Api\Admin\ReferralController::class, 'getReferrals']);
            Route::get('/referrals/transactions', [\App\Http\Controllers\Api\Admin\ReferralController::class, 'getTransactions']);
            Route::post('/referrals/adjust-credits', [\App\Http\Controllers\Api\Admin\ReferralController::class, 'adjustCredits']);
            Route::get('/referrals/settings', [\App\Http\Controllers\Api\Admin\ReferralController::class, 'getSettings']);
            Route::put('/referrals/settings', [\App\Http\Controllers\Api\Admin\ReferralController::class, 'updateSettings']);
        });
        // --- APP / TERMINAL ROUTES ---
        Route::prefix('app')->middleware('subscription')->group(function () {
            // Medicine Database
            Route::get('/products/search', [ProductController::class, 'search']);
            Route::apiResource('products', ProductController::class);

            // Inventory
            Route::prefix('stock-batches')->group(function () {
                Route::get('/low-stock', [StockBatchController::class, 'lowStock']);
                Route::get('/expiring', [StockBatchController::class, 'expiring']);
                Route::get('/value', [StockBatchController::class, 'value']);
                Route::get('/', [StockBatchController::class, 'index']);
            });

            // Sales & POS
            Route::prefix('sales')->group(function () {
                Route::get('/daily', [SaleController::class, 'dailySales']);
                Route::get('/top-products', [SaleController::class, 'topProducts']);
                Route::apiResource('/', SaleController::class)->only(['index', 'store', 'show']);
            });

            // CRM & Supply Chain
            Route::apiResource('customers', CustomerController::class);
            Route::apiResource('suppliers', SupplierController::class);
            Route::apiResource('categories', CategoryController::class);

            // Online Orders
            Route::get('/online-orders', [\App\Http\Controllers\Api\OnlineOrderController::class, 'index']);
            Route::post('/online-orders/{id}/fulfill', [\App\Http\Controllers\Api\OnlineOrderController::class, 'markFulfilled']);

            // Sync
            Route::post('/sync/push', [SyncController::class, 'push']);
            Route::post('/sync/pull', [SyncController::class, 'pull']);
        });

    });
});
