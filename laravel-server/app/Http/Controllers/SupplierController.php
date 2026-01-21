<?php

namespace App\Http\Controllers;

use App\Models\Supplier;
use Illuminate\Http\Request;

class SupplierController extends Controller
{
    public function index(Request $request)
    {
        $limit = $request->get('limit', 50);
        $suppliers = Supplier::latest()->paginate($limit);
        return response()->json($suppliers);
    }

    public function show($id)
    {
        $supplier = Supplier::with('medicines')->findOrFail($id);
        return response()->json($supplier);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'nullable|email',
            'phone' => 'nullable|string',
            'address' => 'nullable|string',
        ]);

        $supplier = Supplier::create($request->all());
        return response()->json($supplier, 201);
    }
}
