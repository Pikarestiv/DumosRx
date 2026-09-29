<?php

namespace App\Services\Admin;

use App\Http\Controllers\Api\AccountManagerController;
use App\Models\ActivityLog;
use App\Models\Store;
use App\Models\Subscription;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * The single-store payload behind the admin panel's Store Details page.
 * Deliberately separate from AdminStoreService (which owns the fleet list
 * and the write actions) so neither file grows past the repo's file-size
 * rule, and so the detail payload can evolve without touching the list.
 *
 * It does not embed the store's staff list: that comes from
 * GET /admin/users?account_type=staff&store_id=..., the same endpoint the
 * owner's profile dialog uses, so one filter serves both surfaces.
 */
class AdminStoreDetailService
{
    private const RECENT_ACTIVITY_LIMIT = 8;

    private const RECENT_TRANSACTION_LIMIT = 5;

    public function __construct(
        private AdminStoreService $adminStoreService,
        private AdminStoreMetricsService $metricsService,
    ) {
    }

    public function getStoreDetail(string $storeId): ?array
    {
        $store = Store::withTrashed()
            ->with(['user'])
            ->addSelect(['total_revenue' => AdminStoreService::revenueSubquery()])
            ->find($storeId);

        if (!$store) {
            return null;
        }

        $owner = $store->user;
        $manager = AccountManagerController::resolveFor($owner);
        $billing = $this->adminStoreService->getBillingHistoryForStore($storeId);

        return [
            'id' => $store->id,
            'name' => $store->name,
            'store_slug' => $store->store_slug,
            'store_type' => $store->store_type,
            'address' => $store->address,
            'phone' => $store->phone,
            'email' => $store->email,
            'location' => $store->location,
            'currency' => $store->currency ?: 'NGN',
            'timezone' => $store->timezone ?: 'UTC',
            'vat_percentage' => $store->vat_percentage,
            'pcn_license' => $store->pcn_license,
            'registration_number' => $store->registration_number,
            'status' => $store->status ?: 'Active',
            'suspension_reason' => $store->suspension_reason,
            'is_demo' => (bool) $store->is_demo,
            'created_at' => $store->created_at?->format('M d, Y'),
            'revenue' => '₦'.number_format($store->total_revenue ?? 0),
            'owner' => $this->ownerPayload($owner),
            'subscription' => $this->subscriptionPayload($owner),
            'account_manager' => $manager ? [
                'id' => $manager->id,
                'name' => trim("{$manager->first_name} {$manager->last_name}"),
                'email' => $manager->email,
            ] : null,
            'account_manager_is_explicit' => (bool) ($owner?->account_manager_id),
            'sync' => [
                'device_id' => $store->device_id,
                'auto_sync_enabled' => (bool) $store->auto_sync_enabled,
                'auto_sync_interval' => $store->auto_sync_interval,
                'last_sync_at' => $store->last_sync_at?->toIso8601String(),
                'last_sync_human' => $store->last_sync_at?->diffForHumans() ?? 'Never',
            ],
            'storefront' => [
                'online_store_enabled' => (bool) $store->online_store_enabled,
                'store_slug' => $store->store_slug,
                'pending_rebuild' => $store->storefront_dirty_at !== null,
                'dirty_since' => $store->storefront_dirty_at?->diffForHumans(),
            ],
            'payments' => [
                'paystack_connected' => !empty($store->paystack_subaccount_code),
                'subaccount_code' => $store->paystack_subaccount_code,
                'bank_code' => $store->paystack_bank_code,
                'account_number_last4' => $store->paystack_account_number_last4,
                'require_payment_account' => (bool) $store->require_payment_account,
                'enabled_payment_methods' => is_array($store->enabled_payment_methods)
                    ? array_values($store->enabled_payment_methods)
                    : [],
            ],
            'is_archived' => $store->trashed(),
            'archived_at' => $store->deleted_at?->format('M d, Y'),
            'deletion_reason' => $store->deletion_reason,
            'counts' => $this->countsPayload($store),
            'business_metrics' => $this->metricsService->businessMetrics($store),
            'operational_metrics' => $this->metricsService->operationalMetrics($store),
            'recent_transactions' => collect($billing['transactions'] ?? [])
                ->take(self::RECENT_TRANSACTION_LIMIT)
                ->values(),
            'recent_activity' => $this->recentActivity($store->id),
        ];
    }

    private function ownerPayload(?User $owner): ?array
    {
        if (!$owner) {
            return null;
        }

        return [
            'id' => $owner->id,
            'name' => trim("{$owner->first_name} {$owner->last_name}"),
            'email' => $owner->email,
            'phone' => $owner->phone,
            'role' => $owner->role,
            'status' => $owner->is_active ? 'Active' : 'Inactive',
            'last_login_human' => $owner->last_login_at?->diffForHumans() ?? 'Never',
            'joined_at' => $owner->created_at?->format('M d, Y'),
            'deletion_requested' => $owner->deletion_requested_at !== null,
        ];
    }

    private function subscriptionPayload(?User $owner): ?array
    {
        if (!$owner) {
            return null;
        }

        $subscription = Subscription::where('user_id', $owner->id)
            ->orderByDesc('created_at')
            ->first();

        if (!$subscription) {
            return null;
        }

        return [
            'plan' => $subscription->plan_name,
            'status' => $subscription->status,
            'is_trial' => (bool) $subscription->is_trial,
            'start_date' => $subscription->start_date?->format('M d, Y'),
            'end_date' => $subscription->end_date?->format('M d, Y'),
            'days_remaining' => $subscription->end_date
                ? (int) max(0, ceil(now()->diffInDays($subscription->end_date, false)))
                : null,
        ];
    }

    private function countsPayload(Store $store): array
    {
        return [
            'staff' => User::where('store_id', $store->id)->count(),
            'products' => DB::table('products')->where('store_id', $store->id)->count(),
            'customers' => DB::table('customers')->where('store_id', $store->id)->count(),
            'sales' => DB::table('sales')->where('store_id', $store->id)->count(),
        ];
    }

    private function recentActivity(string $storeId)
    {
        return ActivityLog::where('store_id', $storeId)
            ->with('user:id,first_name,last_name')
            ->orderByDesc('created_at')
            ->limit(self::RECENT_ACTIVITY_LIMIT)
            ->get()
            ->map(fn ($log) => [
                'id' => $log->id,
                'action' => $log->action,
                'description' => $log->description,
                'status' => $log->status,
                'actor' => $log->user ? trim("{$log->user->first_name} {$log->user->last_name}") : null,
                'at' => $log->created_at?->diffForHumans(),
            ]);
    }
}
