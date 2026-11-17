<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Laravel\Sanctum\TransientToken;
use Symfony\Component\HttpFoundation\Response;

class EnsureTokenCanAccessApi
{
    public function handle(Request $request, Closure $next): Response
    {
        $token = $request->user()?->currentAccessToken();

        if ($token) {
            $hasWildcard = $token instanceof TransientToken
                || (is_array($token->abilities) && $token->can('*'));

            if (! $hasWildcard) {
                return response()->json(['message' => 'Invalid token ability.'], 403);
            }
        }

        return $next($request);
    }
}
