<?php

namespace App\Http\Controllers\Api\Web;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;

class StaffController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->user();
        
        if ($user->role === 'super_admin') {
            $query = User::where('role', '!=', 'super_admin');
            
            if ($request->has('store_id') && $request->store_id !== 'all') {
                $query->where('store_id', $request->store_id);
            }
        } else {
            $subscriptionService = app(\App\Services\SubscriptionService::class);
            $owner = $subscriptionService->getSubscriptionOwner($user);
            
            $storeIds = \App\Models\Store::where('user_id', $owner->id)->pluck('id')->toArray();
            
            $query = User::where(function($q) use ($storeIds, $owner) {
                $q->whereIn('store_id', $storeIds)
                  ->orWhere('id', $owner->id);
            });
            
            if ($request->has('store_id') && $request->store_id !== 'all') {
                if (in_array($request->store_id, $storeIds)) {
                    $query->where('store_id', $request->store_id);
                } else {
                    $query->whereNull('id');
                }
            }
        }
        
        return $query->get();
    }

    public function store(Request $request)
    {
        if (!app(\App\Services\SubscriptionService::class)->checkLimit($request->user(), 'staff')) {
            return response()->json([
                'message' => 'Staff limit reached for your current plan. Please upgrade your plan to add more staff.'
            ], 422);
        }

        $request->validate([
            'first_name' => 'required|string',
            'last_name' => 'required|string',
            'email' => 'nullable|email|unique:users',
            'username' => ['required', 'string', Rule::unique('users', 'username')->where('store_id', $request->store_id)],
            'role' => 'required|string|in:admin,manager,specialist,sales_staff,auditor',
            'password' => 'nullable|min:8',
            'pin' => 'nullable|string|size:4',
            'store_id' => 'required|exists:stores,id',
        ]);

        $email = $request->email;
        if (empty($email)) {
            $email = $request->username . '@local.dumosrx.com';
        }

        $roleObj = \App\Models\Role::where('slug', $request->role)->first();

        $pin = $request->pin ?: '1234';
        $password = $request->password ? Hash::make($request->password) : Hash::make($pin);

        $user = User::create([
            'store_id' => $request->store_id,
            'first_name' => $request->first_name,
            'last_name' => $request->last_name,
            'email' => $email,
            'username' => $request->username,
            'role' => $request->role,
            'role_id' => $roleObj ? $roleObj->id : null,
            'password' => $password,
            'pin' => $pin,
            'is_active' => true,
        ]);

        return response()->json($user, 201);
    }

    public function update(Request $request, User $staff)
    {
        $request->validate([
            'first_name' => 'string',
            'last_name' => 'string',
            'email' => ['nullable', 'email', Rule::unique('users', 'email')->ignore($staff->id)],
            'username' => [
                'string',
                Rule::unique('users', 'username')
                    ->where('store_id', $request->store_id ?? $staff->store_id)
                    ->ignore($staff->id),
            ],
            'role' => 'string|in:admin,manager,specialist,sales_staff,auditor',
            'pin' => 'string|size:4',
            'store_id' => 'exists:stores,id',
        ]);

        $data = $request->only(['first_name', 'last_name', 'email', 'username', 'role', 'pin', 'store_id', 'is_active']);
        
        if (isset($data['is_active']) && $data['is_active'] == true && !$staff->is_active) {
            if (!app(\App\Services\SubscriptionService::class)->checkLimit($request->user(), 'staff')) {
                return response()->json([
                    'message' => 'Staff limit reached for your current plan. Please upgrade your plan to reactivate staff.'
                ], 422);
            }
        }
        if ($request->has('password') && !empty($request->password)) {
            $data['password'] = Hash::make($request->password);
        }

        if ($request->has('role')) {
            $roleObj = \App\Models\Role::where('slug', $request->role)->first();
            $data['role_id'] = $roleObj ? $roleObj->id : null;
        }

        if ($request->has('email') && empty($request->email)) {
            $username = $request->username ?? $staff->username;
            $data['email'] = $username . '@local.dumosrx.com';
        }

        $staff->update($data);

        return response()->json($staff);
    }

    public function destroy(User $staff)
    {
        $staff->update(['is_active' => false]);
        return response()->json(['message' => 'Staff deactivated']);
    }
}
