<?php

namespace App\Services\Admin;

use App\Models\ActivityLog;
use App\Models\Product;
use App\Models\Store;
use App\Models\Subscription;
use App\Models\User;

class AdminSummaryService
{
    public function __construct(private AdminRevenueService $revenueService) {}

    public function getGlobalSummary()
    {
        $last7Days = now()->subDays(7);

        $totalStores = Store::count();
        $newStores = Store::where('created_at', '>=', $last7Days)->count();

        $activeUsers = User::where('is_active', true)
            ->where('role', '!=', 'super_admin')
            ->count();
        $newUsers = User::where('role', '!=', 'super_admin')
            ->where('created_at', '>=', $last7Days)
            ->count();

        $catalogProducts = Product::count();
        $newProducts = Product::where('created_at', '>=', $last7Days)->count();

        $activeSubscriptions = Subscription::where('status', 'active')->count();
        $activeTrials = Subscription::where('status', 'active')->where('is_trial', true)->count();

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

        $syncLogs = ActivityLog::where('action', 'like', 'SYNC_%')
            ->where('created_at', '>=', now()->subDay());
        $syncTotal = (clone $syncLogs)->count();
        $syncSuccess = (clone $syncLogs)->where('action', 'SYNC_SUCCESS')->count();

        $liveOperations = [
            'audit_log_entries' => ActivityLog::count(),
            'sync_success_rate_24h' => $syncTotal > 0
                ? round(($syncSuccess / $syncTotal) * 100, 1).'%'
                : null,
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
                    'value' => number_format($activeUsers),
                    'change' => $this->weeklyDelta($newUsers, 'joined'),
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
