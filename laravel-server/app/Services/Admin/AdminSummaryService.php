<?php

namespace App\Services\Admin;

use App\Models\ActivityLog;
use App\Models\Product;
use App\Models\Sale;
use App\Models\Store;
use App\Models\User;

class AdminSummaryService
{
    public function getGlobalSummary()
    {
        $last7Days = now()->subDays(7);

        $totalStores = Store::count();
        $prevStores = Store::where('created_at', '<', $last7Days)->count();
        $storeChange = $this->calculateChange($totalStores, $prevStores);

        $activeUsers = User::where('is_active', true)
            ->where('role', '!=', 'super_admin')
            ->count();
        $prevActiveUsers = User::where('is_active', true)
            ->where('role', '!=', 'super_admin')
            ->where('created_at', '<', $last7Days)
            ->count();
        $userChange = $this->calculateChange($activeUsers, $prevActiveUsers);

        $totalRevenue = Sale::sum('total_amount');
        $prevRevenue = Sale::where('created_at', '<', $last7Days)->sum('total_amount');
        $revenueChange = $this->calculateChange($totalRevenue, $prevRevenue);

        $globalInventory = Product::count();
        $prevInventory = Product::where('created_at', '<', $last7Days)->count();
        $inventoryChange = $this->calculateChange($globalInventory, $prevInventory);

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

        $syncTotal = ActivityLog::where('action', 'like', 'SYNC_%')->count();
        $syncSuccess = ActivityLog::where('action', 'SYNC_SUCCESS')->count();
        $syncRate = $syncTotal > 0 ? round(($syncSuccess / $syncTotal) * 100, 1) : 100;

        $liveOperations = [
            'total_requests' => number_format(ActivityLog::count()),
            'sync_success_rate' => $syncRate.'%',
            'active_connections' => number_format(User::where('is_active', true)->where('role', '!=', 'super_admin')->count()),
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
                    'change' => ($storeChange >= 0 ? '+' : '').number_format($storeChange, 1).'%',
                    'trend' => $storeChange >= 0 ? 'up' : 'down',
                    'icon' => 'Store',
                    'color' => 'indigo',
                ],
                [
                    'name' => 'Active Users',
                    'value' => number_format($activeUsers),
                    'change' => ($userChange >= 0 ? '+' : '').number_format($userChange, 1).'%',
                    'trend' => $userChange >= 0 ? 'up' : 'down',
                    'icon' => 'Users',
                    'color' => 'blue',
                ],
                [
                    'name' => 'Platform Revenue',
                    'value' => '₦'.number_format($totalRevenue / 1000000, 1).'M',
                    'change' => ($revenueChange >= 0 ? '+' : '').number_format($revenueChange, 1).'%',
                    'trend' => $revenueChange >= 0 ? 'up' : 'down',
                    'icon' => 'TrendingUp',
                    'color' => 'emerald',
                ],
                [
                    'name' => 'Global Inventory',
                    'value' => number_format($globalInventory / 1000, 1).'k',
                    'change' => ($inventoryChange >= 0 ? '+' : '').number_format($inventoryChange, 1).'%',
                    'trend' => $inventoryChange >= 0 ? 'up' : 'down',
                    'icon' => 'Package',
                    'color' => 'amber',
                ],
            ],
            'recent_stores' => $recentStores,
            'live_operations' => $liveOperations,
            'security_alerts' => $securityAlerts,
        ];
    }

    private function calculateChange($current, $previous)
    {
        if ($previous == 0) {
            return $current > 0 ? 100 : 0;
        }

        return (($current - $previous) / $previous) * 100;
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
