<?php

namespace App\Http\Controllers\Api\App;

use App\Http\Controllers\Controller;
use App\Models\StockBatch;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class StockBatchController extends Controller
{
    public function index(Request $request)
    {
        $limit = $request->get('limit', 50);
        
        $inventory = StockBatch::where('user_id', $request->user()->id)
            ->with('medicine')
            ->latest()
            ->paginate($limit);

        return response()->json($inventory);
    }

    public function lowStock(Request $request)
    {
        $inventory = StockBatch::where('user_id', $request->user()->id)
            ->with('medicine')
            ->whereColumn('quantity', '<=', 'reorder_level')
            ->get();

        return response()->json($inventory);
    }

    public function expiring(Request $request)
    {
        $days = (int) $request->get('days', 90);
        $date = now()->addDays($days);

        $inventory = StockBatch::where('user_id', $request->user()->id)
            ->with('medicine')
            ->whereDate('expiry_date', '<=', $date)
            ->whereDate('expiry_date', '>=', now())
            ->orderBy('expiry_date')
            ->get();

        return response()->json($inventory);
    }

    public function value(Request $request)
    {
        $totalValue = DB::table('stock_batches')
            ->where('user_id', $request->user()->id)
            ->select(DB::raw('SUM(quantity * cost_price) as total_value'))
            ->value('total_value');

        return response()->json(['total_value' => $totalValue ?? 0]);
    }
}
