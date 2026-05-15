<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class AuthenticateFromCookie
{
    public function handle(Request $request, Closure $next): Response
    {
        if (!$request->bearerToken() && $request->hasCookie('drx_admin_session')) {
            $token = $request->cookie('drx_admin_session');
            $request->headers->set('Authorization', 'Bearer ' . $token);
        }

        return $next($request);
    }
}
