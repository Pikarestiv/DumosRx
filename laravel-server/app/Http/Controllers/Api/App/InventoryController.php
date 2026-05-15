<?php

namespace App\Http\Controllers\Api\App;

use App\Http\Controllers\Controller;
use App\Models\Inventory;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class InventoryController extends Controller
{
    public function index(Request $request)
    {
        $limit = $request->get('limit', 50);
        $inventory = Inventory::with('medicine')
            ->latest()
            ->paginate($limit);

        return response()->json($inventory);
    }

    public function lowStock(Request $request)
    {
        $inventory = Inventory::with('medicine')
            ->whereColumn('quantity_in_stock', '<=', 'reorder_level')
            ->get();

        return response()->json($inventory);
    }

    public function expiring(Request $request)
    {
        $days = $request->get('days', 90);
        $date = now()->addDays($days);

        $inventory = Inventory::with('medicine')
            ->whereDate('expiry_date', '<=', $date)
            ->whereDate('expiry_date', '>=', now())
            ->orderBy('expiry_date')
            ->get();

        return response()->json($inventory);
    }

    public function value(Request $request)
    {
        $totalValue = DB::table('inventory')
            ->select(DB::raw('SUM(quantity_in_stock * cost_price) as total_value'))
            ->value('total_value');

        return response()->json(['total_value' => $totalValue ?? 0]);
    }
}
