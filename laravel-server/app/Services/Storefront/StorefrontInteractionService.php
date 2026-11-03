<?php

namespace App\Services\Storefront;

use App\Models\Notification;
use App\Models\OnlineOrder;
use App\Models\StorefrontPrescription;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class StorefrontInteractionService
{
    public function __construct(
        private readonly StorefrontCatalogService $catalogService,
    ) {}

    public function trackOrder(string $storeSlug, string $identifier): JsonResponse
    {
        $storefront = $this->catalogService->resolveStorefront($storeSlug);
        if (! $storefront) {
            return response()->json(['error' => 'Store unavailable'], 404);
        }

        $branches = $this->catalogService->getStorefrontBranches($storefront);
        $storeIds = $branches->pluck('id')->all();

        $order = OnlineOrder::whereIn('store_id', $storeIds)
            ->where(function ($q) use ($identifier) {
                $q->where('id', $identifier)
                    ->orWhere('paystack_reference', $identifier);
            })
            ->with(['items.product', 'store'])
            ->first();

        if (! $order) {
            return response()->json(['message' => 'Order not found.'], 404);
        }

        $customerParts = explode(' ', trim($order->customer_name));
        $maskedName = implode(' ', array_map(function ($part) {
            $len = mb_strlen($part);
            if ($len <= 2) {
                return $part;
            }

            return mb_substr($part, 0, 1).str_repeat('*', $len - 2).mb_substr($part, -1, 1);
        }, $customerParts));

        return response()->json([
            'order' => [
                'id' => $order->id,
                'order_status' => $order->order_status,
                'payment_status' => $order->payment_status,
                'payment_method' => $order->payment_method,
                'total_amount' => $order->total_amount,
                'currency' => $this->catalogService->storeCurrency($order->store),
                'branch_name' => $order->store->name ?? 'Pharmacy Branch',
                'customer_name' => $maskedName,
                'created_at' => $order->created_at?->toIso8601String(),
                'items' => $order->items->map(fn ($item) => [
                    'product_name' => $item->product->name ?? 'Medicine Item',
                    'quantity' => $item->quantity,
                ]),
            ],
        ]);
    }

    public function uploadPrescription(string $storeSlug, Request $request): JsonResponse
    {
        $storefront = $this->catalogService->resolveStorefront($storeSlug);
        if (! $storefront) {
            return response()->json(['error' => 'Store unavailable'], 404);
        }

        $branch = $this->catalogService->resolveBranch(
            $storefront,
            $request->input('branch_id') ?? $request->input('branch'),
            $storeSlug,
        );

        if (! $branch || $branch->isSuspended() || ! $this->catalogService->storefrontEnabled($branch)) {
            return response()->json(['error' => 'Store unavailable'], 404);
        }

        $validated = $request->validate([
            'customer_name' => 'required|string|max:255',
            'customer_phone' => 'required|string|max:50',
            'notes' => 'nullable|string|max:1000',
            'branch_id' => 'nullable|string',
            'prescription_file' => 'required|file|mimes:pdf,jpg,jpeg,png|max:5120',
        ]);

        $path = $request->file('prescription_file')->store('storefront_prescriptions', 'public');

        $rx = StorefrontPrescription::create([
            'storefront_id' => $storefront->id,
            'store_id' => $branch->id,
            'customer_name' => $validated['customer_name'],
            'customer_phone' => $validated['customer_phone'],
            'file_path' => $path,
            'notes' => $validated['notes'] ?? null,
        ]);

        $storeUserIds = User::where('store_id', $branch->id)->orWhere('id', $branch->user_id)->pluck('id');
        Notification::bulkCreateFor($storeUserIds, [
            'title' => 'New Online Prescription',
            'message' => "New prescription #{$rx->prescription_number} uploaded by {$rx->customer_name}.",
            'type' => 'online_prescription',
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Your prescription has been received. Our pharmacy team will review it and contact you.',
            'prescription_number' => $rx->prescription_number,
        ], 201);
    }
}

