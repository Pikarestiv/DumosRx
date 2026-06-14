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
            'store_type' => 'nullable|string|in:pharmacy,supermarket,grocery,general,retail',
        ]);

        $user = $request->user();

        $store = Store::create([
            'user_id' => $user->id,
            'name' => $request->name,
            'location' => $request->location,
            'address' => $request->address,
            'phone' => $request->phone,
            'device_id' => 'WEB-' . strtoupper(Str::random(8)),
            'store_type' => $request->store_type ?? 'pharmacy',
        ]);

        // Auto-create a trial subscription if the user doesn't have one
        if (!$user->subscriptions()->exists()) {
            app(\App\Services\SubscriptionService::class)->createTrial($user);
        }

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
            'store_type' => 'nullable|string|in:pharmacy,supermarket,grocery,general,retail',
        ]);

        $store->update($request->only(['name', 'location', 'address', 'phone', 'store_type']));

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
