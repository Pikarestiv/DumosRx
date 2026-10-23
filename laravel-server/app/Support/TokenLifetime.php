<?php

namespace App\Support;

use App\Models\User;
use Carbon\CarbonInterface;

class TokenLifetime
{
    public static function admin(): CarbonInterface
    {
        return now()->addDays((int) config('sanctum.admin_token_lifetime_days'));
    }

    public static function till(): CarbonInterface
    {
        return now()->addDays((int) config('sanctum.till_token_lifetime_days'));
    }

    public static function forUser(User $user): CarbonInterface
    {
        return $user->hasRole('super_admin') ? self::admin() : self::till();
    }

    public static function forLogin(User $user, string $deviceName): CarbonInterface
    {
        return $deviceName === 'web' ? self::admin() : self::forUser($user);
    }
}
