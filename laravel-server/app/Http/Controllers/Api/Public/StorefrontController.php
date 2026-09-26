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
use Illuminate\Support\Facades\Log;
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

    /**
     * Upper bound on how many products one storefront response returns.
     * Well above any real catalog's online selection, so no existing store is
     * truncated; it exists so an unauthenticated GET can never be asked to
     * serialise an unbounded result set. True pagination is a separate,
     * client-visible change (see docs/STOREFRONT_REVIEW.md, SF-P3-3).
     */
    private const MAX_STOREFRONT_PRODUCTS = 300;

    /**
     * Products this store publishes. Scoped by store_id, not just the owner's
     * user_id: a multi-store owner's storefronts are separate shops and must
     * not list each other's catalogue. Rows predating the store_id backfill
     * (2026_08_14_164310_add_store_id_to_domain_tables) are tolerated via the
     * NULL branch; drop it once a backfill is confirmed.
     */
    private function storeProducts(Store $store): \Illuminate\Database\Eloquent\Builder
    {
        return Product::where('user_id', $store->user_id)
            ->where(fn ($q) => $q->where('store_id', $store->id)->orWhereNull('store_id'))
            ->where('is_active', true)
            ->where('show_online', true);
    }

    /**
     * Stock this store can still promise: its own batches, minus everything
     * already committed to orders that are placed but not yet fulfilled.
     * Online orders don't deduct stock at placement (staff deduct on
     * fulfilment), so without the pending subtraction the last unit sells to
     * every customer who asks for it.
     */
    private function availableQuantity(Store $store, string $productId): float
    {
        $inStock = (float) StockBatch::where('product_id', $productId)
            ->where(fn ($q) => $q->where('store_id', $store->id)->orWhereNull('store_id'))
            ->sum('quantity');

        $committed = (float) \App\Models\OnlineOrderItem::where('product_id', $productId)
            ->whereHas('order', fn ($q) => $q
                ->where('store_id', $store->id)
                ->where('order_status', 'pending'))
            ->sum('quantity');

        return $inStock - $committed;
    }

    /**
     * @return ?\Illuminate\Http\JsonResponse 422 naming the first short line
     */
    private function checkAvailability(Store $store, array $orderItems, array $productNames): ?\Illuminate\Http\JsonResponse
    {
        foreach ($orderItems as $item) {
            if ($this->availableQuantity($store, $item['product_id']) < $item['quantity']) {
                $name = $productNames[$item['product_id']] ?? 'this item';

                return response()->json([
                    'message' => "Insufficient stock for {$name}.",
                ], 422);
            }
        }

        return null;
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

        $products = $this->storeProducts($store)
            ->with('category')
            ->orderBy('name')
            ->limit(self::MAX_STOREFRONT_PRODUCTS)
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

    /**
     * Prices a cart the way checkout() does: scoped to this store's own
     * catalog AND to show()'s is_active/show_online filter, with a stock
     * availability check per line.
     *
     * Shared verbatim by initializeCheckout() and checkout() so the amount a
     * payment reference is minted for can never be derived differently from
     * the amount the resulting order is created for.
     *
     * @return array{0: float, 1: array, 2: ?\Illuminate\Http\JsonResponse, 3: array<string,string>}
     *         [$totalAmount, $orderItems, $errorResponse, $productNamesById]
     */
    private function priceCart(Store $store, array $items): array
    {
        $productIds = collect($items)->pluck('product_id')->unique();
        $products = $this->storeProducts($store)
            ->whereIn('id', $productIds)
            ->get()
            ->keyBy('id');

        if ($products->count() !== $productIds->count()) {
            abort(404);
        }

        $totalAmount = 0;
        $orderItems = [];
        $productNames = $products->pluck('name', 'id')->all();

        foreach ($items as $item) {
            $product = $products[$item['product_id']];
            $requestedQty = $item['quantity'];

            $subtotal = $product->selling_price * $requestedQty;
            $totalAmount += $subtotal;

            $orderItems[] = [
                'product_id' => $product->id,
                'quantity' => $requestedQty,
                'unit_price' => $product->selling_price,
                'subtotal' => $subtotal,
            ];
        }

        // Availability only - nothing is deducted here. Stock leaves the
        // ledger when staff fulfil the order in the POS client (see
        // useFulfillOnlineOrderMutation), which is why availableQuantity()
        // has to net off the orders already waiting to be fulfilled.
        $stockError = $this->checkAvailability($store, $orderItems, $productNames);
        if ($stockError) {
            return [0.0, [], $stockError, $productNames];
        }

        return [(float) $totalAmount, $orderItems, null, $productNames];
    }

    #[OA\Post(
        path: '/storefront/{store_slug}/checkout/initialize',
        summary: 'Start an online (Paystack) storefront payment',
        description: 'Step 1 of the two-step online-payment flow. Prices the cart server-side, asks the payment provider for a reference and checkout URL, and records that reference as reserved for THIS cart on THIS store BEFORE the customer is redirected. Step 2 (`POST /storefront/{store_slug}/checkout` with `payment_method: paystack`) will only accept a `paystack_reference` produced here. Not needed for `transfer`/`in_store` orders, which still post straight to the checkout endpoint.',
        tags: ['Storefront'],
        parameters: [new OA\Parameter(name: 'store_slug', in: 'path', required: true, schema: new OA\Schema(type: 'string'))],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(
            required: ['customer_email', 'items'],
            properties: [
                new OA\Property(property: 'customer_email', type: 'string', format: 'email', description: 'Where the provider sends the receipt; required by Paystack to initialize a charge.'),
                new OA\Property(property: 'items', type: 'array', items: new OA\Items(
                    properties: [
                        new OA\Property(property: 'product_id', type: 'string', format: 'uuid'),
                        new OA\Property(property: 'quantity', type: 'integer', minimum: 1),
                    ],
                )),
            ],
        )),
        responses: [
            new OA\Response(response: 200, description: 'Payment session created', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'success', type: 'boolean'),
                new OA\Property(property: 'message', type: 'string'),
                new OA\Property(property: 'transaction_reference', type: 'string'),
                new OA\Property(property: 'payment_url', type: 'string'),
                new OA\Property(property: 'amount', type: 'number'),
            ])),
            new OA\Response(response: 403, description: 'Store is suspended'),
            new OA\Response(response: 404, ref: '#/components/responses/NotFound'),
            new OA\Response(response: 422, ref: '#/components/responses/ValidationError'),
            new OA\Response(response: 500, ref: '#/components/responses/ServerError'),
        ],
    )]
    public function initializeCheckout(Request $request, $store_slug, PaymentService $paymentService, SubscriptionService $subscriptionService)
    {
        $store = Store::where('store_slug', $store_slug)->firstOrFail();

        if ($store->status === 'suspended') {
            return response()->json(['error' => 'Store unavailable'], 403);
        }

        if (! $this->storefrontEnabled($store, $subscriptionService)) {
            return response()->json(['error' => 'Store unavailable'], 404);
        }

        $validated = $request->validate([
            'customer_email' => 'required|email|max:255',
            'items' => 'required|array|min:1',
            'items.*.product_id' => 'required|uuid|exists:products,id',
            'items.*.quantity' => 'required|integer|min:1',
        ]);

        [$totalAmount, $orderItems, $error] = $this->priceCart($store, $validated['items']);
        if ($error) {
            return $error;
        }

        // The price is never taken from the client (mirrors
        // SubscriptionController::initiatePayment): the amount the reference
        // is minted for is re-derived from the catalog above.
        if ($totalAmount <= 0) {
            return response()->json([
                'success' => false,
                'message' => 'This order cannot be paid for online.',
            ], 422);
        }

        try {
            $payment = $paymentService->initializeTransaction(
                $totalAmount,
                $validated['customer_email'],
                [
                    'purpose' => 'storefront_order',
                    'store_id' => $store->id,
                    'store_slug' => $store->store_slug,
                ],
                // Without this, initializeTransaction() defaults to the
                // subscription-verify page - a paying storefront customer
                // would be redirected there instead, 404 on their reference,
                // and never reach the confirm step below despite the charge
                // succeeding. The storefront frontend's checkout page reads
                // Paystack's own appended ?reference=/&trxref= query params
                // from this URL to drive the confirm call.
                config('app.frontend_url') . "/store/{$store->store_slug}/checkout"
            );

            // Written BEFORE the checkout URL is handed back, so there is
            // never a moment where a live provider session exists that the
            // server has no record of having issued.
            $intent = \App\Models\StorefrontPaymentIntent::create([
                'store_id' => $store->id,
                'reference' => $payment['reference'],
                'provider' => $payment['provider'],
                'amount' => $totalAmount,
                'currency' => strtoupper((string) config('payment.currency', 'NGN')),
                'status' => 'pending',
                'items' => $orderItems,
                'customer_email' => $validated['customer_email'],
            ]);

            return response()->json([
                'success' => true,
                'message' => 'Payment session created',
                'transaction_reference' => $intent->reference,
                'payment_url' => $payment['checkout_url'],
                'amount' => $totalAmount,
            ]);
        } catch (\Exception $e) {
            // Unauthenticated endpoint: $e->getMessage() can carry the raw
            // provider response body (see initializePaystack/Flutterwave's
            // "Paystack Error: " . $response->body()), which is fine to log
            // but not to hand to an anonymous caller.
            Log::error('Storefront checkout initialize failed: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'message' => 'Unable to start checkout. Please try again later.',
            ], 500);
        }
    }

    #[OA\Post(
        path: '/storefront/{store_slug}/checkout',
        summary: 'Place a public storefront order',
        description: 'For `payment_method: paystack`, `paystack_reference` must be one this app itself minted for this exact cart on this exact store via `POST /storefront/{store_slug}/checkout/initialize`, and it must still be unconsumed; it is then additionally verified server-side against the Paystack API (status successful, matching currency, paid amount covering the order total) before the order is marked paid. A fabricated, foreign, replayed or under-paying reference is rejected with a 422.',
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
        [$totalAmount, $orderItems, $error, $productNames] = $this->priceCart($store, $validated['items']);
        if ($error) {
            return $error;
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
        $intent = null;
        if ($validated['payment_method'] === 'paystack') {
            // THE binding check. Everything below it (Paystack says the
            // charge succeeded, in the right currency, for enough money) was
            // already true of any successful charge anywhere on the
            // merchant's Paystack account - a dashboard charge, a payment
            // link, another product sharing the same account - which is why
            // such a reference could be replayed once into a storefront
            // order. A reference only reaches this point legitimately if
            // initializeCheckout() minted it, server-side, for this exact
            // cart on this exact store, before the customer ever saw a
            // checkout URL.
            $intent = \App\Models\StorefrontPaymentIntent::where('reference', $validated['paystack_reference'])
                ->where('store_id', $store->id)
                ->first();

            if (!$intent) {
                return response()->json([
                    'message' => 'Payment could not be verified for this order.',
                ], 422);
            }

            if ($intent->status !== 'pending') {
                return response()->json([
                    'message' => 'This payment reference has already been used for another order.',
                ], 422);
            }

            // Same reference, different basket: without this, one ₦200
            // initialize could be confirmed against any other cart the
            // customer likes, which would reopen the amount gap from the
            // other direction. Fingerprints the CANONICAL $orderItems (same
            // priceCart() call above, same product rows from the DB) rather
            // than the raw client-submitted items: fingerprinting the raw
            // input here would compare against product_ids as the client
            // spelled them (case, formatting) instead of as the catalog
            // resolved them, so a harmless spelling difference a paying
            // customer had no way to avoid could hard-reject an otherwise
            // identical, already-paid-for cart.
            $orderedCart = \App\Models\StorefrontPaymentIntent::cartFingerprint($orderItems);
            $reservedCart = \App\Models\StorefrontPaymentIntent::cartFingerprint($intent->items ?? []);

            if ($orderedCart !== $reservedCart) {
                return response()->json([
                    'message' => 'This payment was started for a different order.',
                ], 422);
            }

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
            $order = \Illuminate\Support\Facades\DB::transaction(function () use ($store, $validated, $totalAmount, $paymentStatus, $orderItems, $productNames, $intent) {
                // Serialises order creation for this one store so the
                // availability re-check below actually holds: two concurrent
                // carts for the last unit would otherwise each read the
                // other's pending order as not-yet-existing (REPEATABLE READ)
                // and both be accepted. Storefront order volume per store is
                // low enough that a per-store lock costs nothing.
                Store::where('id', $store->id)->lockForUpdate()->first();

                $stockError = $this->checkAvailability($store, $orderItems, $productNames);
                if ($stockError) {
                    throw new \App\Exceptions\StorefrontStockUnavailableException($stockError);
                }

                // Consume the reservation under a row lock in the same
                // transaction that creates the order, so two concurrent
                // confirmations of one reference can't both mint an order:
                // the loser blocks here, then sees a non-pending status.
                if ($intent) {
                    $locked = \App\Models\StorefrontPaymentIntent::where('id', $intent->id)
                        ->lockForUpdate()
                        ->first();

                    if (!$locked || $locked->status !== 'pending') {
                        throw new \App\Exceptions\PaymentReferenceAlreadyUsedException();
                    }
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

                $order->items()->createMany($orderItems);

                if ($intent) {
                    $locked->update([
                        'status' => 'consumed',
                        'online_order_id' => $order->id,
                        'consumed_at' => now(),
                    ]);
                }

                return $order;
            });
        } catch (\App\Exceptions\StorefrontStockUnavailableException $e) {
            return $e->getResponse();
        } catch (\App\Exceptions\PaymentReferenceAlreadyUsedException $e) {
            return response()->json([
                'message' => 'This payment reference has already been used for another order.',
            ], 422);
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
