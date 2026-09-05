<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Sentry\Laravel\Integration;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        $middleware->append(\App\Http\Middleware\SecurityHeaders::class);
        $middleware->encryptCookies(except: [
            'drx_admin_session',
        ]);
        $middleware->alias([
            'subscription' => \App\Http\Middleware\CheckSubscription::class,
            'permission' => \App\Http\Middleware\CheckPermission::class,
            'account_status' => \App\Http\Middleware\CheckAccountStatus::class,
            'restrict_api_docs' => \App\Http\Middleware\RestrictApiDocs::class,
        ]);
        // This app has no "login" route at all (it's API-only; every client
        // is the Next.js app, the desktop app, or a superadmin panel talking
        // JSON). Without this, an unauthenticated request that doesn't
        // happen to send an `Accept: application/json` header (curl by
        // default, some non-browser HTTP clients) fails Laravel's
        // wantsJson() check, and the default Authenticate middleware tries
        // to redirect to a named "login" route that doesn't exist — a 500
        // RouteNotFoundException instead of a clean 401. Returning null
        // unconditionally skips the redirect attempt entirely, so every
        // unauthenticated request gets the normal JSON 401 regardless of
        // what Accept header it sent.
        $middleware->redirectGuestsTo(fn () => null);
    })
    ->withExceptions(function (Exceptions $exceptions) {
        // This app is API-only — there is no "login" route to redirect a
        // guest to. The redirectGuestsTo(null) override above stops the
        // Authenticate middleware itself from crashing, but Laravel's
        // default exception Handler::unauthenticated() has its own
        // *separate* `?? route('login')` fallback that still fires when a
        // request doesn't send an `Accept: application/json` header (curl's
        // default `Accept: */*`, some non-browser HTTP clients) — Handler's
        // shouldReturnJson() falls back to $request->expectsJson(), which is
        // false in that case, and route('login') throws the same
        // RouteNotFoundException all over again. Forcing every response
        // through the JSON branch closes that off for good.
        $exceptions->shouldRenderJsonWhen(fn () => true);
        Integration::handles($exceptions);
    })->create();
