<?php

namespace App\Http\Controllers\Api\App;

use App\Http\Controllers\Controller;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\Inventory;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class SaleController extends Controller
{
    public function index(Request $request)
    {
        $limit = $request->get('limit', 50);
        $sales = Sale::with('items', 'customer', 'user')
            ->latest()
            ->paginate($limit);

        return response()->json($sales);
    }

    public function store(Request $request)
    {
        $request->validate([
            'items' => 'required|array',
            'items.*.medicine_id' => 'required|exists:medicines,id',
            'items.*.quantity' => 'required|integer|min:1',
            'payment_method' => 'required|string',
            'customer_id' => 'nullable|exists:customers,id',
        ]);

        return DB::transaction(function () use ($request) {
            // Create Sale Header
            $sale = Sale::create([
                'user_id' => $request->user()->id,
                'customer_id' => $request->customer_id,
                'payment_method' => $request->payment_method,
                'total_amount' => 0, // Will update
                'status' => 'completed',
                'invoice_number' => 'INV-' . strtoupper(uniqid())
            ]);

            $total = 0;

            foreach ($request->items as $item) {
                // Get price
                $inventory = Inventory::where('medicine_id', $item['medicine_id'])->first(); 
                
                $price = 0; 
                $subtotal = 0;
                
                // Create Item
                $saleItem = new SaleItem([
                    'medicine_id' => $item['medicine_id'],
                    'quantity' => $item['quantity'],
                    'unit_price' => $item['unit_price'] ?? 0, 
                    'subtotal' => ($item['unit_price'] ?? 0) * $item['quantity']
                ]);
                $sale->items()->save($saleItem);
                
                $total += $saleItem->subtotal;
            }

            $sale->total_amount = $total;
            $sale->save();

            return response()->json($sale->load('items'), 201);
        });
    }

    public function dailySales(Request $request)
    {
        $date = $request->get('date', now()->toDateString());

        $sales = Sale::whereDate('created_at', $date)
            ->with('items')
            ->get();

        $total = $sales->sum('total_amount');
        $count = $sales->count();

        return response()->json([
            'date' => $date,
            'total_sales' => $total,
            'transaction_count' => $count,
            'sales' => $sales
        ]);
    }

    public function topMedicines(Request $request)
    {
        $limit = $request->get('limit', 10);
        
        $topWithNames = DB::table('sale_items')
            ->join('medicines', 'sale_items.medicine_id', '=', 'medicines.id')
            ->select('medicines.name', DB::raw('SUM(sale_items.quantity) as total_quantity'))
            ->groupBy('medicines.id', 'medicines.name')
            ->orderByDesc('total_quantity')
            ->limit($limit)
            ->get();

        return response()->json($topWithNames);
    }
}
