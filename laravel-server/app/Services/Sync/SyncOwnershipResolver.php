<?php

namespace App\Services\Sync;

use App\Models\Store;
use App\Models\User;
use Illuminate\Http\Request;

/** Design notes: docs/SYNC_SERVER_RATIONALE.md#syncownershipresolver */
class SyncOwnershipResolver
{
    public function resolvePushStoreId(Request $request, $currentUser): ?string
    {
        ['ownerId' => $ownerId, 'storeIds' => $ownedStoreIds] = $this->resolveOwnershipIdentity($currentUser);

        $requestedStoreId = $request->header('X-Store-Id') ?? $request->input('store_id');
        if ($requestedStoreId && Store::where('id', $requestedStoreId)->where('user_id', $ownerId)->exists()) {
            return $requestedStoreId;
        }

        if ($currentUser->store_id && in_array($currentUser->store_id, $ownedStoreIds, true)) {
            return $currentUser->store_id;
        }

        return $ownedStoreIds[0] ?? null;
    }

    public function resolveAllowedOwnershipScope($currentUser): array
    {
        ['ownerId' => $ownerId, 'storeIds' => $allowedStoreIds] = $this->resolveOwnershipIdentity($currentUser);
        $allowedUserIds = User::whereIn('store_id', $allowedStoreIds)->pluck('id')->push($ownerId)->toArray();

        return [$allowedStoreIds, $allowedUserIds, $ownerId];
    }

    public function storeBelongsToTenantOwner(?string $storeId, ?string $ownerId): bool
    {
        if (! $storeId || ! $ownerId) {
            return false;
        }

        return Store::where('user_id', $ownerId)->where('id', $storeId)->exists();
    }

    public function resolveOwnershipIdentity($currentUser): array
    {
        $ownedStoreIds = Store::where('user_id', $currentUser->id)->pluck('id')->toArray();
        if (! empty($ownedStoreIds)) {
            return ['ownerId' => $currentUser->id, 'storeIds' => $ownedStoreIds];
        }

        if ($currentUser->store_id) {
            return [
                'ownerId' => Store::where('id', $currentUser->store_id)->value('user_id'),
                'storeIds' => [$currentUser->store_id],
            ];
        }

        return ['ownerId' => $currentUser->id, 'storeIds' => []];
    }
}
