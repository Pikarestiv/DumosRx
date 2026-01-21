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
            'first_name' => 'required|string|max:255',
            'last_name' => 'required|string|max:255',
            'email' => 'nullable|email|max:255',
            'phone' => 'nullable|string|max:20',
            'address' => 'nullable|string|max:500',
            'date_of_birth' => 'nullable|date',
            'gender' => 'nullable|string|max:20',
            'allergies' => 'nullable|array',
            'medical_conditions' => 'nullable|string|max:1000',
        ]);

        $customer = Customer::create($validated);
        return response()->json($customer, 201);
    }
}
