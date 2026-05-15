<?php

namespace App\Providers;

use Illuminate\Support\ServiceProvider;

use Illuminate\Support\Facades\Gate;
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

        Gate::define('manage-staff', function (User $user) {
            return $user->role === 'super_admin' || $user->role === 'manager';
        });

        Gate::define('manage-platform', function (User $user) {
            return $user->role === 'super_admin';
        });
    }
}
