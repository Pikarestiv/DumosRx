<?php

namespace App\Services;

use App\Http\Middleware\CheckAccountStatus;
use App\Http\Middleware\EnsureEmailIsVerified;
use App\Models\ActivityLog;
use App\Models\Store;
use App\Models\User;
use App\Support\TokenLifetime;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Facades\Cache;

class TillRelinkService
{
    public const TTL_SECONDS = 900;

    private const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

    private const LENGTH = 8;

    public function __construct(
        private CheckAccountStatus $accountStatus,
        private SubscriptionService $subscriptions,
    ) {
    }

    public function generate(User $owner, Store $store): array
    {
        $code = $this->randomCode();
        $expiresAt = now()->addSeconds(self::TTL_SECONDS);

        Cache::put($this->cacheKey($code), [
            'user_id' => $store->user_id,
            'store_id' => $store->id,
            'created_by' => $owner->id,
        ], $expiresAt);

        return ['code' => $code, 'expires_at' => $expiresAt->toIso8601String()];
    }

    /**
     * @return array|null the login() response body, or null for any code that is unknown, expired, used or for another store
     */
    public function consume(string $code, string $storeId, array $device): ?array
    {
        $entry = Cache::pull($this->cacheKey($this->normalize($code)));

        if (!is_array($entry) || !hash_equals((string) $entry['store_id'], $storeId)) {
            return null;
        }

        $owner = User::find($entry['user_id']);
        $store = Store::withTrashed()->find($entry['store_id']);

        if (!$owner || !$store || $store->user_id !== $owner->id) {
            return null;
        }

        $this->refuseBlockedAccounts($owner, $store);
        $this->subscriptions->enforceStaffLimits($owner);

        $tokenResult = $owner->createToken('Client App', ['*'], TokenLifetime::till());
        $tokenResult->accessToken->forceFill([
            'ip_address' => $device['ip'],
            'user_agent' => $device['user_agent'],
        ])->save();

        $this->audit($owner, $store, $entry['created_by'], $device);

        return [
            'message' => 'Login successful',
            'user' => $owner->append('effective_permissions'),
            'token' => $tokenResult->plainTextToken,
            'role' => $owner->role,
            'require_email_verification' => EnsureEmailIsVerified::isRequired(),
        ];
    }

    private function refuseBlockedAccounts(User $owner, Store $store): void
    {
        $refusal = $this->accountStatus->refusalFor($owner, $store) ?? EnsureEmailIsVerified::refusalFor($owner);

        if ($refusal) {
            throw new HttpResponseException($refusal);
        }
    }

    private function audit(User $owner, Store $store, ?string $createdBy, array $device): void
    {
        $label = $device['label'] ?: 'Unnamed device';

        ActivityLog::create([
            'user_id' => $owner->id,
            'store_id' => $store->id,
            'action' => 'TILL_RELINKED',
            'description' => "Till re-linked with an owner code on {$label}",
            'ip_address' => $device['ip'],
            'user_agent' => $device['user_agent'],
            'properties' => [
                'created_by' => $createdBy,
                'device_id' => $device['id'],
                'device_label' => $device['label'],
            ],
        ]);
    }

    private function randomCode(): string
    {
        $last = strlen(self::ALPHABET) - 1;

        return implode('', array_map(
            fn () => self::ALPHABET[random_int(0, $last)],
            range(1, self::LENGTH),
        ));
    }

    private function normalize(string $code): string
    {
        return strtoupper(trim($code));
    }

    private function cacheKey(string $code): string
    {
        return 'till_relink:' . hash('sha256', $code);
    }
}
