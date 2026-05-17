<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class CheckPermission
{
    /**
     * Handle an incoming request.
     *
     * @param  \Closure(\Illuminate\Http\Request): (\Symfony\Component\HttpFoundation\Response)  $next
     */
    public function handle(Request $request, Closure $next, string $permission): Response
    {
        $user = auth()->user();

        // Allow super admin to bypass permission checks
        if ($user && $user->hasRole('super_admin')) {
            return $next($request);
        }

        if (!$user || !$user->hasPermission($permission)) {
            return response()->json(['message' => 'Forbidden. You do not have the required permission: ' . $permission], 403);
        }

        return $next($request);
    }
}
