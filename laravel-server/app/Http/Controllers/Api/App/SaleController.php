<?php

namespace App\Http\Controllers\Api\App;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\SaleItemBatch;
use App\Models\StockBatch;
use App\Models\StockMovement;
use App\Models\User;
use App\Models\Store;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
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
        description: "Item price is looked up server-side from the product's current `selling_price` - any `unit_price` sent in the request body is ignored. Stock is checked and deducted FEFO (earliest-expiring batch first) across the product's stock batches; the sale is rejected with a 422 if there isn't enough stock.",
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
        $user = $request->user();

        // Same store-resolution convention used elsewhere in this
        // controller/SyncController: staff carry a fixed `store_id` pointing
        // at the Store row; an owner is found by owning a Store. $tenantId is
        // the store owner's user id, which is how products/stock_batches are
        // actually scoped (Product.user_id, StockBatch.user_id) - $store->id
        // is the separate value `sales.store_id` itself expects.
        $store = $user->store_id
            ? Store::find($user->store_id)
            : Store::where('user_id', $user->id)->first();
        $tenantId = $store?->user_id ?? $user->id;

        $request->validate([
            'items' => 'required|array|min:1',
            'items.*.product_id' => ['required', Rule::exists('products', 'id')->where('user_id', $tenantId)],
            'items.*.quantity' => 'required|integer|min:1',
            'payment_method' => 'required|string|in:cash,card,transfer,mobile_money,insurance,mixed,credit',
            'customer_id' => ['nullable', Rule::exists('customers', 'id')->where('user_id', $tenantId)],
            'amount_paid' => 'nullable|numeric|min:0',
        ]);

        return DB::transaction(function () use ($request, $user, $tenantId, $store) {
            $productIds = collect($request->items)->pluck('product_id')->unique();

            // Scoped to the caller's own tenant - validated above via
            // Rule::exists()->where(), re-fetched here (rather than trusted
            // from the request) so price/name come from the real record.
            $products = Product::where('user_id', $tenantId)
                ->whereIn('id', $productIds)
                ->get()
                ->keyBy('id');

            if ($products->count() !== $productIds->count()) {
                abort(422, 'One or more products are invalid for this store.');
            }

            // Price is always looked up server-side from the product's
            // current selling_price - a client-submitted `unit_price` is
            // ignored. Unlike the app's real offline-first sale path
            // (client's local-database.ts createSale(), pushed to the
            // server only via SyncController's version-checked sync), this
            // REST endpoint creates the Sale directly and is not part of
            // that trusted device-sync flow, so there's no equivalent
            // architectural reason to trust a client-supplied price here.
            $lines = [];
            $total = 0;
            foreach ($request->items as $item) {
                $product = $products[$item['product_id']];
                $quantity = (int) $item['quantity'];
                $unitPrice = (float) $product->selling_price;
                $subtotal = round($unitPrice * $quantity, 2);
                $total += $subtotal;

                $lines[] = [
                    'product' => $product,
                    'quantity' => $quantity,
                    'unit_price' => $unitPrice,
                    'total_price' => $subtotal,
                ];
            }

            // Stock check + FEFO deduction (earliest-expiring batch first,
            // spilling into the next batch once one is exhausted) - the same
            // approach the client's own POS checkout uses
            // (lib/db/queries/inventory.ts recordSaleItemStock()). Rows are
            // locked for the duration of this transaction so two concurrent
            // sales against the same batch can't both read the same
            // pre-deduction quantity.
            foreach ($lines as &$line) {
                $remaining = $line['quantity'];

                // Batches are the physical per-store inventory entity (unlike
                // Product, which is a tenant-wide catalog row shared across a
                // multi-store owner's locations) - scoped by store_id (with a
                // null-store_id fallback for rows predating the store_id
                // backfill, same "fail open for legacy data" reasoning used
                // in SyncController) so a sale recorded against one store
                // can't dispense stock physically held at another.
                // is_active/expiry filtered and NULL-expiry sorted last so an
                // inactive or already-expired batch is never dispensed and
                // never jumps the FEFO queue ahead of dated batches.
                $batches = StockBatch::where('user_id', $tenantId)
                    ->where('product_id', $line['product']->id)
                    ->where('quantity', '>', 0)
                    ->where('is_active', true)
                    ->whereRaw('(expiry_date IS NULL OR expiry_date > ?)', [now()])
                    ->where(function ($q) use ($store) {
                        $q->whereNull('store_id')->orWhere('store_id', $store?->id);
                    })
                    ->orderByRaw('expiry_date IS NULL')
                    ->orderBy('expiry_date')
                    ->lockForUpdate()
                    ->get();

                if ($batches->sum('quantity') < $remaining) {
                    abort(422, "Insufficient stock for {$line['product']->name}.");
                }

                $costTotal = 0;
                foreach ($batches as $batch) {
                    if ($remaining <= 0) {
                        break;
                    }

                    $deduct = min($remaining, $batch->quantity);
                    $batch->quantity -= $deduct;
                    $batch->save();
                    $remaining -= $deduct;
                    $costTotal += ($batch->cost_price ?? 0) * $deduct;

                    $line['movements'][] = [
                        'stock_batch_id' => $batch->id,
                        'quantity' => $deduct,
                        'unit_cost' => $batch->cost_price,
                    ];
                }

                $line['cost_price'] = $line['quantity'] > 0 ? $costTotal / $line['quantity'] : 0;
            }
            unset($line);

            $amountPaid = $request->filled('amount_paid') ? (float) $request->amount_paid : $total;

            $sale = Sale::create([
                'customer_id' => $request->customer_id,
                'cashier_id' => $user->id,
                'store_id' => $store?->id,
                'payment_method' => $request->payment_method,
                'payment_status' => 'completed',
                'subtotal' => $total,
                'total_amount' => $total,
                'amount_paid' => $amountPaid,
                'change_given' => max(0, round($amountPaid - $total, 2)),
            ]);

            foreach ($lines as $line) {
                $saleItem = $sale->items()->create([
                    'product_id' => $line['product']->id,
                    'quantity' => $line['quantity'],
                    'unit_price' => $line['unit_price'],
                    'total_price' => $line['total_price'],
                    'cost_price' => $line['cost_price'],
                ]);

                foreach ($line['movements'] ?? [] as $movement) {
                    StockMovement::create([
                        'stock_batch_id' => $movement['stock_batch_id'],
                        'product_id' => $line['product']->id,
                        'store_id' => $store?->id,
                        'movement_type' => 'sale',
                        'quantity' => -$movement['quantity'],
                        'unit_cost' => $movement['unit_cost'],
                        'total_cost' => $movement['unit_cost'] !== null ? $movement['unit_cost'] * $movement['quantity'] : null,
                        'reference_id' => $sale->id,
                        'reference_type' => 'sale',
                        'performed_by' => $user->id,
                        'movement_date' => now(),
                    ]);

                    SaleItemBatch::create([
                        'sale_item_id' => $saleItem->id,
                        'stock_batch_id' => $movement['stock_batch_id'],
                        'quantity' => $movement['quantity'],
                    ]);
                }
            }

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
