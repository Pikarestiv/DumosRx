<?php

namespace App\Support;

use Laravel\Sanctum\PersonalAccessToken;

class FullAccessToken
{
    public static function find(string $plainTextToken): ?PersonalAccessToken
    {
        $token = PersonalAccessToken::findToken($plainTextToken);

        if (!$token || !is_array($token->abilities) || !$token->can('*') || TokenLifetime::hasLapsed($token)) {
            return null;
        }

        return $token;
    }
}
