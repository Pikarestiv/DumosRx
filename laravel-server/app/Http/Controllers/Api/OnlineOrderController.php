<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Concerns\ScopesToTenant;
use App\Http\Controllers\Controller;
use App\Models\OnlineOrder;
use App\Models\Notification;
use App\Models\Store;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use OpenApi\Attributes as OA;

class OnlineOrderController extends Controller
{
    use ScopesToTenant;

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
        responses: [
            new OA\Response(response: 200, description: 'Orders, with items/product eager-loaded', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'orders', type: 'array', items: new OA\Items(type: 'object')),
            ])),
            new OA\Response(response: 400, description: 'Caller has no associated store'),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
        ],
    )]
    public function index(Request $request)
    {
        $storeId = $this->resolveOrderStoreId($request);
        if (!$storeId) {
            return response()->json(['error' => 'No store associated'], 400);
        }

        $orders = OnlineOrder::with('items.product')
            ->where('store_id', $storeId)
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json([
            'orders' => $orders
        ]);
    }

    #[OA\Post(
        path: '/app/online-orders/{id}/fulfill',
        summary: 'Mark a storefront order fulfilled or cancelled',
        description: 'Setting `fulfilled` also marks `payment_status` as `paid`. Clears any matching unread "online_order" notification for the caller.',
        tags: ['Online Orders'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'string'))],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(
            required: ['status'],
            properties: [new OA\Property(property: 'status', type: 'string', enum: ['fulfilled', 'cancelled'])],
        )),
        responses: [
            new OA\Response(response: 200, description: 'Updated', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'message', type: 'string'),
                new OA\Property(property: 'order', type: 'object'),
            ])),
            new OA\Response(response: 400, description: 'Caller has no associated store'),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
            new OA\Response(response: 404, ref: '#/components/responses/NotFound'),
            new OA\Response(response: 422, ref: '#/components/responses/ValidationError'),
        ],
    )]
    public function markFulfilled(Request $request, $id)
    {
        $user = Auth::user();
        $storeId = $this->resolveOrderStoreId($request);
        if (!$storeId) {
            return response()->json(['error' => 'No store associated'], 400);
        }

        $order = OnlineOrder::where('store_id', $storeId)->findOrFail($id);
        
        $validated = $request->validate([
            'status' => 'required|in:fulfilled,cancelled',
        ]);

        $order->order_status = $validated['status'];
        if ($validated['status'] === 'fulfilled') {
            $order->payment_status = 'paid';
        }
        $order->save();

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

}
