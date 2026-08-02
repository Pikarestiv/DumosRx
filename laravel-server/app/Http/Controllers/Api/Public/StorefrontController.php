<?php

namespace App\Http\Controllers\Api\Public;

use App\Http\Controllers\Controller;
use App\Models\Store;
use App\Models\Product;
use Illuminate\Http\Request;
use OpenApi\Attributes as OA;

class StorefrontController extends Controller
{
    #[OA\Get(
        path: '/storefront/{store_slug}',
        summary: 'Get a public storefront (store info + browsable products)',
        description: "SECURITY/CORRECTNESS NOTE: the product query has no store scoping at all — it returns every store's active, show-online-enabled products globally, not just this store's. Every storefront currently shows an identical, unscoped catalog regardless of `store_slug`.",
        tags: ['Storefront'],
        parameters: [new OA\Parameter(name: 'store_slug', in: 'path', required: true, schema: new OA\Schema(type: 'string'))],
        responses: [
            new OA\Response(response: 200, description: 'Store + products', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'store', type: 'object'),
                new OA\Property(property: 'products', type: 'array', items: new OA\Items(type: 'object')),
            ])),
            new OA\Response(response: 403, description: 'Store is suspended'),
            new OA\Response(response: 404, ref: '#/components/responses/NotFound'),
        ],
    )]
    public function show($store_slug)
    {
        $store = Store::where('store_slug', $store_slug)->firstOrFail();

        // Check if store is suspended
        if ($store->status === 'suspended') {
            return response()->json(['error' => 'Store unavailable'], 403);
        }

        // We fetch products that are active and marked to show online
        $products = Product::with('category')
            ->where('is_active', true)
            ->where('show_online', true)
            ->get();

        return response()->json([
            'store' => [
                'id' => $store->id,
                'name' => $store->name,
                'location' => $store->location,
                'address' => $store->address,
                'phone' => $store->phone,
                'email' => $store->email,
            ],
            'products' => $products
        ]);
    }

    #[OA\Post(
        path: '/storefront/{store_slug}/checkout',
        summary: 'Place a public storefront order',
        description: "SECURITY NOTE: `paystack_reference` is trusted as-is from the client to set `payment_status: paid` when payment_method is paystack — there is no server-side verification of the reference against Paystack's API here. A client can fabricate a reference string and get an order marked paid without having actually paid.",
        tags: ['Storefront'],
        parameters: [new OA\Parameter(name: 'store_slug', in: 'path', required: true, schema: new OA\Schema(type: 'string'))],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(
            required: ['customer_name', 'customer_phone', 'payment_method', 'items'],
            properties: [
                new OA\Property(property: 'customer_name', type: 'string', maxLength: 255),
                new OA\Property(property: 'customer_phone', type: 'string', maxLength: 20),
                new OA\Property(property: 'customer_address', type: 'string', nullable: true, maxLength: 1000),
                new OA\Property(property: 'payment_method', type: 'string', enum: ['paystack', 'transfer', 'in_store']),
                new OA\Property(property: 'paystack_reference', type: 'string', nullable: true),
                new OA\Property(property: 'items', type: 'array', items: new OA\Items(
                    properties: [
                        new OA\Property(property: 'product_id', type: 'string', format: 'uuid'),
                        new OA\Property(property: 'quantity', type: 'integer', minimum: 1),
                    ],
                )),
            ],
        )),
        responses: [
            new OA\Response(response: 201, description: 'Order placed', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'message', type: 'string'),
                new OA\Property(property: 'order', type: 'object'),
            ])),
            new OA\Response(response: 403, description: 'Store is suspended'),
            new OA\Response(response: 404, ref: '#/components/responses/NotFound'),
            new OA\Response(response: 422, ref: '#/components/responses/ValidationError'),
        ],
    )]
    public function checkout(Request $request, $store_slug)
    {
        $store = Store::where('store_slug', $store_slug)->firstOrFail();

        if ($store->status === 'suspended') {
            return response()->json(['error' => 'Store unavailable'], 403);
        }

        $validated = $request->validate([
            'customer_name' => 'required|string|max:255',
            'customer_phone' => 'required|string|max:20',
            'customer_address' => 'nullable|string|max:1000',
            'payment_method' => 'required|in:paystack,transfer,in_store',
            'paystack_reference' => 'nullable|string',
            'items' => 'required|array|min:1',
            'items.*.product_id' => 'required|uuid|exists:products,id',
            'items.*.quantity' => 'required|integer|min:1',
        ]);

        $totalAmount = 0;
        $orderItems = [];

        foreach ($validated['items'] as $item) {
            $product = Product::findOrFail($item['product_id']);
            $subtotal = $product->selling_price * $item['quantity'];
            $totalAmount += $subtotal;

            $orderItems[] = [
                'product_id' => $product->id,
                'quantity' => $item['quantity'],
                'unit_price' => $product->selling_price,
                'subtotal' => $subtotal,
            ];
        }

        $order = \App\Models\OnlineOrder::create([
            'store_id' => $store->id,
            'customer_name' => $validated['customer_name'],
            'customer_phone' => $validated['customer_phone'],
            'customer_address' => $validated['customer_address'],
            'total_amount' => $totalAmount,
            'payment_method' => $validated['payment_method'],
            'payment_status' => $validated['payment_method'] === 'paystack' && $validated['paystack_reference'] ? 'paid' : 'pending',
            'order_status' => 'pending',
            'paystack_reference' => $validated['paystack_reference'] ?? null,
            'synced_at' => now(), // Initial sync timestamp
        ]);

        foreach ($orderItems as $item) {
            $order->items()->create($item);
        }

        // Notify store users
        $storeUsers = $store->users; // Assuming store has users relationship
        if ($storeUsers) {
            foreach ($storeUsers as $user) {
                \App\Models\Notification::create([
                    'user_id' => $user->id,
                    'title' => 'New Online Order',
                    'message' => "Order #{$order->id} placed by {$order->customer_name} for {$totalAmount}.",
                    'type' => 'online_order',
                ]);
            }
        }

        return response()->json([
            'message' => 'Order placed successfully',
            'order' => $order->load('items')
        ], 201);
    }
}
