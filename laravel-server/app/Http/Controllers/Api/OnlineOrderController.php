<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\OnlineOrder;
use App\Models\Notification;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class OnlineOrderController extends Controller
{
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

    public function notifications(Request $request)
    {
        $user = Auth::user();
        $notifications = Notification::where('user_id', $user->id)
            ->orderBy('created_at', 'desc')
            ->limit(50)
            ->get();

        return response()->json([
            'notifications' => $notifications
        ]);
    }

    public function markNotificationRead(Request $request, $id)
    {
        $user = Auth::user();
        $notification = Notification::where('user_id', $user->id)->findOrFail($id);
        
        $notification->is_read = true;
        $notification->save();

        return response()->json([
            'message' => 'Notification marked as read'
        ]);
    }
}
