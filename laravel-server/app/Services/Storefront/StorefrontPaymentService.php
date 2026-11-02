<?php

namespace App\Services\Storefront;

use App\Models\OnlineOrder;
use App\Models\PaymentTransaction;
use App\Models\Store;
use App\Models\StorefrontPaymentIntent;
use App\Services\Payment\PaymentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Log;

class StorefrontPaymentService
{
    public function __construct(
        private readonly StorefrontCatalogService $catalogService,
    ) {}

    /**
     * @param  array<int, array{product_id: string, quantity: int}>  $submittedItems
     */
    public function refundUnfulfillableCheckout(
        Store $store,
        ?string $reference,
        array $submittedItems,
        PaymentService $paymentService,
    ): ?JsonResponse {
        if (! $reference) {
            return null;
        }

        $intent = StorefrontPaymentIntent::where('reference', $reference)
            ->where('store_id', $store->id)
            ->whereIn('status', StorefrontPaymentIntent::CLAIMABLE_STATUSES)
            ->first();

        if (! $intent) {
            return null;
        }

        $submittedCart = StorefrontPaymentIntent::cartFingerprint($submittedItems);
        $reservedCart = StorefrontPaymentIntent::cartFingerprint($intent->items ?? []);

        if ($submittedCart !== $reservedCart) {
            return null;
        }

        $verification = $paymentService->verifyTransaction($reference, $intent->provider);
        if (! ($verification['success'] ?? false)) {
            return null;
        }

        $refund = $paymentService->refundTransaction($reference, $intent->provider);

        if (! ($refund['success'] ?? false)) {
            Log::error('Storefront refund failed for an unfulfillable paid checkout', [
                'store_id' => $store->id,
                'reference' => $reference,
                'message' => $refund['message'] ?? null,
            ]);

            return response()->json([
                'message' => "Your payment went through but this order can no longer be fulfilled, and the refund could not be completed automatically. Please contact the store with reference {$reference}.",
                'refunded' => false,
            ], 422);
        }

        $intent->update(['status' => 'refunded']);

        return response()->json([
            'message' => "Your payment went through but this order can no longer be fulfilled - it is being refunded. Reference {$reference}.",
            'refunded' => true,
        ], 422);
    }

    /**
     * @param  array<int, array{product_id: string, quantity: int, unit_price: float, subtotal: float}>  $orderItems
     */
    public function initializePayment(
        Store $store,
        float $totalAmount,
        array $orderItems,
        array $validated,
        PaymentService $paymentService,
    ): JsonResponse {
        if ($totalAmount <= 0) {
            return response()->json([
                'success' => false,
                'message' => 'This order cannot be paid for online.',
            ], 422);
        }

        if (! $store->paystack_subaccount_code) {
            return response()->json([
                'success' => false,
                'message' => 'This store cannot accept online payments yet.',
            ], 422);
        }

        try {
            $currency = $this->catalogService->storeCurrency($store);
            $payment = $paymentService->initializeStorefrontTransaction(
                $totalAmount,
                $validated['customer_email'],
                [
                    'purpose' => 'storefront_order',
                    'store_id' => $store->id,
                    'store_slug' => $store->store_slug,
                ],
                config('app.frontend_url')."/store/{$store->store_slug}/checkout",
                $store->paystack_subaccount_code,
                $currency,
            );

            $intent = StorefrontPaymentIntent::create([
                'store_id' => $store->id,
                'reference' => $payment['reference'],
                'provider' => $payment['provider'],
                'amount' => $totalAmount,
                'currency' => $currency,
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
            Log::error('Storefront checkout initialize failed: '.$e->getMessage());

            return response()->json([
                'success' => false,
                'message' => 'Unable to start checkout. Please try again later.',
            ], 500);
        }
    }

    public function checkReferenceNotReused(?string $reference): ?JsonResponse
    {
        if (empty($reference)) {
            return null;
        }

        $alreadyUsed = OnlineOrder::withTrashed()
            ->where('paystack_reference', $reference)
            ->exists();

        if (! $alreadyUsed) {
            $alreadyUsed = PaymentTransaction::where('provider_reference', $reference)
                ->exists();
        }

        if ($alreadyUsed) {
            return response()->json([
                'message' => 'This payment reference has already been used for another order.',
            ], 422);
        }

        return null;
    }

    /**
     * @param  array<int, array{product_id: string, quantity: int, unit_price: float, subtotal: float}>  $orderItems
     * @return array{0: ?JsonResponse, 1: ?StorefrontPaymentIntent}
     */
    public function verifyPaystackPayment(
        Store $store,
        string $reference,
        float $totalAmount,
        array $orderItems,
        PaymentService $paymentService,
    ): array {
        $intent = StorefrontPaymentIntent::where('reference', $reference)
            ->where('store_id', $store->id)
            ->first();

        if (! $intent) {
            return [response()->json(['message' => 'Payment could not be verified for this order.'], 422), null];
        }

        if (! in_array($intent->status, StorefrontPaymentIntent::CLAIMABLE_STATUSES, true)) {
            return [response()->json(['message' => 'This payment reference has already been used for another order.'], 422), null];
        }

        $orderedCart = StorefrontPaymentIntent::cartFingerprint($orderItems);
        $reservedCart = StorefrontPaymentIntent::cartFingerprint($intent->items ?? []);

        if ($orderedCart !== $reservedCart) {
            return [response()->json(['message' => 'This payment was started for a different order.'], 422), null];
        }

        $verification = $paymentService->verifyTransaction($reference, $intent->provider);

        if ($verification['unknown'] ?? false) {
            return [
                response()->json([
                    'message' => "We could not reach the payment provider to confirm this payment, so this order has not been placed. Do not pay again — contact the store with reference {$reference}.",
                ], 503),
                null,
            ];
        }

        $verifiedCurrency = strtoupper((string) ($verification['currency'] ?? ''));
        $expectedCurrency = strtoupper((string) ($intent->currency ?: $this->catalogService->storeCurrency($store)));

        if (! ($verification['success'] ?? false)
            || $verifiedCurrency !== $expectedCurrency
            || (float) ($verification['amount'] ?? 0) < $totalAmount
        ) {
            return [response()->json(['message' => 'Payment could not be verified for this order.'], 422), null];
        }

        return [null, $intent];
    }
}
