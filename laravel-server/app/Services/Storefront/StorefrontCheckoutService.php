<?php

namespace App\Services\Storefront;

use App\Exceptions\PaymentReferenceAlreadyUsedException;
use App\Exceptions\StorefrontStockUnavailableException;
use App\Models\Notification;
use App\Models\OnlineOrder;
use App\Models\OnlineOrderItem;
use App\Models\StockBatch;
use App\Models\Store;
use App\Models\StorefrontPaymentIntent;
use App\Models\User;
use App\Services\Payment\PaymentService;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

class StorefrontCheckoutService
{
    public function __construct(
        private readonly StorefrontCatalogService $catalogService,
        private readonly StorefrontPaymentService $paymentService,
        private readonly StorefrontOrderNotifier $notifier,
    ) {}

    public function availableQuantity(Store $store, string $productId): float
    {
        $inStock = (float) StockBatch::where('product_id', $productId)
            ->where(fn ($q) => $q->where('store_id', $store->id)->orWhereNull('store_id'))
            ->sum('quantity');

        $committed = (float) OnlineOrderItem::where('product_id', $productId)
            ->whereHas('order', fn ($q) => $q
                ->where('store_id', $store->id)
                ->where('order_status', 'pending'))
            ->sum('quantity');

        return $inStock - $committed;
    }

    /**
     * @param  array<int, array{product_id: string, quantity: int}>  $orderItems
     * @param  array<string, string>  $productNames
     */
    public function checkAvailability(Store $store, array $orderItems, array $productNames): ?JsonResponse
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

    /**
     * @param  array<int, array{product_id: string, quantity: int}>  $items
     * @return array{0: float, 1: array, 2: ?JsonResponse, 3: array<string, string>}
     */
    public function priceCart(Store $store, array $items): array
    {
        $productIds = collect($items)->pluck('product_id')->unique();
        $products = $this->catalogService->storeProducts($store)
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

        $stockError = $this->checkAvailability($store, $orderItems, $productNames);
        if ($stockError) {
            return [0.0, [], $stockError, $productNames];
        }

        return [(float) $totalAmount, $orderItems, null, $productNames];
    }

    public function initializePayment(
        Store $store,
        array $validated,
        PaymentService $paymentService,
    ): JsonResponse {
        [$totalAmount, $orderItems, $error] = $this->priceCart($store, $validated['items']);
        if ($error) {
            return $error;
        }

        return $this->paymentService->initializePayment(
            $store,
            $totalAmount,
            $orderItems,
            $validated,
            $paymentService,
        );
    }

    public function placeOrder(
        Store $store,
        array $validated,
        PaymentService $paymentService,
    ): JsonResponse {
        $reference = $validated['payment_method'] === 'paystack'
            ? ($validated['paystack_reference'] ?? null)
            : null;

        try {
            [$totalAmount, $orderItems, $error, $productNames] = $this->priceCart($store, $validated['items']);
        } catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) {
            $refund = $this->paymentService->refundUnfulfillableCheckout($store, $reference, $validated['items'], $paymentService);
            if ($refund) {
                return $refund;
            }
            throw $e;
        }

        if ($error) {
            return $this->paymentService->refundUnfulfillableCheckout($store, $reference, $validated['items'], $paymentService) ?? $error;
        }

        $reuseError = $this->paymentService->checkReferenceNotReused($validated['paystack_reference'] ?? null);
        if ($reuseError) {
            return $reuseError;
        }

        $paymentStatus = 'pending';
        $intent = null;
        if ($validated['payment_method'] === 'paystack') {
            [$payError, $intent] = $this->paymentService->verifyPaystackPayment(
                $store,
                $validated['paystack_reference'],
                $totalAmount,
                $orderItems,
                $paymentService,
            );
            if ($payError) {
                return $payError;
            }
            $paymentStatus = 'paid';
        }

        try {
            $order = DB::transaction(function () use ($store, $validated, $totalAmount, $paymentStatus, $orderItems, $productNames, $intent) {
                Store::where('id', $store->id)->lockForUpdate()->first();

                $stockError = $this->checkAvailability($store, $orderItems, $productNames);
                if ($stockError) {
                    throw new StorefrontStockUnavailableException($stockError);
                }

                if ($intent) {
                    $locked = StorefrontPaymentIntent::where('id', $intent->id)->lockForUpdate()->first();
                    if (! $locked || ! in_array($locked->status, StorefrontPaymentIntent::CLAIMABLE_STATUSES, true)) {
                        throw new PaymentReferenceAlreadyUsedException;
                    }
                }

                $order = OnlineOrder::create([
                    'store_id' => $store->id,
                    'customer_name' => $validated['customer_name'],
                    'customer_phone' => $validated['customer_phone'],
                    'customer_email' => $validated['customer_email'] ?? null,
                    'customer_address' => $validated['customer_address'] ?? null,
                    'fulfilment_method' => $validated['fulfilment_method'] ?? 'pickup',
                    'total_amount' => $totalAmount,
                    'payment_method' => $validated['payment_method'],
                    'payment_status' => $paymentStatus,
                    'order_status' => 'pending',
                    'paystack_reference' => $validated['paystack_reference'] ?? null,
                    'synced_at' => now(),
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
        } catch (StorefrontStockUnavailableException $e) {
            return $this->paymentService->refundUnfulfillableCheckout($store, $reference, $validated['items'], $paymentService)
                ?? $e->getResponse();
        } catch (PaymentReferenceAlreadyUsedException $e) {
            return response()->json(['message' => 'This payment reference has already been used for another order.'], 422);
        } catch (QueryException $e) {
            if (! empty($validated['paystack_reference']) && str_contains($e->getMessage(), 'paystack_reference')) {
                return response()->json(['message' => 'This payment reference has already been used for another order.'], 422);
            }
            throw $e;
        }

        $storeUserIds = User::where('store_id', $store->id)->orWhere('id', $store->user_id)->pluck('id');
        Notification::bulkCreateFor($storeUserIds, [
            'title' => 'New Online Order',
            'message' => "Order #{$order->id} placed by {$order->customer_name} for {$totalAmount}.",
            'type' => 'online_order',
        ]);

        dispatch(fn () => $this->notifier->send($order, $store))->afterResponse();

        return response()->json([
            'message' => 'Order placed successfully',
            'order' => $order->load('items'),
        ], 201);
    }
}
