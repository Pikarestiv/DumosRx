<?php

namespace App\Http\Controllers;

use App\Models\Inventory;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class InventoryController extends Controller
{
    public function index(Request $request)
    {
        $limit = $request->get('limit', 50);
        $inventory = Inventory::with('medicine', 'batch')
            ->latest()
            ->paginate($limit);

        return response()->json($inventory);
    }

    public function lowStock(Request $request)
    {
        // Assuming we have a reorder_level column or similar logic
        // For now, let's say quantity < 10 or configured level
        $inventory = Inventory::with('medicine')
            ->whereColumn('quantity', '<=', 'reorder_level')
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
        // Calculate total value: sum(quantity * cost_price)
        // Since cost_price is on Medicine or Inventory (depending on design), let's assume Inventory has cost/price or we join Medicine.
        // The Medicine model had cost_price. Inventory usually tracks batches.
        
        // Simple approximation if Inventory has cost_price (often batch specific)
        // Check Inventory model first.
        // Assuming Inventory has quantity. Join medicine for cost.
        
        $totalValue = DB::table('inventories')
            ->join('medicines', 'inventories.medicine_id', '=', 'medicines.id')
            ->select(DB::raw('SUM(inventories.quantity * medicines.cost_price) as total_value'))
            ->value('total_value');

        return response()->json(['total_value' => $totalValue ?? 0]);
    }
}
