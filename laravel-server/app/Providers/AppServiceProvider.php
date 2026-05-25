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
