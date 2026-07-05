<?php

namespace App\Http\Controllers\Api\Public;

use App\Http\Controllers\Controller;
use App\Models\Store;
use App\Models\Product;
use Illuminate\Http\Request;

class StorefrontController extends Controller
{
    public function show($store_slug)
    {
        $store = Store::where('store_slug', $store_slug)->firstOrFail();

        // Check if store is suspended
        if ($store->status === 'suspended') {
            return response()->json(['error' => 'Store unavailable'], 403);
        }

        // We fetch products that are active and marked to show online
        $products = Product::with('category')
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
            ],
            'products' => $products
        ]);
    }

    public function checkout(Request $request, $store_slug)
    {
        $store = Store::where('store_slug', $store_slug)->firstOrFail();

        if ($store->status === 'suspended') {
            return response()->json(['error' => 'Store unavailable'], 403);
        }

        $validated = $request->validate([
            'customer_name' => 'required|string|max:255',
            'customer_phone' => 'required|string|max:20',
            'customer_address' => 'nullable|string|max:1000',
            'payment_method' => 'required|in:paystack,transfer,in_store',
            'paystack_reference' => 'nullable|string',
            'items' => 'required|array|min:1',
            'items.*.product_id' => 'required|uuid|exists:products,id',
            'items.*.quantity' => 'required|integer|min:1',
        ]);

        $totalAmount = 0;
        $orderItems = [];

        foreach ($validated['items'] as $item) {
            $product = Product::findOrFail($item['product_id']);
            $subtotal = $product->selling_price * $item['quantity'];
            $totalAmount += $subtotal;

            $orderItems[] = [
                'product_id' => $product->id,
                'quantity' => $item['quantity'],
                'unit_price' => $product->selling_price,
                'subtotal' => $subtotal,
            ];
        }

        $order = \App\Models\OnlineOrder::create([
            'store_id' => $store->id,
            'customer_name' => $validated['customer_name'],
            'customer_phone' => $validated['customer_phone'],
            'customer_address' => $validated['customer_address'],
            'total_amount' => $totalAmount,
            'payment_method' => $validated['payment_method'],
            'payment_status' => $validated['payment_method'] === 'paystack' && $validated['paystack_reference'] ? 'paid' : 'pending',
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
