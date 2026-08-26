<?php

namespace App\Http\Controllers\Api\Public;

use App\Http\Controllers\Controller;
use App\Models\Store;
use App\Models\Product;
use App\Services\Payment\PaymentService;
use Illuminate\Http\Request;
use OpenApi\Attributes as OA;

class StorefrontController extends Controller
{
    #[OA\Get(
        path: '/storefront-slugs',
        summary: 'List every store slug with an active online store',
        description: 'Used at build time by the static-export storefront site (web/) to enumerate which `[store_slug]` pages to pre-render. A static export cannot render arbitrary dynamic routes at request time, so any slug missing from this list 404s in production regardless of whether the store itself exists.',
        tags: ['Storefront'],
        responses: [
            new OA\Response(response: 200, description: 'Slugs', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'slugs', type: 'array', items: new OA\Items(type: 'string')),
            ])),
        ],
    )]
    public function slugs()
    {
        $slugs = Store::where('status', '!=', 'suspended')
            ->where('online_store_enabled', true)
            ->whereNotNull('store_slug')
            ->pluck('store_slug');

        return response()->json(['slugs' => $slugs]);
    }

    #[OA\Get(
        path: '/storefront/{store_slug}',
        summary: 'Get a public storefront (store info + browsable products)',
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

        if (! $store->online_store_enabled) {
            return response()->json(['error' => 'Store unavailable'], 404);
        }

        // We fetch products that are active and marked to show online
        $products = Product::with('category')
            ->where('user_id', $store->user_id)
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
                'logo_url' => $store->logo_url,
            ],
            'products' => $products
        ]);
    }

    #[OA\Post(
        path: '/storefront/{store_slug}/checkout',
        summary: 'Place a public storefront order',
        description: 'For `payment_method: paystack`, `paystack_reference` is verified server-side against the Paystack API (status must be successful and the paid amount must cover the order total) before the order is marked paid. A fabricated or under-paying reference is rejected with a 422.',
        tags: ['Storefront'],
        parameters: [new OA\Parameter(name: 'store_slug', in: 'path', required: true, schema: new OA\Schema(type: 'string'))],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(
            required: ['customer_name', 'customer_phone', 'payment_method', 'items'],
            properties: [
                new OA\Property(property: 'customer_name', type: 'string', maxLength: 255),
                new OA\Property(property: 'customer_phone', type: 'string', maxLength: 20),
                new OA\Property(property: 'customer_address', type: 'string', nullable: true, maxLength: 1000),
                new OA\Property(property: 'payment_method', type: 'string', enum: ['paystack', 'transfer', 'in_store']),
                new OA\Property(property: 'paystack_reference', type: 'string', nullable: true, description: 'Required when payment_method is paystack'),
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
            new OA\Response(response: 422, ref: '#/components/responses/ValidationError', description: 'Validation failure, or Paystack reference could not be verified / didn\'t cover the order total'),
        ],
    )]
    public function checkout(Request $request, $store_slug, PaymentService $paymentService)
    {
        $store = Store::where('store_slug', $store_slug)->firstOrFail();

        if ($store->status === 'suspended') {
            return response()->json(['error' => 'Store unavailable'], 403);
        }

        if (! $store->online_store_enabled) {
            return response()->json(['error' => 'Store unavailable'], 404);
        }

        $validated = $request->validate([
            'customer_name' => 'required|string|max:255',
            'customer_phone' => 'required|string|max:20',
            'customer_address' => 'nullable|string|max:1000',
            'payment_method' => 'required|in:paystack,transfer,in_store',
            'paystack_reference' => 'required_if:payment_method,paystack|nullable|string',
            'items' => 'required|array|min:1',
            'items.*.product_id' => 'required|uuid|exists:products,id',
            'items.*.quantity' => 'required|integer|min:1',
        ]);

        $totalAmount = 0;
        $orderItems = [];

        foreach ($validated['items'] as $item) {
            // Scoped to this store's own catalog. A product ID belonging to
            // a different store must not be purchasable through this store's
            // checkout.
            $product = Product::where('user_id', $store->user_id)->findOrFail($item['product_id']);
            $subtotal = $product->selling_price * $item['quantity'];
            $totalAmount += $subtotal;

            $orderItems[] = [
                'product_id' => $product->id,
                'quantity' => $item['quantity'],
                'unit_price' => $product->selling_price,
                'subtotal' => $subtotal,
            ];
        }

        $paymentStatus = 'pending';
        if ($validated['payment_method'] === 'paystack') {
            $verification = $paymentService->verifyTransaction($validated['paystack_reference'], 'paystack');
            if (!($verification['success'] ?? false) || (float) ($verification['amount'] ?? 0) < $totalAmount) {
                return response()->json([
                    'message' => 'Payment could not be verified for this order.',
                ], 422);
            }
            $paymentStatus = 'paid';
        }

        $order = \App\Models\OnlineOrder::create([
            'store_id' => $store->id,
            'customer_name' => $validated['customer_name'],
            'customer_phone' => $validated['customer_phone'],
            'customer_address' => $validated['customer_address'] ?? null,
            'total_amount' => $totalAmount,
            'payment_method' => $validated['payment_method'],
            'payment_status' => $paymentStatus,
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
