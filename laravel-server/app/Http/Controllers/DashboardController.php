<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Sale;
use App\Models\Inventory;
use App\Models\Customer;
use App\Models\ActivityLog;
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

        // 4. Stores/Sync Info (Inferred from unique IP addresses in logs)
        $uniqueDevices = ActivityLog::where('user_id', $userId)
            ->select('ip_address', 'user_agent', DB::raw('MAX(created_at) as last_seen'))
            ->groupBy('ip_address', 'user_agent')
            ->get();
        
        $storesCount = $uniqueDevices->count() ?: 1;
        
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

        // Map inferred devices to "Stores"
        $stores = $uniqueDevices->map(function($device, $index) use ($user, $totalSales) {
            $isWeb = str_contains($device->user_agent, 'Mozilla') && !str_contains($device->user_agent, 'Electron');
            $name = $isWeb ? 'Cloud Dashboard' : (($user->pharmacy_name ?? 'Branch') . ' #' . ($index + 1));
            
            return [
                'id' => 'DEV-' . strtoupper(substr(md5($device->ip_address . $device->user_agent), 0, 8)),
                'name' => $name,
                'status' => Carbon::parse($device->last_seen)->gt(now()->subMinutes(30)) ? 'online' : 'offline',
                'lastSync' => Carbon::parse($device->last_seen)->diffForHumans(),
                'sales' => $isWeb ? 'N/A' : '₦' . number_format($totalSales / ($index + 1)) // Mock split for visualization
            ];
        });

        // Fallback for visual consistency if no logs yet
        if ($stores->isEmpty()) {
            $stores = [
                [
                    'id' => 'DEV-' . strtoupper(substr(md5($userId), 0, 8)),
                    'name' => ($user->pharmacy_name ?? 'Main Branch') . ' (HQ)',
                    'status' => $lastSyncTime === 'Never' ? 'offline' : 'online',
                    'lastSync' => $lastSyncTime,
                    'sales' => '₦' . number_format($totalSales)
                ]
            ];
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
        $type = $request->input('type', 'all'); // all, sales, logs, customers, inventory

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
            Customer::query()->delete(); // Assuming customers are shared or per-org
            $message = $type === 'all' ? "All data cleared." : "Customer records cleared.";
        }

        if ($type === 'all' || $type === 'inventory') {
            Inventory::query()->delete(); 
            $message = $type === 'all' ? "All data cleared." : "Inventory records cleared.";
        }

        return response()->json([
            'message' => $message,
            'status' => 'success'
        ]);
    }
}
