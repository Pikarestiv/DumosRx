<?php

namespace App\Http\Controllers\Api\App;

use App\Http\Controllers\Controller;
use App\Models\StockMovement;
use App\Models\Store;
use App\Models\User;
use Illuminate\Http\Request;
use OpenApi\Attributes as OA;

class StockMovementController extends Controller
{
    #[OA\Get(
        path: '/stock-movements',
        summary: 'List the stock ledger (sales, restocks, adjustments) for the store',
        tags: ['Stock Movements'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'limit', in: 'query', schema: new OA\Schema(type: 'integer', default: 50))],
        responses: [
            new OA\Response(response: 200, description: 'Paginated movements', content: new OA\JsonContent(properties: [
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
        $user = $request->user();
        $limit = $request->get('limit', 50);

        // Filter by users in the same store
        $storeIds = Store::where('user_id', $user->id)->pluck('id')->toArray();
        $userIds = User::whereIn('store_id', $storeIds)->pluck('id')->push($user->id)->toArray();

        $movements = StockMovement::whereIn('performed_by', $userIds)
            ->with(['medicine', 'user'])
            ->latest()
            ->paginate($limit);

        // Map key fields for frontend compatibility
        $items = collect($movements->items())->map(function ($m) {
            return [
                'id' => $m->id,
                'created_at' => $m->created_at ? $m->created_at->toIso8601String() : null,
                'date' => $m->movement_date ? $m->movement_date->toIso8601String() : null,
                'medicine_name' => $m->medicine ? $m->medicine->name : 'Unknown',
                'medicine' => $m->medicine,
                'type' => $m->movement_type === 'adjustment' ? 'adjustment' : ($m->quantity > 0 ? 'in' : 'out'),
                'movement_type' => $m->movement_type,
                'quantity' => $m->quantity,
                'reason' => $m->reason,
                'reference' => $m->reference_id,
                'user_name' => $m->user ? $m->user->name : 'System',
                'user' => $m->user,
            ];
        });

        return response()->json([
            'success' => true,
            'data' => $items,
            'current_page' => $movements->currentPage(),
            'last_page' => $movements->lastPage(),
            'total' => $movements->total(),
        ]);
    }

    #[OA\Get(
        path: '/stock-adjustments',
        summary: 'List stock movements filtered to adjustment/expired/damaged types',
        description: 'Same shape as `/stock-movements` but pre-filtered, plus an `adjustment_type` (increase/decrease) derived from quantity sign. `approved` is always hard-coded `true` — there is no approval workflow.',
        tags: ['Stock Movements'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'limit', in: 'query', schema: new OA\Schema(type: 'integer', default: 50))],
        responses: [
            new OA\Response(response: 200, description: 'Paginated adjustments', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'success', type: 'boolean'),
                new OA\Property(property: 'data', type: 'array', items: new OA\Items(type: 'object')),
                new OA\Property(property: 'current_page', type: 'integer'),
                new OA\Property(property: 'last_page', type: 'integer'),
                new OA\Property(property: 'total', type: 'integer'),
            ])),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
        ],
    )]
    public function adjustments(Request $request)
    {
        $user = $request->user();
        $limit = $request->get('limit', 50);

        $storeIds = Store::where('user_id', $user->id)->pluck('id')->toArray();
        $userIds = User::whereIn('store_id', $storeIds)->pluck('id')->push($user->id)->toArray();

        $adjustments = StockMovement::whereIn('performed_by', $userIds)
            ->whereIn('movement_type', ['adjustment', 'expired', 'damaged'])
            ->with(['medicine', 'user'])
            ->latest()
            ->paginate($limit);

        $items = collect($adjustments->items())->map(function ($a) {
            return [
                'id' => $a->id,
                'created_at' => $a->created_at ? $a->created_at->toIso8601String() : null,
                'date' => $a->movement_date ? $a->movement_date->toIso8601String() : null,
                'medicine_name' => $a->medicine ? $a->medicine->name : 'Unknown',
                'medicine' => $a->medicine,
                'adjustment_type' => $a->quantity > 0 ? 'increase' : 'decrease',
                'type' => $a->quantity > 0 ? 'increase' : 'decrease',
                'quantity' => $a->quantity,
                'reason' => $a->reason,
                'notes' => $a->reason,
                'user_name' => $a->user ? $a->user->name : 'System',
                'user' => $a->user,
                'approved' => true, // Auto-approved for admin/staff
            ];
        });

        return response()->json([
            'success' => true,
            'data' => $items,
            'current_page' => $adjustments->currentPage(),
            'last_page' => $adjustments->lastPage(),
            'total' => $adjustments->total(),
        ]);
    }
}
