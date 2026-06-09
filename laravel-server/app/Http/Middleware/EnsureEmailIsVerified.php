<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;
use App\Models\SystemConfig;

class EnsureEmailIsVerified
{
    public function handle(Request $request, Closure $next): Response
    {
        $requireVerification = SystemConfig::getVal('require_email_verification', false) === true || SystemConfig::getVal('require_email_verification', false) === 'true';

        if ($requireVerification) {
            $user = $request->user();
            if ($user && is_null($user->email_verified_at)) {
                // If it's a GET request, we might allow it (soft block on web dashboard)
                // But we definitely block POST/PUT/DELETE
                // OR we can block specific syncing routes.
                
                // For a soft block, we block all writes and the /sync endpoint.
                if (!$request->isMethod('get') || $request->is('api/sync*')) {
                    return response()->json([
                        'message' => 'Email verification is required to perform this action.',
                        'error' => 'email_not_verified'
                    ], 403);
                }
            }
        }

        return $next($request);
    }
}
