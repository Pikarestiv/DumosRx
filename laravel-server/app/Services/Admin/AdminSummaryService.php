<?php

namespace App\Services\Admin;

use App\Models\ActivityLog;
use App\Models\Product;
use App\Models\Store;
use App\Models\Subscription;
use App\Models\SyncHealthDaily;
use App\Models\User;

class AdminSummaryService
{
    private const OWNER_ROLE = 'store_owner';

    private const STAFF_ROLES = ['admin', 'manager', 'specialist', 'sales_staff', 'auditor'];

    public function __construct(private AdminRevenueService $revenueService) {}

    public function getGlobalSummary()
    {
        $last7Days = now()->subDays(7);

        $totalStores = Store::count();
        $newStores = Store::where('created_at', '>=', $last7Days)->count();

        $activeOwners = User::where('is_active', true)
            ->where('role', self::OWNER_ROLE)
            ->count();
        $activeStaff = User::where('is_active', true)
            ->whereIn('role', self::STAFF_ROLES)
            ->count();

        $catalogProducts = Product::count();
        $newProducts = Product::where('created_at', '>=', $last7Days)->count();

        $activeSubscriptions = $this->liveSubscriptionOwners(false);
        $activeTrials = $this->liveSubscriptionOwners(true);

        $storesSyncedToday = Store::where('last_sync_at', '>=', now()->subDay())->count();

        $recentStores = Store::with('user')
            ->latest()
            ->limit(10)
            ->get()
            ->map(function ($store) {
                $lastSyncAt = $store->last_sync_at && $store->last_sync_at->isFuture()
                    ? now()
                    : $store->last_sync_at;

                $syncStatus = 'Inactive';
                $lastSyncHuman = 'Never synced';
                if ($lastSyncAt) {
                    $minutesSinceSync = $lastSyncAt->diffInMinutes(now());
                    if ($minutesSinceSync < 60) {
                        $syncStatus = 'Active';
                    } elseif ($minutesSinceSync < 1440) {
                        $syncStatus = 'Away';
                    }
                    $lastSyncHuman = $lastSyncAt->diffForHumans();
                }

                return [
                    'id' => $store->id,
                    'name' => $store->name,
                    'owner' => $store->user ? $store->user->first_name.' '.$store->user->last_name : 'N/A',
                    'plan' => ($store->user && $store->user->subscriptions->isNotEmpty()) ? ucwords($store->user->subscriptions->sortByDesc('created_at')->first()->plan_name) : 'Basic',
                    'status' => $store->status ?: 'Active',
                    'sync_status' => $syncStatus,
                    'last_sync_human' => $lastSyncHuman,
                    'date' => $store->created_at->diffForHumans(),
                ];
            });

        $liveOperations = [
            'audit_log_entries' => ActivityLog::count(),
            'sync_success_rate_today' => $this->syncSuccessRateToday(),
        ];

        $securityAlerts = ActivityLog::whereIn('action', [
            'LOGIN_FAILURE',
            'UNAUTHORIZED_ACCESS',
            'DATA_EXPORT',
            'ACCOUNT_DELETION_REQUESTED',
            'ACCOUNT_DELETION_CANCELLED',
        ])
            ->latest()
            ->limit(5)
            ->get()
            ->map(function ($log) {
                return [
                    'title' => $this->getAlertTitle($log->action),
                    'source' => $log->user ? $log->user->first_name."'s Store" : 'System',
                    'time' => $log->created_at->diffForHumans(),
                ];
            });

        return [
            'stats' => [
                [
                    'name' => 'Total Stores',
                    'value' => number_format($totalStores),
                    'change' => $this->weeklyDelta($newStores),
                    'icon' => 'Store',
                    'color' => 'indigo',
                ],
                [
                    'name' => 'Active Users',
                    'value' => number_format($activeOwners),
                    'change' => number_format($activeStaff).' staff',
                    'icon' => 'Users',
                    'color' => 'blue',
                ],
                [
                    'name' => 'Subscription Revenue',
                    'totals_by_currency' => $this->revenueService->getOverview()['totals_by_currency'],
                    'icon' => 'TrendingUp',
                    'color' => 'emerald',
                ],
                [
                    'name' => 'Active Subscriptions',
                    'value' => number_format($activeSubscriptions),
                    'change' => number_format($activeTrials).' on trial',
                    'icon' => 'BadgeCheck',
                    'color' => 'violet',
                ],
                [
                    'name' => 'Catalog Products',
                    'value' => number_format($catalogProducts),
                    'change' => $this->weeklyDelta($newProducts),
                    'icon' => 'Package',
                    'color' => 'amber',
                ],
                [
                    'name' => 'Stores Synced (24h)',
                    'value' => number_format($storesSyncedToday),
                    'change' => number_format($totalStores).' total',
                    'icon' => 'RefreshCw',
                    'color' => 'sky',
                ],
            ],
            'recent_stores' => $recentStores,
            'live_operations' => $liveOperations,
            'security_alerts' => $securityAlerts,
        ];
    }

    /** Today's bucket only. `sync_health_daily` is day-granular, so a rolling
     * 24h window would silently include all of yesterday too. */
    private function syncSuccessRateToday(): ?string
    {
        $totals = SyncHealthDaily::where('date', '>=', now()->startOfDay())
            ->selectRaw('COALESCE(SUM(changes_accepted), 0) as accepted, COALESCE(SUM(changes_refused), 0) as refused')
            ->first();

        $accepted = (int) ($totals->accepted ?? 0);
        $refused = (int) ($totals->refused ?? 0);
        $total = $accepted + $refused;

        if ($total === 0) {
            return null;
        }

        return round(($accepted / $total) * 100, 1).'%';
    }

    private function liveSubscriptionOwners(bool $trial): int
    {
        return Subscription::where('status', 'active')
            ->where('is_trial', $trial)
            ->where('end_date', '>=', now())
            ->distinct()
            ->count('user_id');
    }

    private function weeklyDelta(int $createdInLastWeek, string $verb = 'this week'): string
    {
        $suffix = $verb === 'this week' ? 'this week' : $verb.' this week';

        return '+'.number_format($createdInLastWeek).' '.$suffix;
    }

    private function getAlertTitle($action)
    {
        $map = [
            'LOGIN_FAILURE' => 'Multiple 401s',
            'UNAUTHORIZED_ACCESS' => 'Unauthorized Access Attempt',
            'DATA_EXPORT' => 'Large Export Initiated',
            'ACCOUNT_DELETION_REQUESTED' => 'Account Deletion Requested',
            'ACCOUNT_DELETION_CANCELLED' => 'Account Deletion Cancelled',
        ];

        return $map[$action] ?? 'Security Alert';
    }
}
