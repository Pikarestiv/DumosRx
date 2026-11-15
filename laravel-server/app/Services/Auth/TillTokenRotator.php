<?php

namespace App\Services\Auth;

use App\Models\User;
use App\Support\TokenLifetime;
use Illuminate\Http\Request;
use Laravel\Sanctum\PersonalAccessToken;

class TillTokenRotator
{
    public const ROTATED_NAME = 'till-rotated';

    public function forgetPredecessors(PersonalAccessToken $token): void
    {
        PersonalAccessToken::where('tokenable_type', $token->tokenable_type)
            ->where('tokenable_id', $token->tokenable_id)
            ->where('name', self::ROTATED_NAME)
            ->where('device_id', $token->device_id)
            ->delete();
    }

    public function rotate(User $user, mixed $current, Request $request): string
    {
        if (! $current instanceof PersonalAccessToken) {
            return $user->createToken('web', ['*'], TokenLifetime::forUser($user))->plainTextToken;
        }

        $issued = $user->createToken('web', ['*'], TokenLifetime::forUser($user));

        $issued->accessToken->forceFill([
            'device_id' => $current->device_id ?? $request->header('X-Device-Id'),
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ])->save();

        if ($current->name !== self::ROTATED_NAME) {
            $current->forceFill([
                'name' => self::ROTATED_NAME,
                'expires_at' => now()->addMinutes((int) config('sanctum.till_rotation_grace_minutes')),
            ])->save();
        }

        PersonalAccessToken::where('tokenable_type', $user::class)
            ->where('tokenable_id', $user->getKey())
            ->where('name', self::ROTATED_NAME)
            ->where('expires_at', '<', now())
            ->delete();

        return $issued->plainTextToken;
    }
}
