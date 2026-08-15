<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;
use App\Models\Store;

class CheckAccountStatus
{
    /**
     * Handle an incoming request.
     *
     * @param  \Closure(\Illuminate\Http\Request): (\Symfony\Component\HttpFoundation\Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (!$user) {
            return $next($request);
        }

        // Super Admin bypasses status checks
        if ($user->hasRole('super_admin')) {
            return $next($request);
        }

        // 1. Check if user is deactivated
        if (!$user->is_active) {
            return response()->json([
                'success' => false,
                'message' => 'ACCOUNT_SUSPENDED',
                'reason' => 'Your user account has been deactivated/suspended. Please contact administrative support.'
            ], 403);
        }

        // 2. Check if store is suspended
        $store = null;
        if ($user->store_id) {
            $store = Store::find($user->store_id);
        } else {
            $store = Store::where('user_id', $user->id)->first();
        }

        if ($store && $store->status === 'Suspended') {
            return response()->json([
                'success' => false,
                'message' => 'ACCOUNT_SUSPENDED',
                'reason' => $store->suspension_reason ?: 'Your business account has been suspended for violating our terms of usage. Please contact administrative support.'
            ], 403);
        }

        return $next($request);
    }
}
