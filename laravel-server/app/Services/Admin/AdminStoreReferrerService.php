<?php

namespace App\Services\Admin;

use App\Models\ActivityLog;
use App\Models\Store;
use App\Models\User;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class AdminStoreReferrerService
{
    public function updateReferrer(string $storeId, ?string $referrerId): ?array
    {
        return DB::transaction(function () use ($storeId, $referrerId) {
            $store = Store::withTrashed()->findOrFail($storeId);
            $owner = $store->user_id ? User::withTrashed()->findOrFail($store->user_id) : null;

            if (! $owner) {
                throw ValidationException::withMessages([
                    'referrer_id' => 'This store has no owner account to attribute a referral to.',
                ]);
            }

            if ($referrerId !== null && $referrerId === $owner->id) {
                throw ValidationException::withMessages([
                    'referrer_id' => 'A store owner cannot be their own referrer.',
                ]);
            }

            $newReferrer = $referrerId !== null ? User::find($referrerId) : null;

            if ($referrerId !== null && ! $newReferrer) {
                throw ValidationException::withMessages([
                    'referrer_id' => 'That referrer account does not exist.',
                ]);
            }

            $previousId = $owner->referred_by_id;

            if ($previousId === $referrerId) {
                return $this->referrerPayload($newReferrer);
            }

            $owner->referred_by_id = $referrerId;
            $owner->save();

            ActivityLog::create([
                'user_id' => Auth::id(),
                'action' => 'STORE_REFERRER_REASSIGNED',
                'description' => mb_substr(
                    "Reassigned referrer for {$store->name} ({$store->id}) from ".
                    ($previousId ?? 'none').' to '.($referrerId ?? 'none'),
                    0,
                    255,
                ),
                'properties' => [
                    'store_id' => $store->id,
                    'owner_id' => $owner->id,
                    'previous_referrer_id' => $previousId,
                    'new_referrer_id' => $referrerId,
                ],
            ]);

            return $this->referrerPayload($newReferrer);
        });
    }

    private function referrerPayload(?User $referrer): ?array
    {
        return $referrer ? [
            'id' => $referrer->id,
            'name' => trim("{$referrer->first_name} {$referrer->last_name}"),
        ] : null;
    }
}
