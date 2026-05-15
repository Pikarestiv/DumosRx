<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Sale;
use App\Models\Inventory;
use App\Models\Customer;
use App\Models\ActivityLog;
use App\Models\Store;
use Illuminate\Support\Facades\DB;
use Carbon\Carbon;

class DashboardController extends Controller
{
    public function summary(Request $request)
    {
        try {
            $user = $request->user();
            $userId = $user->id;

            // Date ranges
            $now = Carbon::now();
            $last7Days = $now->copy()->subDays(7);
            $prev7Days = $now->copy()->subDays(14);

            // 1. Sales Stats - Use try-catch or check table
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
                \Log::error("Sales stats error: " . $e->getMessage());
            }

            // 2. Inventory Stats
            $inventoryValue = 0;
            try {
                $inventoryStats = DB::table('inventory')
                    ->select(DB::raw('SUM(quantity_in_stock * cost_price) as total_value'))
                    ->first();
                $inventoryValue = (float)($inventoryStats->total_value ?? 0);
            } catch (\Exception $e) {
                \Log::error("Inventory stats error: " . $e->getMessage());
            }
            
            // 3. Customer Stats
            $totalCustomers = 0;
            $newCustomersThisWeek = 0;
            try {
                $totalCustomers = Customer::count();
                $newCustomersThisWeek = Customer::where('created_at', '>=', $last7Days)->count();
            } catch (\Exception $e) {
                \Log::error("Customer stats error: " . $e->getMessage());
            }

            // 4. Stores/Sync Info
            $storesCount = 0;
            $userStores = collect([]);
            try {
                $userStores = Store::where('user_id', $userId)->get();
                $storesCount = $userStores->count();
            } catch (\Exception $e) {
                \Log::error("Stores table error: " . $e->getMessage());
                // If table doesn't exist, we just have 0 stores
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
                 \Log::error("Sync info error: " . $e->getMessage());
            }

            // 5. Recent Sales
            $recentSales = collect([]);
            try {
                $recentSales = Sale::where('cashier_id', $userId)
                    ->orderBy('created_at', 'desc')
                    ->limit(5)
                    ->get();
            } catch (\Exception $e) {
                \Log::error("Recent sales error: " . $e->getMessage());
            }

            // Map Store models to response format
            $stores = $userStores->map(function($store) use ($totalSales, $storesCount) {
                return [
                    'id' => $store->id,
                    'name' => $store->name,
                    'status' => $store->last_sync_at && Carbon::parse($store->last_sync_at)->gt(now()->subMinutes(30)) ? 'online' : 'offline',
                    'lastSync' => $store->last_sync_at ? Carbon::parse($store->last_sync_at)->diffForHumans() : 'Never',
                    'sales' => '₦' . number_format($totalSales / ($storesCount ?: 1), 2)
                ];
            });

            return response()->json([
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
            ]);
        } catch (\Exception $e) {
            \Log::error("Dashboard summary critical error: " . $e->getMessage());
            return response()->json([
                'error' => 'Internal Server Error',
                'message' => $e->getMessage()
            ], 500);
        }
    }

    public function resetData(Request $request)
    {
        $user = $request->user();
        $userId = $user->id;
        $type = $request->input('type', 'all'); // all, sales, logs, customers, inventory, stores

        $message = "Account data has been reset.";

        if ($type === 'all' || $type === 'sales') {
            Sale::where('cashier_id', $userId)->delete();
            $message = "Sales records cleared.";
        }

        if ($type === 'all' || $type === 'logs') {
            ActivityLog::where('user_id', $userId)->delete();
            $message = $type === 'all' ? "All data cleared." : "Activity logs cleared.";
        }

        if ($type === 'all' || $type === 'customers') {
            Customer::query()->delete(); 
            $message = $type === 'all' ? "All data cleared." : "Customer records cleared.";
        }

        if ($type === 'all' || $type === 'inventory') {
            Inventory::query()->delete(); 
            $message = $type === 'all' ? "All data cleared." : "Inventory records cleared.";
        }

        if ($type === 'all' || $type === 'stores') {
            Store::where('user_id', $userId)->delete();
            $message = $type === 'all' ? "All data cleared." : "Connected stores cleared.";
        }

        return response()->json([
            'message' => $message,
            'status' => 'success'
        ]);
    }
}
