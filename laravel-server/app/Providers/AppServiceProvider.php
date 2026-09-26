<?php

namespace App\Providers;

use Illuminate\Support\ServiceProvider;

use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use App\Models\User;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        \Illuminate\Support\Facades\Schema::defaultStringLength(191);

        RateLimiter::for('auth', function (Request $request) {
            return Limit::perMinute(5)->by($request->ip());
        });

        // Session-refresh isn't a login attempt - it's a background check
        // the admin login page and layout fire on every mount to see if a
        // refresh cookie already has a valid session (see initSession() in
        // use-admin-auth-store.ts). Sharing the 5/min `auth` bucket with
        // actual login attempts meant just reloading /admin/login a couple
        // of times (or sitting behind a shared/carrier-NAT IP) could burn
        // the whole budget before the user typed a password, surfacing a
        // false "Too Many Attempts" on the very first real attempt. Same
        // class of bug as the `handoff` limiter below.
        RateLimiter::for('session-refresh', function (Request $request) {
            return Limit::perMinute(20)->by($request->ip());
        });

        // Cross-origin auth handoff needs far more headroom than login does:
        // a single impersonation round trip from one admin IP is already 6
        // handoff calls (2 mints out, 1 consume on arrival, 1 consume + 1 mint
        // to end the session, 1 consume on return). Sharing the 5/min `auth`
        // limiter would 429 the final call, the one that restores the admin's
        // own session, after the return code has already been burned.
        RateLimiter::for('handoff', function (Request $request) {
            return Limit::perMinute(30)->by($request->ip());
        });

        // Public storefront "start an online payment" step. Every call makes
        // an outbound transaction/initialize request to Paystack, so it needs
        // a ceiling even though it's unauthenticated - but a generous one: a
        // shopper legitimately retries (wrong card, abandoned tab, a reprice
        // in between), and several shoppers can share one NATed IP.
        RateLimiter::for('storefront-checkout', function (Request $request) {
            return Limit::perMinute(15)->by($request->ip());
        });

        // Order placement. Tighter than the initialize step above: an
        // `in_store` order needs only a name, a phone string and a product id
        // to create an online_orders row plus a notification per store user,
        // and Laravel 11 no longer applies any default `throttle:api` floor.
        // Still above what a real shopper does (one order, maybe a retry after
        // a reprice), so a NATed household ordering separately stays fine.
        RateLimiter::for('storefront-order', function (Request $request) {
            return Limit::perMinute(5)->by($request->ip());
        });

        // The public reads. Deliberately generous, because the static-export
        // build pulls the slug list plus every storefront from one runner IP
        // in a single pass — see laravel-server/AGENTS.md for the headroom
        // this leaves and when it needs raising.
        RateLimiter::for('storefront-read', function (Request $request) {
            return Limit::perMinute(120)->by($request->ip());
        });

        Gate::define('manage-staff', function (User $user) {
            $role = $user->getAttribute('role');
            return \in_array($role, ['super_admin', 'manager', 'admin'], true);
        });

        Gate::define('manage-platform', function (User $user) {
            return $user->getAttribute('role') === 'super_admin';
        });

        // Override config('plans') with live dynamic DB config if available
        try {
            $liveConfig = \Illuminate\Support\Facades\Cache::remember('system_config_subscription_plans', 86400, function () {
                return \App\Models\SystemConfig::getVal('subscription_plans');
            });
            if ($liveConfig) {
                config(['plans' => $liveConfig]);
            }
        } catch (\Exception $e) {
            // Silently fallback to config/plans.php if database is unavailable or migrating
        }
    }
}
