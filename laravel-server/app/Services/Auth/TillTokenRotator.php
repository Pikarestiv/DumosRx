<?php

namespace App\Services\Auth;

use App\Models\User;
use App\Support\TokenLifetime;
use Illuminate\Database\Eloquent\Builder;
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

        if ($this->isRotated($current)) {
            $this->successorsOf($current)->delete();
        }

        $issued = $user->createToken('web', ['*'], TokenLifetime::forUser($user));

        $issued->accessToken->forceFill([
            'device_id' => $current->device_id ?? $request->header('X-Device-Id'),
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ])->save();

        if (! $this->isRotated($current)) {
            $current->forceFill([
                'name' => self::ROTATED_NAME,
                'expires_at' => now()->addMinutes($this->graceMinutes()),
            ])->save();
        }

        PersonalAccessToken::where('tokenable_type', $user::class)
            ->where('tokenable_id', $user->getKey())
            ->where('name', self::ROTATED_NAME)
            ->where('expires_at', '<', now())
            ->delete();

        return $issued->plainTextToken;
    }

    public function endLineage(PersonalAccessToken $token): void
    {
        if ($this->isRotated($token)) {
            $this->successorsOf($token)->delete();
        }

        $this->deviceTokens($token)->where('name', self::ROTATED_NAME)->delete();
    }

    private function isRotated(PersonalAccessToken $token): bool
    {
        return $token->name === self::ROTATED_NAME;
    }

    private function graceMinutes(): int
    {
        return (int) config('sanctum.till_rotation_grace_minutes');
    }

    /**
     * Live tokens this device was handed after the given rotated token was retired.
     *
     * @return Builder<PersonalAccessToken>
     */
    private function successorsOf(PersonalAccessToken $rotated): Builder
    {
        $retiredAt = $rotated->expires_at?->copy()->subMinutes($this->graceMinutes()) ?? $rotated->updated_at;

        return $this->deviceTokens($rotated)
            ->where('name', '!=', self::ROTATED_NAME)
            ->where('id', '!=', $rotated->id)
            ->where('created_at', '>=', $retiredAt->copy()->subSeconds(2));
    }

    /**
     * @return Builder<PersonalAccessToken>
     */
    private function deviceTokens(PersonalAccessToken $token): Builder
    {
        return PersonalAccessToken::query()
            ->where('tokenable_type', $token->tokenable_type)
            ->where('tokenable_id', $token->tokenable_id)
            ->when(
                $token->device_id,
                fn (Builder $query, string $deviceId) => $query->where('device_id', $deviceId),
                fn (Builder $query) => $query->whereNull('device_id')->where('user_agent', $token->user_agent),
            );
    }
}
