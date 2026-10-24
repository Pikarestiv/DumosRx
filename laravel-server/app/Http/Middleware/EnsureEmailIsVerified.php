<?php

namespace App\Http\Middleware;

use App\Models\SystemConfig;
use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureEmailIsVerified
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        $isGuardedRequest = ! $request->isMethod('get') || $request->is('api/sync*');

        if ($user && $isGuardedRequest && $refusal = self::refusalFor($user)) {
            return $refusal;
        }

        return $next($request);
    }

    public static function isRequired(): bool
    {
        $value = SystemConfig::getVal('require_email_verification', false);

        return $value === true || $value === 'true';
    }

    public static function refusalFor(User $user): ?Response
    {
        if (! self::isRequired() || $user->hasRole('super_admin') || ! is_null($user->email_verified_at)) {
            return null;
        }

        return response()->json([
            'message' => 'Email verification is required to perform this action.',
            'error' => 'email_not_verified',
        ], 403);
    }
}
