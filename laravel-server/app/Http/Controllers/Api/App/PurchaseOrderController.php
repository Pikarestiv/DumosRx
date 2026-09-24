<?php

namespace App\Http\Controllers\Api\App;

use App\Http\Controllers\Concerns\ScopesToTenant;
use App\Http\Controllers\Controller;
use App\Models\PurchaseOrder;
use App\Models\Store;
use App\Models\User;
use Illuminate\Http\Request;
use OpenApi\Attributes as OA;

class PurchaseOrderController extends Controller
{
    use ScopesToTenant;

    #[OA\Get(
        path: '/purchase-orders',
        summary: 'List purchase orders for the store (across all staff)',
        tags: ['Purchase Orders'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'limit', in: 'query', schema: new OA\Schema(type: 'integer', default: 50))],
        responses: [
            new OA\Response(response: 200, description: 'Paginated purchase orders', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'success', type: 'boolean'),
                new OA\Property(property: 'data', type: 'array', items: new OA\Items(type: 'object')),
                new OA\Property(property: 'current_page', type: 'integer'),
                new OA\Property(property: 'last_page', type: 'integer'),
                new OA\Property(property: 'total', type: 'integer'),
            ])),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
        ],
    )]
    public function index(Request $request)
    {
        $limit = $request->get('limit', 50);

        // Filter by users across every store owned by the caller's tenant
        // (resolved via ScopesToTenant so a staff caller — whose own id
        // owns no Store row — sees the same list their owner would, not
        // an empty/self-only set).
        $ownerId = $this->tenantOwnerId($request);
        $storeIds = Store::where('user_id', $ownerId)->pluck('id')->toArray();
        $userIds = User::whereIn('store_id', $storeIds)->pluck('id')->push($ownerId)->toArray();

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
