<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Sale;
use App\Models\Inventory;
use App\Models\Customer;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    public function summary(Request $request)
    {
        $user = $request->user();

        // Aggregate stats
        $totalSales = Sale::where('user_id', $user->id)->sum('total_amount');
        $inventoryValue = DB::table('inventories')
            ->where('user_id', $user->id)
            ->select(DB::raw('SUM(quantity * unit_cost) as total_value'))
            ->first()
            ->total_value ?? 0;
        
        $totalCustomers = Customer::where('user_id', $user->id)->count();
        
        // Mocking stores for now, but in a real app these would be instances that have synced
        // For now let's just count unique device identifiers from the activity log if we had them
        // Or just return a list based on "synced devices"
        $storesCount = 1; // Default
        
        // Recent sales across all "stores"
        $recentSales = Sale::where('user_id', $user->id)
            ->orderBy('created_at', 'desc')
            ->limit(5)
            ->get();

        return response()->json([
            'stats' => [
                'total_sales' => $totalSales,
                'inventory_value' => $inventoryValue,
                'total_customers' => $totalCustomers,
                'active_stores' => $storesCount,
            ],
            'recent_sales' => $recentSales,
            'user' => [
                'name' => $user->name,
                'email' => $user->email,
                'pharmacy_name' => $user->pharmacy_name ?? 'DumosRx Pharmacy',
            ]
        ]);
    }
}
