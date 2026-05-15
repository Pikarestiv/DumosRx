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
        $user = $request->user();
        $userId = $user->id;

        // Date ranges
        $now = Carbon::now();
        $last7Days = $now->copy()->subDays(7);
        $prev7Days = $now->copy()->subDays(14);

        // 1. Sales Stats
        $totalSales = Sale::where('cashier_id', $userId)->sum('total_amount');
        $salesThisWeek = Sale::where('cashier_id', $userId)
            ->where('created_at', '>=', $last7Days)
            ->sum('total_amount');
        $salesPrevWeek = Sale::where('cashier_id', $userId)
            ->where('created_at', '>=', $prev7Days)
            ->where('created_at', '<', $last7Days)
            ->sum('total_amount');
        
        $salesGrowth = 0;
        if ($salesPrevWeek > 0) {
            $salesGrowth = (($salesThisWeek - $salesPrevWeek) / $salesPrevWeek) * 100;
        } elseif ($salesThisWeek > 0) {
            $salesGrowth = 100;
        }

        // 2. Inventory Stats
        $inventoryValue = DB::table('inventory')
            ->select(DB::raw('SUM(quantity_in_stock * cost_price) as total_value'))
            ->first()
            ->total_value ?? 0;
        
        // 3. Customer Stats
        $totalCustomers = Customer::count();
        $newCustomersThisWeek = Customer::where('created_at', '>=', $last7Days)
            ->count();

        // 4. Stores/Sync Info (From Stores table)
        $userStores = Store::where('user_id', $userId)->get();
        $storesCount = $userStores->count();
        
        $lastSyncedRecord = DB::table('sales')
            ->where('cashier_id', $userId)
            ->whereNotNull('_synced_at')
            ->orderBy('_synced_at', 'desc')
            ->first();
        
        $lastSyncTime = $lastSyncedRecord ? Carbon::parse($lastSyncedRecord->_synced_at)->diffForHumans() : 'Never';

        // 5. Recent Sales
        $recentSales = Sale::where('cashier_id', $userId)
            ->orderBy('created_at', 'desc')
            ->limit(5)
            ->get();

        // Map Store models to response format
        $stores = $userStores->map(function($store) use ($totalSales, $storesCount) {
            return [
                'id' => $store->id,
                'name' => $store->name,
                'status' => $store->last_sync_at && Carbon::parse($store->last_sync_at)->gt(now()->subMinutes(30)) ? 'online' : 'offline',
                'lastSync' => $store->last_sync_at ? Carbon::parse($store->last_sync_at)->diffForHumans() : 'Never',
                'sales' => '₦' . number_format($totalSales / ($storesCount ?: 1)) // Split evenly for visualization
            ];
        });

        // Fallback ONLY if absolutely no stores exist
        if ($stores->isEmpty()) {
            $stores = [];
        }

        return response()->json([
            'stats' => [
                'total_sales' => [
                    'value' => (float)$totalSales,
                    'growth' => round($salesGrowth, 1) . '%'
                ],
                'inventory_value' => [
                    'value' => (float)$inventoryValue,
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
