<?php

namespace App\Http\Controllers\Api\App;

use App\Http\Controllers\Controller;
use App\Models\PurchaseOrder;
use App\Models\Store;
use App\Models\User;
use Illuminate\Http\Request;

class PurchaseOrderController extends Controller
{
    /**
     * Get list of purchase orders
     */
    public function index(Request $request)
    {
        $user = $request->user();
        $limit = $request->get('limit', 50);

        // Filter by users in the same store
        $storeIds = Store::where('user_id', $user->id)->pluck('id')->toArray();
        $userIds = User::whereIn('store_id', $storeIds)->pluck('id')->push($user->id)->toArray();

        $orders = PurchaseOrder::whereIn('ordered_by', $userIds)
            ->with(['supplier', 'orderedBy'])
            ->latest()
            ->paginate($limit);

        $items = collect($orders->items())->map(function ($po) {
            return [
                'id' => $po->id,
                'order_number' => $po->order_number,
                'supplier_name' => $po->supplier ? $po->supplier->name : 'Unknown',
                'supplier' => $po->supplier,
                'ordered_by_name' => $po->orderedBy ? $po->orderedBy->name : 'System',
                'ordered_by' => $po->orderedBy,
                'status' => $po->status,
                'order_date' => $po->order_date ? $po->order_date->toDateString() : null,
                'expected_delivery_date' => $po->expected_delivery_date ? $po->expected_delivery_date->toDateString() : null,
                'actual_delivery_date' => $po->actual_delivery_date ? $po->actual_delivery_date->toDateString() : null,
                'subtotal' => $po->subtotal,
                'tax_amount' => $po->tax_amount,
                'total_amount' => $po->total_amount,
                'notes' => $po->notes,
                'created_at' => $po->created_at ? $po->created_at->toIso8601String() : null,
            ];
        });

        return response()->json([
            'success' => true,
            'data' => $items,
            'current_page' => $orders->currentPage(),
            'last_page' => $orders->lastPage(),
            'total' => $orders->total(),
        ]);
    }
}
