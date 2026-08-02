<?php

namespace App\Http\Controllers\Api\App;

use App\Http\Controllers\Controller;
use App\Models\StockBatch;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use OpenApi\Attributes as OA;

class StockBatchController extends Controller
{
    #[OA\Get(
        path: '/app/stock-batches',
        summary: 'List stock batches',
        tags: ['Stock Batches'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'limit', in: 'query', schema: new OA\Schema(type: 'integer', default: 50))],
        responses: [
            new OA\Response(response: 200, description: 'Paginated batches, with product eager-loaded', content: new OA\JsonContent(type: 'object')),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
        ],
    )]
    public function index(Request $request)
    {
        $limit = $request->get('limit', 50);

        $inventory = StockBatch::where('user_id', $request->user()->id)
            ->with('medicine')
            ->latest()
            ->paginate($limit);

        return response()->json($inventory);
    }

    #[OA\Get(
        path: '/app/stock-batches/low-stock',
        summary: 'List batches at or below their reorder level',
        tags: ['Stock Batches'],
        security: [['sanctum' => []]],
        responses: [
            new OA\Response(response: 200, description: 'Low-stock batches', content: new OA\JsonContent(type: 'array', items: new OA\Items(type: 'object'))),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
        ],
    )]
    public function lowStock(Request $request)
    {
        $inventory = StockBatch::where('user_id', $request->user()->id)
            ->with('medicine')
            ->whereColumn('quantity', '<=', 'reorder_level')
            ->get();

        return response()->json($inventory);
    }

    #[OA\Get(
        path: '/app/stock-batches/expiring',
        summary: 'List batches expiring within N days',
        tags: ['Stock Batches'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'days', in: 'query', description: 'Lookahead window in days', schema: new OA\Schema(type: 'integer', default: 90))],
        responses: [
            new OA\Response(response: 200, description: 'Batches expiring soon, ordered by expiry date ascending', content: new OA\JsonContent(type: 'array', items: new OA\Items(type: 'object'))),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
        ],
    )]
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

    #[OA\Get(
        path: '/app/stock-batches/value',
        summary: 'Total stock value at cost (sum of quantity * cost_price)',
        tags: ['Stock Batches'],
        security: [['sanctum' => []]],
        responses: [
            new OA\Response(response: 200, description: 'Total value', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'total_value', type: 'number', format: 'float'),
            ])),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
        ],
    )]
    public function value(Request $request)
    {
        $totalValue = DB::table('stock_batches')
            ->where('user_id', $request->user()->id)
            ->select(DB::raw('SUM(quantity * cost_price) as total_value'))
            ->value('total_value');

        return response()->json(['total_value' => $totalValue ?? 0]);
    }
}
