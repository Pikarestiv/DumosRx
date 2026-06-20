<?php

namespace App\Services\Web;

use App\Models\Sale;
use App\Models\Inventory;
use App\Models\Customer;
use App\Models\ActivityLog;
use App\Models\Store;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Log;
use Carbon\Carbon;

class DashboardService
{
    /**
     * Get summary data for the web dashboard.
     */
    public function getSummary($user)
    {
        $userId = $user->id;
        
        // Date ranges
        $now = Carbon::now();
        $last7Days = $now->copy()->subDays(7);
        $prev7Days = $now->copy()->subDays(14);

        // Get store and cashier network for scoping
        $storeIds = Store::where('user_id', $userId)->pluck('id')->toArray();
        $userIds = User::whereIn('store_id', $storeIds)->pluck('id')->push($userId)->toArray();

        // 1. Sales Stats
        $totalSales = 0;
        $salesGrowth = 0;
        try {
            $totalSales = (float)Sale::whereIn('cashier_id', $userIds)->sum('total_amount');
            $salesThisWeek = (float)Sale::whereIn('cashier_id', $userIds)
                ->where('created_at', '>=', $last7Days)
                ->sum('total_amount');
            $salesPrevWeek = (float)Sale::whereIn('cashier_id', $userIds)
                ->where('created_at', '>=', $prev7Days)
                ->where('created_at', '<', $last7Days)
                ->sum('total_amount');
            
            if ($salesPrevWeek > 0) {
                $salesGrowth = (($salesThisWeek - $salesPrevWeek) / $salesPrevWeek) * 100;
            } elseif ($salesThisWeek > 0) {
                $salesGrowth = 100;
            }
        } catch (\Exception $e) {
            Log::error("DashboardService [Sales]: " . $e->getMessage());
        }

        // 2. Inventory Stats
        $inventoryValue = 0;
        try {
            if (Schema::hasTable('inventories')) {
                $inventoryStats = DB::table('inventories')
                    ->where('user_id', $userId)
                    ->select(DB::raw('SUM(quantity_in_stock * cost_price) as total_value'))
                    ->first();
                $inventoryValue = (float)($inventoryStats->total_value ?? 0);
            }
        } catch (\Exception $e) {
            Log::error("DashboardService [Inventory]: " . $e->getMessage());
        }
        
        // 3. Customer Stats
        $totalCustomers = 0;
        $newCustomersThisWeek = 0;
        try {
            $totalCustomers = Customer::where('user_id', $userId)->count();
            $newCustomersThisWeek = Customer::where('user_id', $userId)->where('created_at', '>=', $last7Days)->count();
        } catch (\Exception $e) {
            Log::error("DashboardService [Customers]: " . $e->getMessage());
        }

        // 4. Stores/Sync Info
        $userStores = collect([]);
        try {
            if (Schema::hasTable('stores')) {
                $userStores = Store::where('user_id', $userId)->get();
            }
        } catch (\Exception $e) {
            Log::error("DashboardService [Stores]: " . $e->getMessage());
        }
        
        $lastSyncTime = 'Never';
        try {
            if ($userStores->count() > 0) {
                $latestStore = $userStores->sortByDesc('last_sync_at')->first();
                if ($latestStore && $latestStore->last_sync_at) {
                    $lastSyncTime = Carbon::parse($latestStore->last_sync_at)->diffForHumans();
                }
            }
        } catch (\Exception $e) {
             Log::error("DashboardService [Sync]: " . $e->getMessage());
        }

        // 5. Recent Sales
        $recentSales = collect([]);
        try {
            $recentSales = Sale::whereIn('cashier_id', $userIds)
                ->orderBy('created_at', 'desc')
                ->limit(5)
                ->get();
        } catch (\Exception $e) {
            Log::error("DashboardService [RecentSales]: " . $e->getMessage());
        }

        // Map Stores
        $storesCount = $userStores->count();
        $stores = $userStores->map(function($store) use ($totalSales, $storesCount) {
            return [
                'id' => $store->id,
                'name' => $store->name,
                'location' => $store->location,
                'address' => $store->address,
                'phone' => $store->phone,
                'store_type' => $store->store_type,
                'status' => $store->last_sync_at && Carbon::parse($store->last_sync_at)->gt(now()->subMinutes(30)) ? 'online' : 'offline',
                'lastSync' => $store->last_sync_at ? Carbon::parse($store->last_sync_at)->diffForHumans() : 'Never',
                'sales' => '₦' . number_format($totalSales / ($storesCount ?: 1), 2)
            ];
        });

        $staff = collect([]);
        try {
            if (Schema::hasTable('users')) {
                // Fetch staff belonging to the user's stores or created by them
                $staff = User::whereIn('store_id', $storeIds)
                             ->orWhere('referred_by_id', $userId)
                             ->get()
                             ->map(function($u) {
                                 return [
                                     'id' => $u->id,
                                     'name' => $u->name ?? trim($u->first_name . ' ' . $u->last_name),
                                     'email' => $u->email,
                                     'role' => $u->role,
                                     'store_id' => $u->store_id,
                                     'created_at' => $u->created_at,
                                     'last_login_at' => $u->last_login_at,
                                 ];
                             });
            }
        } catch (\Exception $e) {
            Log::error("DashboardService [Staff]: " . $e->getMessage());
        }

        // Approximate storage usage based on data
        $storageUsedGB = 0.05; // Base 50MB
        try {
            $salesCount = \App\Models\Sale::whereIn('cashier_id', $userIds)->count();
            $customersCount = \App\Models\Customer::where('user_id', $userId)->count();
            $logsCount = Schema::hasTable('activity_logs') ? \App\Models\ActivityLog::where('user_id', $userId)->count() : 0;
            
            $totalRows = $salesCount + $customersCount + $logsCount;
            $storageUsedMB = 50 + ($totalRows * 0.005); // Base 50MB + 5KB per row
            $storageUsedGB = round($storageUsedMB / 1024, 3);
        } catch (\Exception $e) {}

        $storageLimitGB = 10; // Default 10GB for Pro
        $storagePercentage = min(100, round(($storageUsedGB / $storageLimitGB) * 100));

        return [
            'stats' => [
                'total_sales' => [
                    'value' => $totalSales,
                    'growth' => round($salesGrowth, 1) . '%'
                ],
                'inventory_value' => [
                    'value' => $inventoryValue,
                    'label' => 'Total Stock'
                ],
                'customers' => [
                    'value' => $totalCustomers,
                    'growth' => '+' . $newCustomersThisWeek . ' new'
                ],
                'stores_count' => $storesCount,
                'last_sync' => $lastSyncTime,
                'cloud_storage' => [
                    'used_gb' => $storageUsedGB,
                    'limit_gb' => $storageLimitGB,
                    'percentage' => $storagePercentage
                ]
            ],
            'stores' => $stores,
            'recent_sales' => $recentSales,
            'staff' => $staff,
            'user' => [
                'name' => $user->name,
                'first_name' => $user->first_name,
                'last_name' => $user->last_name,
                'email' => $user->email,
                'phone' => $user->phone,
                'store_name' => $user->store ? $user->store->name : ($user->stores()->first()->name ?? 'DumosRx Store'),
                'deletion_requested_at' => $user->deletion_requested_at,
                'email_verified_at' => $user->email_verified_at ? $user->email_verified_at->toIso8601String() : null,
                'require_email_verification' => \App\Models\SystemConfig::getVal('require_email_verification', false) === true || \App\Models\SystemConfig::getVal('require_email_verification', false) === 'true',
            ]
        ];
    }

    /**
     * Reset account data.
     */
    public function resetData($user, $type = 'all')
    {
        $userId = $user->id;
        DB::beginTransaction();

        try {
            $message = "Account data has been reset.";
            Log::info("Starting data reset for user: {$userId}, type: {$type}");

            if ($type === 'all' || $type === 'sales') {
                if (Schema::hasTable('sales')) {
                    $query = Sale::query();
                    if (Schema::hasColumn('sales', 'cashier_id')) {
                        $query->where('cashier_id', $userId);
                        Log::info("Clearing sales for cashier: {$userId}");
                        $query->delete();
                        $message = "Sales records cleared.";
                    }
                }
            }

            if ($type === 'all' || $type === 'logs') {
                if (Schema::hasTable('activity_logs')) {
                    $query = ActivityLog::query();
                    if (Schema::hasColumn('activity_logs', 'user_id')) {
                        $query->where('user_id', $userId);
                        Log::info("Clearing activity logs for user: {$userId}");
                        $query->delete();
                        $message = $type === 'all' ? "All data cleared." : "Activity logs cleared.";
                    }
                }
            }

            if ($type === 'all' || $type === 'customers') {
                if (Schema::hasTable('customers')) {
                    Log::info("Checking customers table for user_id column");
                    $query = Customer::query();
                    if (Schema::hasColumn('customers', 'user_id')) {
                        $query->where('user_id', $userId);
                        Log::info("Clearing customers for user: {$userId}");
                        $query->delete(); 
                        $message = $type === 'all' ? "All data cleared." : "Customer records cleared.";
                    } else {
                        Log::warning("Customers table missing user_id column, skipping filtered delete");
                    }
                }
            }

            if ($type === 'all' || $type === 'inventories') {
                if (Schema::hasTable('inventories')) {
                    $query = Inventory::query();
                    if (Schema::hasColumn('inventories', 'user_id')) {
                        $query->where('user_id', $userId);
                        Log::info("Clearing inventory for user: {$userId}");
                        $query->delete(); 
                        $message = $type === 'all' ? "All data cleared." : "Inventory records cleared.";
                    }
                }
            }

            if ($type === 'all' || $type === 'stores') {
                Log::info("Checking for stores table existence");
                if (Schema::hasTable('stores')) {
                    $query = Store::query();
                    if (Schema::hasColumn('stores', 'user_id')) {
                        $query->where('user_id', $userId);
                        Log::info("Clearing stores for user: {$userId}");
                        $query->delete();
                        $message = $type === 'all' ? "All data cleared." : "Connected stores cleared.";
                    }
                } else {
                    Log::warning("Stores table does not exist, skipping");
                }
            }

            DB::commit();
            Log::info("Data reset completed successfully for user: {$userId}");
            return ['status' => 'success', 'message' => $message];
        } catch (\Exception $e) {
            DB::rollBack();
            Log::error("Dashboard Reset Transaction Failed: " . $e->getMessage());
            throw $e;
        }
    }
}
