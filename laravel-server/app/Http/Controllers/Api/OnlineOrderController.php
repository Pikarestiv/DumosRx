<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Concerns\ScopesToTenant;
use App\Http\Controllers\Controller;
use App\Models\OnlineOrder;
use App\Models\Notification;
use App\Models\Store;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use OpenApi\Attributes as OA;

class OnlineOrderController extends Controller
{
    use ScopesToTenant;

    private const MAX_ORDERS_PER_PAGE = 50;

    /**
     * Which store this request's online orders belong to. A store owner's
     * own `users.store_id` column is deliberately always null (they "have"
     * a store only via `stores.user_id`, not `users.store_id` — see
     * `User::employerStore()`'s doc block) — gating on `$user->store_id`
     * directly, as both endpoints below used to, always failed with "No
     * store associated" for an owner, who is exactly who this endpoint is
     * for. Resolves the same way `SyncController::resolvePushStoreId` does:
     * `X-Store-Id` when present and owned by the caller's tenant (letting a
     * multi-store owner pick which store's orders they're viewing/
     * fulfilling), else the caller's own `store_id` (staff), else their
     * first owned store.
     */
    private function resolveOrderStoreId(Request $request): ?string
    {
        $user = $request->user();
        $ownerId = $this->tenantOwnerId($request);

        $requestedStoreId = $request->header('X-Store-Id');
        if ($requestedStoreId) {
            $owns = Store::where('id', $requestedStoreId)->where('user_id', $ownerId)->exists();
            if ($owns) {
                return $requestedStoreId;
            }
        }

        return $user->store_id ?? Store::where('user_id', $ownerId)->value('id');
    }

    #[OA\Get(
        path: '/app/online-orders',
        summary: 'List orders placed through the storefront for the caller\'s store',
        tags: ['Online Orders'],
        security: [['sanctum' => []]],
        parameters: [
            new OA\Parameter(name: 'status', in: 'query', required: false, description: 'Restrict to one order_status (the actionable set is `pending`).', schema: new OA\Schema(type: 'string', enum: ['pending', 'packed', 'fulfilled', 'cancelled'])),
        ],
        responses: [
            new OA\Response(response: 200, description: 'Most recent orders, newest first, with items/product eager-loaded', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'orders', type: 'array', items: new OA\Items(type: 'object')),
                new OA\Property(property: 'has_more', type: 'boolean', description: 'True when older orders exist beyond this page.'),
            ])),
            new OA\Response(response: 400, description: 'Caller has no associated store'),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
            new OA\Response(response: 422, ref: '#/components/responses/ValidationError'),
        ],
    )]
    public function index(Request $request)
    {
        $storeId = $this->resolveOrderStoreId($request);
        if (!$storeId) {
            return response()->json(['error' => 'No store associated'], 400);
        }

        $validated = $request->validate([
            'status' => 'sometimes|in:pending,packed,fulfilled,cancelled',
        ]);

        // Bounded per .agents/AGENTS.md §8: this used to return every order the
        // store had ever received, with items and products eager-loaded, and
        // the POS modal rendered all of them. A deeper history needs a real
        // paginated view rather than a bigger page.
        $orders = OnlineOrder::with('items.product')
            ->where('store_id', $storeId)
            ->when($validated['status'] ?? null, fn ($q, $status) => $q->where('order_status', $status))
            ->orderBy('created_at', 'desc')
            ->limit(self::MAX_ORDERS_PER_PAGE + 1)
            ->get();

        $hasMore = $orders->count() > self::MAX_ORDERS_PER_PAGE;

        return response()->json([
            'orders' => $orders->take(self::MAX_ORDERS_PER_PAGE)->values(),
            'has_more' => $hasMore,
        ]);
    }

    #[OA\Post(
        path: '/app/online-orders/{id}/fulfill',
        summary: 'Mark a storefront order fulfilled or cancelled',
        description: 'Only a `pending` order can transition; anything else is a 409, so a retry after a partial client-side failure is safe. `payment_status` is only promoted to `paid` when the caller passes `payment_confirmed: true` (the POS does, at the moment staff hand goods over and take the money) - fulfilling alone is not treated as evidence of payment. Cancelling an already-paid order flags a refund for the store rather than silently discarding it. Clears any matching unread "online_order" notification for the caller.',
        tags: ['Online Orders'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'string'))],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(
            required: ['status'],
            properties: [
                new OA\Property(property: 'status', type: 'string', enum: ['fulfilled', 'cancelled']),
                new OA\Property(property: 'payment_confirmed', type: 'boolean', description: 'The caller asserts money was actually collected. Defaults to false; an already-`paid` order is unaffected either way.'),
            ],
        )),
        responses: [
            new OA\Response(response: 200, description: 'Updated', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'message', type: 'string'),
                new OA\Property(property: 'order', type: 'object'),
            ])),
            new OA\Response(response: 400, description: 'Caller has no associated store'),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
            new OA\Response(response: 404, ref: '#/components/responses/NotFound'),
            new OA\Response(response: 409, description: 'Order is no longer pending, so it cannot transition again'),
            new OA\Response(response: 422, ref: '#/components/responses/ValidationError'),
        ],
    )]
    public function markFulfilled(Request $request, $id, \App\Services\Payment\PaymentService $paymentService)
    {
        $user = Auth::user();
        $storeId = $this->resolveOrderStoreId($request);
        if (!$storeId) {
            return response()->json(['error' => 'No store associated'], 400);
        }

        $order = OnlineOrder::where('store_id', $storeId)->findOrFail($id);

        $validated = $request->validate([
            'status' => 'required|in:fulfilled,cancelled',
            'payment_confirmed' => 'sometimes|boolean',
        ]);

        // Only `pending` transitions. Without this the endpoint would re-fulfil
        // an already-fulfilled order or fulfil a cancelled one, which is also
        // what made the POS client's retry-after-local-failure unsafe (the
        // client now writes its local sale first - see
        // useFulfillOnlineOrderMutation).
        if ($order->order_status !== 'pending') {
            return response()->json([
                'message' => "This order is already {$order->order_status} and cannot be updated again.",
                'order' => $order,
            ], 409);
        }

        $order->order_status = $validated['status'];

        // Fulfilment is not by itself evidence of payment: a `transfer` order
        // may never have had its transfer confirmed, and `in_store` is
        // collected at handover. The caller has to say so.
        if ($validated['status'] === 'fulfilled' && ($validated['payment_confirmed'] ?? false)) {
            $order->payment_status = 'paid';
        }

        $order->save();

        if ($validated['status'] === 'cancelled' && $order->payment_status === 'paid') {
            $this->refundOrFlag($order, $storeId, $paymentService);
        }

        // Mark related notifications as read
        Notification::where('user_id', $user->id)
            ->where('type', 'online_order')
            ->where('message', 'like', "%Order #{$order->id}%")
            ->update(['is_read' => true]);

        return response()->json([
            'message' => 'Order updated successfully',
            'order' => $order
        ]);
    }

    /**
     * Cancelling an order whose money was already taken leaves an
     * obligation behind. Refund via Paystack when there's a reference to
     * refund; otherwise (in_store/transfer, or Paystack itself rejecting the
     * refund) fall back to the log-and-notify flag rather than pretending
     * it's handled. See docs/superpowers/specs/2026-09-26-storefront-
     * paystack-subaccounts-design.md - a refund on an already-settled
     * subaccount transaction comes out of DumosRx's own Paystack balance,
     * accepted as a v1 cost rather than clawed back.
     */
    private function refundOrFlag(OnlineOrder $order, string $storeId, \App\Services\Payment\PaymentService $paymentService): void
    {
        if ($order->payment_method === 'paystack' && $order->paystack_reference) {
            $result = $paymentService->refundTransaction($order->paystack_reference, 'paystack');

            if ($result['success']) {
                $order->update(['payment_status' => 'refunded']);
                $this->notifyStore($order, $storeId, 'Refunded', "Online order #{$order->id} ({$order->total_amount}) was refunded to {$order->customer_name}.");
                return;
            }

            Log::warning('Paystack refund failed for cancelled online order', [
                'online_order_id' => $order->id,
                'paystack_reference' => $order->paystack_reference,
                'message' => $result['message'],
            ]);
        }

        $this->flagRefundRequired($order, $storeId);
    }

    private function notifyStore(OnlineOrder $order, string $storeId, string $title, string $message): void
    {
        $storeUserIds = User::where('store_id', $storeId)
            ->orWhereIn('id', Store::where('id', $storeId)->select('user_id'))
            ->pluck('id');

        Notification::bulkCreateFor($storeUserIds, [
            'title' => $title,
            'message' => $message,
            'type' => 'online_order',
        ]);
    }

    /**
     * Fallback when a real Paystack refund wasn't possible or was rejected:
     * makes the obligation loud instead of silent - a log line for
     * reconciliation and a notification every user of the store sees.
     */
    private function flagRefundRequired(OnlineOrder $order, string $storeId): void
    {
        Log::warning('Cancelled online order requires a refund', [
            'online_order_id' => $order->id,
            'store_id' => $storeId,
            'payment_method' => $order->payment_method,
            'paystack_reference' => $order->paystack_reference,
            'total_amount' => (string) $order->total_amount,
        ]);

        $this->notifyStore(
            $order,
            $storeId,
            'Refund required',
            "Cancelled online order #{$order->id} was already paid ({$order->total_amount}). Refund {$order->customer_name} manually.",
        );
    }
}
