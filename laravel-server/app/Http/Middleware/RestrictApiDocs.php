<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Gates the generated Swagger/OpenAPI docs (UI + raw JSON) behind a simple
 * shared HTTP Basic Auth credential. This is internal documentation only:
 * it describes implementation details and, in places, known vulnerabilities
 * in unfixed routes, so it must not be reachable by regular customer
 * accounts or the public, independent of the main app's user auth.
 */
class RestrictApiDocs
{
    public function handle(Request $request, Closure $next): Response
    {
        $username = config('l5-swagger.docs_auth.username');
        $password = config('l5-swagger.docs_auth.password');

        if (!$username || !$password) {
            abort(404);
        }

        if ($request->getUser() !== $username || $request->getPassword() !== $password) {
            return response('Unauthorized', 401, ['WWW-Authenticate' => 'Basic realm="DumosRx API Docs"']);
        }

        return $next($request);
    }
}
