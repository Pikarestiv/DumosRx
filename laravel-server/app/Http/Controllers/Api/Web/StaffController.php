<?php

namespace App\Http\Controllers\Api\Web;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class StaffController extends Controller
{
    public function index(Request $request)
    {
        $query = User::where('role', '!=', 'super_admin');
        
        if ($request->has('store_id') && $request->store_id !== 'all') {
            $query->where('store_id', $request->store_id);
        }
        
        return $query->get();
    }

    public function store(Request $request)
    {
        $request->validate([
            'first_name' => 'required|string',
            'last_name' => 'required|string',
            'email' => 'required|email|unique:users',
            'username' => 'nullable|string|unique:users',
            'role' => 'required|string|in:admin,pharmacist,cashier',
            'password' => 'required|min:8',
            'pin' => 'nullable|string|size:4',
            'store_id' => 'required|exists:stores,id',
        ]);

        $user = User::create([
            'store_id' => $request->store_id,
            'first_name' => $request->first_name,
            'last_name' => $request->last_name,
            'email' => $request->email,
            'username' => $request->username ?: explode('@', $request->email)[0],
            'role' => $request->role,
            'password' => Hash::make($request->password),
            'pin' => $request->pin ?: '1234',
            'is_active' => true,
        ]);

        return response()->json($user, 201);
    }

    public function update(Request $request, User $user)
    {
        $request->validate([
            'first_name' => 'string',
            'last_name' => 'string',
            'email' => 'email|unique:users,email,' . $user->id,
            'username' => 'string|unique:users,username,' . $user->id,
            'role' => 'string|in:admin,pharmacist,cashier',
            'pin' => 'string|size:4',
            'store_id' => 'exists:stores,id',
        ]);

        $data = $request->only(['first_name', 'last_name', 'email', 'username', 'role', 'pin', 'store_id', 'is_active']);
        
        if ($request->has('password')) {
            $data['password'] = Hash::make($request->password);
        }

        $user->update($data);

        return response()->json($user);
    }

    public function destroy(User $user)
    {
        $user->update(['is_active' => false]);
        return response()->json(['message' => 'Staff deactivated']);
    }
}
