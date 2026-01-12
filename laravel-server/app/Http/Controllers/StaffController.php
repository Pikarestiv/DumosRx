<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class StaffController extends Controller
{
    public function index()
    {
        // Only return staff, not super admins maybe?
        return User::where('role', '!=', 'super_admin')->get();
    }

    public function store(Request $request)
    {
        $request->validate([
            'first_name' => 'required|string',
            'last_name' => 'required|string',
            'email' => 'required|email|unique:users',
            'role' => 'required|string',
            'password' => 'required|min:8',
        ]);

        $user = User::create([
            'first_name' => $request->first_name,
            'last_name' => $request->last_name,
            'email' => $request->email,
            'role' => $request->role,
            'password' => Hash::make($request->password),
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
            'role' => 'string',
        ]);

        $user->update($request->all());

        return response()->json($user);
    }

    public function destroy(User $user)
    {
        // Soft delete or deactivate? Schema has is_active but no deleted_at
        $user->update(['is_active' => false]);
        return response()->json(['message' => 'Staff deactivated']);
    }
}
