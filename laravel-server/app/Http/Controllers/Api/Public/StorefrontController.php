<?php

namespace App\Http\Controllers\Api\Public;

use App\Http\Controllers\Controller;
use App\Http\Resources\StorefrontProductResource;
use App\Models\Store;
use App\Models\Product;
use App\Models\StockBatch;
use App\Models\User;
use App\Services\Payment\PaymentService;
use App\Services\SubscriptionService;
use Illuminate\Http\Request;
use OpenApi\Attributes as OA;

class StorefrontController extends Controller
{
    /**
     * `online_store_enabled` alone isn't enough to gate this: it's a flag
     * on the store row that stays `1` after the account downgrades off (or
     * loses) the plan that includes the `store_url` feature, so the public
     * endpoints must also re-check the owner's current entitlement.
     */
    private function storefrontEnabled(Store $store, SubscriptionService $subscriptionService): bool
    {
        if (! $store->online_store_enabled) {
            return false;
        }

        $owner = User::find($store->user_id);
        if (! $owner) {
            return false;
        }

        return $subscriptionService->hasFeature($owner, 'store_url');
    }

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
        $stores = Store::where('status', '!=', 'suspended')
            ->where('online_store_enabled', true)
            ->whereNotNull('store_slug')
            ->get(['store_slug', 'user_id']);

        // Batched rather than one hasFeature()/getSubscriptionOwner() call
        // per store (each of which runs its own `subscriptions` queries):
        // this is a public, unauthenticated endpoint, so a platform with
        // many storefronts shouldn't turn one GET into ~3 queries per store.
        $systemConfig = \App\Models\SystemConfig::getVal('subscription_plans', []);
        $graceDays = $systemConfig['grace_period_days'] ?? 3;

        // Matches SubscriptionService::hasFeature()'s own two-step lookup
        // (a not-yet-expired subscription, or one still within the grace
        // period) collapsed into the single widest window -- end_date >
        // now() is a subset of end_date > now()->subDays($graceDays), so the
        // latest matching row here is the same one hasFeature() would land
        // on either way.
        $ownerIds = $stores->pluck('user_id')->unique()->values();
        $activePlanByOwner = \App\Models\Subscription::whereIn('user_id', $ownerIds)
            ->where('status', 'active')
            ->where('end_date', '>', now()->subDays($graceDays))
            ->orderByDesc('created_at')
            ->get(['user_id', 'plan_name'])
            ->unique('user_id')
            ->pluck('plan_name', 'user_id');

        $slugs = $stores
            ->filter(function (Store $store) use ($activePlanByOwner, $systemConfig) {
                $plan = $activePlanByOwner->get($store->user_id, 'free');

                return (bool) ($systemConfig['tiers'][$plan]['features']['store_url'] ?? false);
            })
            ->pluck('store_slug')
            ->values();

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
    public function show($store_slug, SubscriptionService $subscriptionService)
    {
        $store = Store::where('store_slug', $store_slug)->firstOrFail();

        // Check if store is suspended
        if ($store->status === 'suspended') {
            return response()->json(['error' => 'Store unavailable'], 403);
        }

        if (! $this->storefrontEnabled($store, $subscriptionService)) {
            return response()->json(['error' => 'Store unavailable'], 404);
        }

        // We fetch products that are active and marked to show online
        $products = Product::with('category')
            ->where('user_id', $store->user_id)
            ->where('is_active', true)
            ->where('show_online', true)
            ->get();

        // Whitelisted through a resource - the raw Product model is unguarded
        // and unhidden, so returning it here published ownership columns
        // (user_id/store_id), the internal margin figure (markup_percentage)
        // and sync bookkeeping to an unauthenticated caller.
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
            'products' => StorefrontProductResource::collection($products),
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
    public function checkout(Request $request, $store_slug, PaymentService $paymentService, SubscriptionService $subscriptionService)
    {
        $store = Store::where('store_slug', $store_slug)->firstOrFail();

        if ($store->status === 'suspended') {
            return response()->json(['error' => 'Store unavailable'], 403);
        }

        if (! $this->storefrontEnabled($store, $subscriptionService)) {
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

        // Scoped to this store's own catalog, AND to the same is_active/
        // show_online filter show() already applies. Without the latter, a
        // product id harvested from an earlier (correctly filtered) catalog
        // response stays purchasable forever even after being deactivated
        // or hidden from the online store - fetched in one batch rather
        // than one query per item.
        $productIds = collect($validated['items'])->pluck('product_id')->unique();
        $products = Product::where('user_id', $store->user_id)
            ->where('is_active', true)
            ->where('show_online', true)
            ->whereIn('id', $productIds)
            ->get()
            ->keyBy('id');

        if ($products->count() !== $productIds->count()) {
            abort(404);
        }

        $totalAmount = 0;
        $orderItems = [];

        foreach ($validated['items'] as $item) {
            $product = $products[$item['product_id']];
            $requestedQty = $item['quantity'];

            // Available stock is the sum of the product's stock batches
            // (products carry no stock field of their own - see
            // 2026_06_27_230048_migrate_stock_and_drop_stock_quantity_from_products).
            // This only checks availability; unlike POS/SaleController it
            // does not deduct anything yet - online orders start "pending"
            // and stock is deducted when staff fulfil them (see the client's
            // useFulfillOnlineOrderMutation), same as before this fix.
            $availableQty = StockBatch::where('product_id', $product->id)->sum('quantity');
            if ($availableQty < $requestedQty) {
                return response()->json([
                    'message' => "Insufficient stock for {$product->name}.",
                ], 422);
            }

            $subtotal = $product->selling_price * $requestedQty;
            $totalAmount += $subtotal;

            $orderItems[] = [
                'product_id' => $product->id,
                'quantity' => $requestedQty,
                'unit_price' => $product->selling_price,
                'subtotal' => $subtotal,
            ];
        }

        // A verified reference stays "successful" at Paystack forever, so a
        // caller can replay the same reference into any number of orders
        // unless we also check it hasn't already been consumed. Checked
        // regardless of payment_method (not just for 'paystack'): the
        // reference column is shared and unique across all orders, so a
        // transfer/in_store order could otherwise consume a reference a
        // genuine Paystack checkout needs later.
        if (!empty($validated['paystack_reference'])) {
            // withTrashed(): OnlineOrder soft-deletes, so a cancelled/deleted
            // order still has permanently consumed its reference - without
            // this the same reference could be replayed by first getting the
            // order it paid for deleted.
            $alreadyUsed = \App\Models\OnlineOrder::withTrashed()
                ->where('paystack_reference', $validated['paystack_reference'])
                ->exists();

            // A subscription payment is recorded in payment_transactions, not
            // online_orders, so without this check a reference already
            // consumed to activate somebody's plan could be replayed here to
            // get storefront goods for free (and vice-versa).
            if (!$alreadyUsed) {
                $alreadyUsed = \App\Models\PaymentTransaction::where('provider_reference', $validated['paystack_reference'])
                    ->exists();
            }

            if ($alreadyUsed) {
                return response()->json([
                    'message' => 'This payment reference has already been used for another order.',
                ], 422);
            }
        }

        $paymentStatus = 'pending';
        if ($validated['payment_method'] === 'paystack') {
            $verification = $paymentService->verifyTransaction($validated['paystack_reference'], 'paystack');

            // The amount is only comparable to the order total if it settled
            // in the same currency the catalogue is priced in.
            $verifiedCurrency = strtoupper((string) ($verification['currency'] ?? ''));
            $expectedCurrency = strtoupper((string) config('payment.currency', 'NGN'));

            if (!($verification['success'] ?? false)
                || $verifiedCurrency !== $expectedCurrency
                || (float) ($verification['amount'] ?? 0) < $totalAmount
            ) {
                return response()->json([
                    'message' => 'Payment could not be verified for this order.',
                ], 422);
            }
            $paymentStatus = 'paid';
        }

        try {
            // The order and its items are written together: a failure
            // part-way through would otherwise leave a paid order with zero
            // items while having permanently burned the payment reference
            // (the unique index means it can never be retried).
            $order = \Illuminate\Support\Facades\DB::transaction(function () use ($store, $validated, $totalAmount, $paymentStatus, $orderItems) {
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

                $order->items()->createMany($orderItems);

                return $order;
            });
        } catch (\Illuminate\Database\QueryException $e) {
            // Belt-and-braces against the check-then-create race: the
            // unique index on paystack_reference is the actual source of
            // truth if two requests for the same reference land concurrently.
            if (!empty($validated['paystack_reference']) && str_contains($e->getMessage(), 'paystack_reference')) {
                return response()->json([
                    'message' => 'This payment reference has already been used for another order.',
                ], 422);
            }
            throw $e;
        }

        // Notify store users. Store has no users() relationship - staff
        // resolve to it via their own store_id, the owner via Store.user_id
        // (same scoping convention used in SaleController/SyncController).
        $storeUserIds = \App\Models\User::where('store_id', $store->id)
            ->orWhere('id', $store->user_id)
            ->pluck('id');
        \App\Models\Notification::bulkCreateFor($storeUserIds, [
            'title' => 'New Online Order',
            'message' => "Order #{$order->id} placed by {$order->customer_name} for {$totalAmount}.",
            'type' => 'online_order',
        ]);

        return response()->json([
            'message' => 'Order placed successfully',
            'order' => $order->load('items')
        ], 201);
    }
}
