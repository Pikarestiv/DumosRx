<?php

namespace App\Support;

use Laravel\Sanctum\PersonalAccessToken;

class FullAccessToken
{
    public static function find(string $plainTextToken): ?PersonalAccessToken
    {
        $token = PersonalAccessToken::findToken($plainTextToken);

        if (!$token || !$token->can('*') || self::hasExpired($token)) {
            return null;
        }

        return $token;
    }

    private static function hasExpired(PersonalAccessToken $token): bool
    {
        return $token->expires_at !== null && $token->expires_at->isPast();
    }
}
