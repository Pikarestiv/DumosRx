<?php

namespace App\Http\Controllers\Api\App;

use App\Http\Controllers\Controller;
use App\Models\Product;
use Illuminate\Http\Request;

class ProductController extends Controller
{
    public function index(Request $request)
    {
        $limit = $request->get('limit', 50);
        $products = Product::with('category', 'supplier')
            ->where('is_active', true)
            ->latest()
            ->paginate($limit);

        return response()->json($products);
    }

    public function search(Request $request)
    {
        $query = $request->get('q');
        $limit = $request->get('limit', 50);

        $products = Product::with('category', 'supplier')
            ->where('is_active', true)
            ->where(function ($q) use ($query) {
                $q->where('name', 'like', "%{$query}%")
                  ->orWhere('brand_name', 'like', "%{$query}%")
                  ->orWhere('generic_name', 'like', "%{$query}%")
                  ->orWhere('barcode', 'like', "%{$query}%");
            })
            ->paginate($limit);

        return response()->json($products);
    }

    public function show($id)
    {
        $medicine = Product::with('category', 'supplier', 'stock_batches')->findOrFail($id);
        return response()->json($medicine);
    }

    public function store(Request $request)
    {
        $request->validate([
            'name' => 'required|string|max:255',
            'selling_price' => 'required|numeric',
        ]);

        $medicine = Product::create($request->all());

        return response()->json($medicine, 201);
    }
}
