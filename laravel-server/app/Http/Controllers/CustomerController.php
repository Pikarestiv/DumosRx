<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use Illuminate\Http\Request;

class CustomerController extends Controller
{
    public function index(Request $request)
    {
        $limit = $request->get('limit', 50);
        $customers = Customer::latest()->paginate($limit);
        return response()->json($customers);
    }

    public function show($id)
    {
        $customer = Customer::with('sales')->findOrFail($id);
        return response()->json($customer);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'nullable|email',
            'phone' => 'nullable|string',
            'address' => 'nullable|string',
        ]);

        $customer = Customer::create($request->all());
        return response()->json($customer, 201);
    }
}
