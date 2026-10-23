<?php

namespace App\Support;

use App\Models\User;
use Carbon\CarbonInterface;
use Laravel\Sanctum\PersonalAccessToken;

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

    public static function hasLapsed(PersonalAccessToken $token): bool
    {
        $globalMinutes = config('sanctum.expiration');
        if ($globalMinutes && $token->created_at->lte(now()->subMinutes($globalMinutes))) {
            return true;
        }

        return $token->expires_at !== null && $token->expires_at->isPast();
    }
}
