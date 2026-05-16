<?php

namespace App\Http\Controllers\Api\Web;

use App\Http\Controllers\Controller;
use App\Models\Store;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class StoreController extends Controller
{
    public function index(Request $request)
    {
        return $request->user()->stores;
    }

    public function store(Request $request)
    {
        $request->validate([
            'name' => 'required|string|max:255',
            'location' => 'nullable|string|max:255',
            'address' => 'nullable|string',
            'phone' => 'nullable|string',
        ]);

        $store = Store::create([
            'user_id' => $request->user()->id,
            'name' => $request->name,
            'location' => $request->location,
            'address' => $request->address,
            'phone' => $request->phone,
            'device_id' => 'WEB-' . strtoupper(Str::random(8)),
            'store_type' => 'pharmacy',
        ]);

        return response()->json([
            'message' => 'Store registered successfully',
            'store' => $store
        ], 201);
    }

    public function update(Request $request, $id)
    {
        $store = $request->user()->stores()->findOrFail($id);

        $request->validate([
            'name' => 'required|string|max:255',
            'location' => 'nullable|string|max:255',
            'address' => 'nullable|string',
            'phone' => 'nullable|string',
        ]);

        $store->update($request->only(['name', 'location', 'address', 'phone']));

        return response()->json([
            'message' => 'Store updated successfully',
            'store' => $store
        ]);
    }

    public function destroy(Request $request, $id)
    {
        $store = $request->user()->stores()->findOrFail($id);
        
        // Deactivate associated staff
        User::where('store_id', $store->id)->update(['is_active' => false]);
        
        $store->delete();

        return response()->json([
            'message' => 'Store removed successfully'
        ]);
    }
}
