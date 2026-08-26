<?php

namespace App\Http\Controllers\Api\App;

use App\Http\Controllers\Controller;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\StockBatch;
use App\Models\User;
use App\Models\Store;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use OpenApi\Attributes as OA;

class SaleController extends Controller
{
    #[OA\Get(
        path: '/app/sales',
        summary: "List the store's sales (all staff)",
        tags: ['Sales'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'limit', in: 'query', schema: new OA\Schema(type: 'integer', default: 50))],
        responses: [
            new OA\Response(response: 200, description: 'Paginated sales, with items/customer/cashier eager-loaded', content: new OA\JsonContent(type: 'object')),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
        ],
    )]
    public function index(Request $request)
    {
        $limit = $request->get('limit', 50);
        $user = $request->user();

        if ($user->store_id) {
            $userIds = User::where('store_id', $user->store_id)->pluck('id')->toArray();
        } else {
            $storeIds = Store::where('user_id', $user->id)->pluck('id')->toArray();
            $userIds = User::whereIn('store_id', $storeIds)->pluck('id')->push($user->id)->toArray();
        }

        $sales = Sale::whereIn('cashier_id', $userIds)
            ->with('items', 'customer', 'cashier')
            ->latest()
            ->paginate($limit);

        return response()->json($sales);
    }

    #[OA\Post(
        path: '/app/sales',
        summary: 'Record a sale (POS checkout)',
        description: 'NOTE: item price is trusted from the request body (`unit_price`) rather than looked up server-side from the current product/batch price; client is responsible for sending the correct price.',
        tags: ['Sales'],
        security: [['sanctum' => []]],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(
            required: ['items', 'payment_method'],
            properties: [
                new OA\Property(property: 'items', type: 'array', items: new OA\Items(
                    properties: [
                        new OA\Property(property: 'product_id', type: 'string'),
                        new OA\Property(property: 'quantity', type: 'integer', minimum: 1),
                        new OA\Property(property: 'unit_price', type: 'number', format: 'float'),
                    ],
                )),
                new OA\Property(property: 'payment_method', type: 'string'),
                new OA\Property(property: 'customer_id', type: 'string', nullable: true),
            ],
        )),
        responses: [
            new OA\Response(response: 201, description: 'Sale recorded', content: new OA\JsonContent(type: 'object')),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
            new OA\Response(response: 422, ref: '#/components/responses/ValidationError'),
        ],
    )]
    public function store(Request $request)
    {
        $request->validate([
            'items' => 'required|array',
            'items.*.product_id' => 'required|exists:products,id',
            'items.*.quantity' => 'required|integer|min:1',
            'payment_method' => 'required|string',
            'customer_id' => 'nullable|exists:customers,id',
        ]);

        $user = $request->user();
        $tenantId = $user->store_id ? (Store::find($user->store_id)?->user_id ?? $user->id) : $user->id;

        return DB::transaction(function () use ($request, $user, $tenantId) {
            // Create Sale Header
            $sale = Sale::create([
                'user_id' => $user->id,
                'customer_id' => $request->customer_id,
                'payment_method' => $request->payment_method,
                'total_amount' => 0, // Will update
                'status' => 'completed',
                'invoice_number' => 'INV-' . strtoupper(uniqid())
            ]);

            $total = 0;

            foreach ($request->items as $item) {
                // Get price scoped to tenant inventory
                $inventory = StockBatch::where('user_id', $tenantId)
                    ->where('product_id', $item['product_id'])
                    ->first(); 
                
                $price = 0; 
                $subtotal = 0;
                
                // Create Item
                $saleItem = new SaleItem([
                    'product_id' => $item['product_id'],
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

    #[OA\Get(
        path: '/app/sales/{sale}',
        summary: 'Get a single sale',
        tags: ['Sales'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'sale', in: 'path', required: true, schema: new OA\Schema(type: 'string'))],
        responses: [
            new OA\Response(response: 200, description: 'The sale, with items/customer/cashier eager-loaded', content: new OA\JsonContent(type: 'object')),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
            new OA\Response(response: 404, ref: '#/components/responses/NotFound'),
        ],
    )]
    public function show(Request $request, $id)
    {
        $user = $request->user();

        if ($user->store_id) {
            $userIds = User::where('store_id', $user->store_id)->pluck('id')->toArray();
        } else {
            $storeIds = Store::where('user_id', $user->id)->pluck('id')->toArray();
            $userIds = User::whereIn('store_id', $storeIds)->pluck('id')->push($user->id)->toArray();
        }

        $sale = Sale::whereIn('cashier_id', $userIds)
            ->with('items', 'customer', 'cashier')
            ->findOrFail($id);

        return response()->json($sale);
    }

    #[OA\Get(
        path: '/app/sales/daily',
        summary: 'Get sales totals for a single day',
        tags: ['Sales'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'date', in: 'query', description: 'Defaults to today', schema: new OA\Schema(type: 'string', format: 'date'))],
        responses: [
            new OA\Response(response: 200, description: 'Daily totals', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'date', type: 'string', format: 'date'),
                new OA\Property(property: 'total_sales', type: 'number'),
                new OA\Property(property: 'transaction_count', type: 'integer'),
                new OA\Property(property: 'sales', type: 'array', items: new OA\Items(type: 'object')),
            ])),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
        ],
    )]
    public function dailySales(Request $request)
    {
        $date = $request->get('date', now()->toDateString());
        $user = $request->user();

        if ($user->store_id) {
            $userIds = User::where('store_id', $user->store_id)->pluck('id')->toArray();
        } else {
            $storeIds = Store::where('user_id', $user->id)->pluck('id')->toArray();
            $userIds = User::whereIn('store_id', $storeIds)->pluck('id')->push($user->id)->toArray();
        }

        $sales = Sale::whereIn('cashier_id', $userIds)
            ->whereDate('created_at', $date)
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

    #[OA\Get(
        path: '/app/sales/top-products',
        summary: 'Best-selling products by quantity sold (all-time)',
        tags: ['Sales'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'limit', in: 'query', schema: new OA\Schema(type: 'integer', default: 10))],
        responses: [
            new OA\Response(response: 200, description: 'Top products', content: new OA\JsonContent(type: 'array', items: new OA\Items(properties: [
                new OA\Property(property: 'name', type: 'string'),
                new OA\Property(property: 'total_quantity', type: 'integer'),
            ]))),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
        ],
    )]
    public function topProducts(Request $request)
    {
        $limit = $request->get('limit', 10);
        $user = $request->user();

        if ($user->store_id) {
            $userIds = User::where('store_id', $user->store_id)->pluck('id')->toArray();
        } else {
            $storeIds = Store::where('user_id', $user->id)->pluck('id')->toArray();
            $userIds = User::whereIn('store_id', $storeIds)->pluck('id')->push($user->id)->toArray();
        }

        $topWithNames = DB::table('sale_items')
            ->join('sales', 'sale_items.sale_id', '=', 'sales.id')
            ->join('products', 'sale_items.product_id', '=', 'products.id')
            ->whereIn('sales.cashier_id', $userIds)
            ->select('products.name', DB::raw('SUM(sale_items.quantity) as total_quantity'))
            ->groupBy('products.id', 'products.name')
            ->orderByDesc('total_quantity')
            ->limit($limit)
            ->get();

        return response()->json($topWithNames);
    }
}
