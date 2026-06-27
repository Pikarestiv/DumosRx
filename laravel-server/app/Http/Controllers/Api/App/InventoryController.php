<?php

namespace App\Http\Controllers\Api\App;

use App\Http\Controllers\Controller;
use App\Models\Medicine;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class InventoryController extends Controller
{
    public function index(Request $request)
    {
        $limit = $request->get('limit', 50);
        
        $medicines = Medicine::where('user_id', $request->user()->id)
            ->with('category')
            ->latest()
            ->paginate($limit);
            
        $medicines->getCollection()->transform(function ($med) {
            return [
                'id' => $med->id,
                'quantity_in_stock' => $med->stock_quantity,
                'reorder_level' => $med->reorder_level,
                'selling_price' => $med->selling_price,
                'cost_price' => $med->cost_price,
                'expiry_date' => null,
                'medicine' => [
                    'name' => $med->name,
                    'category' => $med->category,
                ]
            ];
        });

        return response()->json($medicines);
    }

    public function lowStock(Request $request)
    {
        $medicines = Medicine::where('user_id', $request->user()->id)
            ->with('category')
            ->whereColumn('stock_quantity', '<=', 'reorder_level')
            ->get();
            
        $mapped = $medicines->map(function ($med) {
            return [
                'id' => $med->id,
                'quantity_in_stock' => $med->stock_quantity,
                'reorder_level' => $med->reorder_level,
                'selling_price' => $med->selling_price,
                'cost_price' => $med->cost_price,
                'expiry_date' => null,
                'medicine' => [
                    'name' => $med->name,
                    'category' => $med->category,
                ]
            ];
        });

        return response()->json($mapped);
    }

    public function expiring(Request $request)
    {
        // General stores using the medicines table do not track expiry dates 
        // at the batch level. We return an empty array.
        return response()->json([]);
    }

    public function value(Request $request)
    {
        $totalValue = DB::table('medicines')
            ->where('user_id', $request->user()->id)
            ->select(DB::raw('SUM(stock_quantity * cost_price) as total_value'))
            ->value('total_value');

        return response()->json(['total_value' => $totalValue ?? 0]);
    }
}
