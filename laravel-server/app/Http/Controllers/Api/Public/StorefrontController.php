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
                'name' => $store->name,
                'location' => $store->location,
                'address' => $store->address,
                'phone' => $store->phone,
                'email' => $store->email,
            ],
            'products' => $products
        ]);
    }
}
