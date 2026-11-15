<?php

namespace App\Services\Auth;

use App\Models\User;
use App\Support\TokenLifetime;
use Illuminate\Http\Request;
use Laravel\Sanctum\PersonalAccessToken;

class TillTokenRotator
{
    public const ROTATED_NAME = 'till-rotated';

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

        $current->forceFill([
            'name' => self::ROTATED_NAME,
            'expires_at' => now()->addMinutes((int) config('sanctum.till_rotation_grace_minutes')),
        ])->save();

        PersonalAccessToken::where('tokenable_type', $user::class)
            ->where('tokenable_id', $user->getKey())
            ->where('name', self::ROTATED_NAME)
            ->where('expires_at', '<', now())
            ->delete();

        return $issued->plainTextToken;
    }
}
