<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Coupon;
use Illuminate\Http\Request;

class CouponController extends Controller
{
    /**
     * Display a listing of coupons.
     */
    public function index()
    {
        $coupons = Coupon::with('assignedUser')->withCount('usages')->orderBy('created_at', 'desc')->get();
        return response()->json($coupons);
    }

    /**
     * Store a newly created coupon in storage.
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'code' => 'required|string|unique:coupons,code',
            'type' => 'required|in:discount_percent,discount_amount,trial_extension',
            'value' => 'required|integer|min:0',
            'max_uses' => 'nullable|integer|min:1',
            'max_uses_per_user' => 'nullable|integer|min:1',
            'assigned_to_user_id' => 'nullable|uuid|exists:users,id',
            'target_plan' => 'nullable|string',
            'target_interval' => 'nullable|in:monthly,yearly',
            'expires_at' => 'nullable|date|after:now',
        ]);

        $validated['created_by'] = $request->user()->id;
        if (!isset($validated['max_uses_per_user'])) {
            $validated['max_uses_per_user'] = 1;
        }

        $coupon = Coupon::create($validated);

        return response()->json($coupon, 201);
    }

    /**
     * Update the specified coupon in storage.
     */
    public function update(Request $request, Coupon $coupon)
    {
        $validated = $request->validate([
            'code' => 'required|string|unique:coupons,code,' . $coupon->id,
            'type' => 'required|in:discount_percent,discount_amount,trial_extension',
            'value' => 'required|integer|min:0',
            'max_uses' => 'nullable|integer|min:1',
            'max_uses_per_user' => 'nullable|integer|min:1',
            'assigned_to_user_id' => 'nullable|uuid|exists:users,id',
            'target_plan' => 'nullable|string',
            'target_interval' => 'nullable|in:monthly,yearly',
            'expires_at' => 'nullable|date',
        ]);

        if (!isset($validated['max_uses_per_user'])) {
            $validated['max_uses_per_user'] = 1;
        }

        $coupon->update($validated);

        return response()->json($coupon);
    }

    /**
     * Toggle the active status of a coupon.
     */
    public function toggleActive(Coupon $coupon)
    {
        $coupon->update(['is_active' => !$coupon->is_active]);
        return response()->json($coupon);
    }

    /**
     * Display the usages for a specific coupon.
     */
    public function usages(Coupon $coupon)
    {
        $usages = $coupon->usages()->with('user')->orderBy('used_at', 'desc')->get();
        return response()->json($usages);
    }

    /**
     * Remove the specified coupon from storage.
     */
    public function destroy(Coupon $coupon)
    {
        $coupon->delete();
        return response()->json(['message' => 'Coupon deleted']);
    }
}
