<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\OnlineOrder;
use App\Models\Notification;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use OpenApi\Attributes as OA;

class OnlineOrderController extends Controller
{
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
        $user = Auth::user();
        if (!$user->store_id) {
            return response()->json(['error' => 'No store associated'], 400);
        }

        $orders = OnlineOrder::with('items.product')
            ->where('store_id', $user->store_id)
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
        if (!$user->store_id) {
            return response()->json(['error' => 'No store associated'], 400);
        }

        $order = OnlineOrder::where('store_id', $user->store_id)->findOrFail($id);
        
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
