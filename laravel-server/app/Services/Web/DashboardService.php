<?php

namespace App\Services\Web;

use App\Models\Sale;
use App\Models\Inventory;
use App\Models\Customer;
use App\Models\ActivityLog;
use App\Models\Store;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
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

        // 1. Sales Stats
        $totalSales = 0;
        $salesGrowth = 0;
        try {
            $totalSales = (float)Sale::where('cashier_id', $userId)->sum('total_amount');
            $salesThisWeek = (float)Sale::where('cashier_id', $userId)
                ->where('created_at', '>=', $last7Days)
                ->sum('total_amount');
            $salesPrevWeek = (float)Sale::where('cashier_id', $userId)
                ->where('created_at', '>=', $prev7Days)
                ->where('created_at', '<', $last7Days)
                ->sum('total_amount');
            
            if ($salesPrevWeek > 0) {
                $salesGrowth = (($salesThisWeek - $salesPrevWeek) / $salesPrevWeek) * 100;
            } elseif ($salesThisWeek > 0) {
                $salesGrowth = 100;
            }
        } catch (\Exception $e) {
            \Log::error("DashboardService [Sales]: " . $e->getMessage());
        }

        // 2. Inventory Stats
        $inventoryValue = 0;
        try {
            if (Schema::hasTable('inventory')) {
                $inventoryStats = DB::table('inventory')
                    ->select(DB::raw('SUM(quantity_in_stock * cost_price) as total_value'))
                    ->first();
                $inventoryValue = (float)($inventoryStats->total_value ?? 0);
            }
        } catch (\Exception $e) {
            \Log::error("DashboardService [Inventory]: " . $e->getMessage());
        }
        
        // 3. Customer Stats
        $totalCustomers = 0;
        $newCustomersThisWeek = 0;
        try {
            $totalCustomers = Customer::count();
            $newCustomersThisWeek = Customer::where('created_at', '>=', $last7Days)->count();
        } catch (\Exception $e) {
            \Log::error("DashboardService [Customers]: " . $e->getMessage());
        }

        // 4. Stores/Sync Info
        $userStores = collect([]);
        try {
            if (Schema::hasTable('stores')) {
                $userStores = Store::where('user_id', $userId)->get();
            }
        } catch (\Exception $e) {
            \Log::error("DashboardService [Stores]: " . $e->getMessage());
        }
        
        $lastSyncTime = 'Never';
        try {
            $lastSyncedRecord = DB::table('sales')
                ->where('cashier_id', $userId)
                ->whereNotNull('_synced_at')
                ->orderBy('_synced_at', 'desc')
                ->first();
            
            $lastSyncTime = $lastSyncedRecord ? Carbon::parse($lastSyncedRecord->_synced_at)->diffForHumans() : 'Never';
        } catch (\Exception $e) {
             \Log::error("DashboardService [Sync]: " . $e->getMessage());
        }

        // 5. Recent Sales
        $recentSales = collect([]);
        try {
            $recentSales = Sale::where('cashier_id', $userId)
                ->orderBy('created_at', 'desc')
                ->limit(5)
                ->get();
        } catch (\Exception $e) {
            \Log::error("DashboardService [RecentSales]: " . $e->getMessage());
        }

        // Map Stores
        $storesCount = $userStores->count();
        $stores = $userStores->map(function($store) use ($totalSales, $storesCount) {
            return [
                'id' => $store->id,
                'name' => $store->name,
                'status' => $store->last_sync_at && Carbon::parse($store->last_sync_at)->gt(now()->subMinutes(30)) ? 'online' : 'offline',
                'lastSync' => $store->last_sync_at ? Carbon::parse($store->last_sync_at)->diffForHumans() : 'Never',
                'sales' => '₦' . number_format($totalSales / ($storesCount ?: 1), 2)
            ];
        });

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
                'last_sync' => $lastSyncTime
            ],
            'stores' => $stores,
            'recent_sales' => $recentSales,
            'user' => [
                'name' => $user->name,
                'email' => $user->email,
                'pharmacy_name' => $user->pharmacy_name ?? 'DumosRx Pharmacy',
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

            if ($type === 'all' || $type === 'sales') {
                if (Schema::hasTable('sales')) {
                    $query = Sale::query();
                    if (Schema::hasColumn('sales', 'cashier_id')) {
                        $query->where('cashier_id', $userId);
                    }
                    $query->delete();
                    $message = "Sales records cleared.";
                }
            }

            if ($type === 'all' || $type === 'logs') {
                if (Schema::hasTable('activity_logs')) {
                    $query = ActivityLog::query();
                    if (Schema::hasColumn('activity_logs', 'user_id')) {
                        $query->where('user_id', $userId);
                    }
                    $query->delete();
                    $message = $type === 'all' ? "All data cleared." : "Activity logs cleared.";
                }
            }

            if ($type === 'all' || $type === 'customers') {
                if (Schema::hasTable('customers')) {
                    $query = Customer::query();
                    if (Schema::hasColumn('customers', 'user_id')) {
                        $query->where('user_id', $userId);
                    }
                    $query->delete(); 
                    $message = $type === 'all' ? "All data cleared." : "Customer records cleared.";
                }
            }

            if ($type === 'all' || $type === 'inventory') {
                if (Schema::hasTable('inventory')) {
                    $query = Inventory::query();
                    if (Schema::hasColumn('inventory', 'user_id')) {
                        $query->where('user_id', $userId);
                    }
                    $query->delete(); 
                    $message = $type === 'all' ? "All data cleared." : "Inventory records cleared.";
                }
            }

            if ($type === 'all' || $type === 'stores') {
                if (Schema::hasTable('stores')) {
                    $query = Store::query();
                    if (Schema::hasColumn('stores', 'user_id')) {
                        $query->where('user_id', $userId);
                    }
                    $query->delete();
                    $message = $type === 'all' ? "All data cleared." : "Connected stores cleared.";
                }
            }

            DB::commit();
            return ['status' => 'success', 'message' => $message];
        } catch (\Exception $e) {
            DB::rollBack();
            throw $e;
        }
    }
}
