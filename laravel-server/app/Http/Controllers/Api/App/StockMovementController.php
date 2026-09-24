<?php

namespace App\Http\Controllers\Api\App;

use App\Http\Controllers\Concerns\ScopesToTenant;
use App\Http\Controllers\Controller;
use App\Models\StockMovement;
use App\Models\Store;
use App\Models\User;
use Illuminate\Http\Request;
use OpenApi\Attributes as OA;

class StockMovementController extends Controller
{
    use ScopesToTenant;

    /**
     * All user ids whose stock movements belong to "the store" from the
     * caller's point of view: every user (owner + staff) across every
     * store owned by the caller's tenant. Resolves through
     * tenantOwnerId() first so a staff caller (whose own id owns no
     * Store row) sees the same ledger their owner would, not an
     * empty/self-only set.
     */
    private function ledgerUserIds(Request $request): array
    {
        $ownerId = $this->tenantOwnerId($request);
        $storeIds = Store::where('user_id', $ownerId)->pluck('id')->toArray();

        return User::whereIn('store_id', $storeIds)->pluck('id')->push($ownerId)->toArray();
    }

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
        $limit = $request->get('limit', 50);
        $userIds = $this->ledgerUserIds($request);

        $movements = StockMovement::whereIn('performed_by', $userIds)
            ->with(['product', 'user'])
            ->latest()
            ->paginate($limit);

        // Map key fields for frontend compatibility
        $items = collect($movements->items())->map(function ($m) {
            return [
                'id' => $m->id,
                'created_at' => $m->created_at ? $m->created_at->toIso8601String() : null,
                'date' => $m->movement_date ? $m->movement_date->toIso8601String() : null,
                'medicine_name' => $m->product ? $m->product->name : 'Unknown',
                'medicine' => $m->product,
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
        description: 'Same shape as `/stock-movements` but pre-filtered, plus an `adjustment_type` (increase/decrease) derived from quantity sign. `approved` is always hard-coded `true`; there is no approval workflow.',
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
        $limit = $request->get('limit', 50);
        $userIds = $this->ledgerUserIds($request);

        $adjustments = StockMovement::whereIn('performed_by', $userIds)
            ->whereIn('movement_type', ['adjustment', 'expired', 'damaged'])
            ->with(['product', 'user'])
            ->latest()
            ->paginate($limit);

        $items = collect($adjustments->items())->map(function ($a) {
            return [
                'id' => $a->id,
                'created_at' => $a->created_at ? $a->created_at->toIso8601String() : null,
                'date' => $a->movement_date ? $a->movement_date->toIso8601String() : null,
                'medicine_name' => $a->product ? $a->product->name : 'Unknown',
                'medicine' => $a->product,
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
