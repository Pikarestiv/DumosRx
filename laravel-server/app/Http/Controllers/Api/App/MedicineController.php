<?php

namespace App\Http\Controllers\Api\App;

use App\Http\Controllers\Controller;
use App\Models\Medicine;
use Illuminate\Http\Request;

class MedicineController extends Controller
{
    public function index(Request $request)
    {
        $limit = $request->get('limit', 50);
        $medicines = Medicine::with('category', 'supplier')
            ->where('is_active', true)
            ->latest()
            ->paginate($limit);

        return response()->json($medicines);
    }

    public function search(Request $request)
    {
        $query = $request->get('q');
        $limit = $request->get('limit', 50);

        $medicines = Medicine::with('category', 'supplier')
            ->where('is_active', true)
            ->where(function ($q) use ($query) {
                $q->where('name', 'like', "%{$query}%")
                  ->orWhere('brand_name', 'like', "%{$query}%")
                  ->orWhere('generic_name', 'like', "%{$query}%")
                  ->orWhere('barcode', 'like', "%{$query}%");
            })
            ->paginate($limit);

        return response()->json($medicines);
    }

    public function show($id)
    {
        $medicine = Medicine::with('category', 'supplier', 'inventory')->findOrFail($id);
        return response()->json($medicine);
    }

    public function store(Request $request)
    {
        $request->validate([
            'name' => 'required|string|max:255',
            'selling_price' => 'required|numeric',
        ]);

        $medicine = Medicine::create($request->all());

        return response()->json($medicine, 201);
    }
}
