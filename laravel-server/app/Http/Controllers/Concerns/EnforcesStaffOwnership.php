<?php

namespace App\Http\Controllers\Concerns;

use App\Models\Role;
use App\Models\Store;

/**
 * Shared guards for any endpoint that creates or mutates a staff/user
 * record on behalf of a non-super_admin caller. Extracted because
 * StaffController::store() had these checks and update() didn't — a
 * caller could create a staff row in another tenant's store (blocked)
 * but reassign an *existing* row into one via update() (not blocked)
 * until this was fixed. Keep any new staff-mutating endpoint using both
 * of these rather than re-deriving the checks locally.
 */
trait EnforcesStaffOwnership
{
    /**
     * True if $storeId belongs to a store owned by $currentUser (or
     * $currentUser is super_admin, who may target any store). $storeId
     * being merely `exists:stores,id` in validation only proves the store
     * exists SOMEWHERE on the platform — this proves it's actually the
     * caller's own.
     *
     * $currentStoreId — the target row's OWN store_id before this write —
     * is required to safely handle a `null` $storeId. A store owner's own
     * row legitimately has `store_id = null` (they aren't tied to one
     * store the way staff are), and update()'s validation allows
     * resubmitting that row unchanged, so `null` can't simply be rejected
     * outright. But nulling out an existing NON-null store_id would orphan
     * that row from tenant visibility entirely (`visibleStaffBaseQuery()`
     * / `ScopesToTenant::tenantOwnerId()` both stop resolving it to any
     * real tenant) — silently, since nothing else currently rejects this.
     * So `null` is only allowed through when it's a genuine no-op: the
     * row's current store_id is ALSO already null. Passing no
     * $currentStoreId (the default) means "no existing row to compare
     * against" — used by store() (creation), where store_id is validated
     * `required` and so is never actually null by the time this runs.
     */
    protected function storeIdBelongsToCaller(?string $storeId, $currentUser, ?string $currentStoreId = null): bool
    {
        if ($currentUser->hasRole('super_admin')) {
            return true;
        }

        if ($storeId === null) {
            return $currentStoreId === null;
        }

        $subscriptionService = app(\App\Services\SubscriptionService::class);
        $owner = $subscriptionService->getSubscriptionOwner($currentUser);
        $ownedStoreIds = Store::where('user_id', $owner->id)->pluck('id')->toArray();

        return in_array($storeId, $ownedStoreIds, true);
    }

    /**
     * Whether $roleSlug's permission set is a subset of (or equal to)
     * $currentUser's own current permission set — i.e. NOT a privilege
     * escalation. Compares actual Role->permissions rows rather than a
     * hardcoded rank list, so it stays correct if permissions are ever
     * re-seeded. 'store_owner' is treated as 'admin' (same permission
     * set), mirroring User::hasPermission()'s own store_owner->admin
     * fallback. Ports SyncController's original private copy of this
     * check so the REST staff endpoints and the sync-push path can't
     * drift apart on what counts as a privilege escalation.
     */
    protected function roleIsAtOrBelowCallerPrivilege(string $roleSlug, $currentUser): bool
    {
        $normalize = fn (string $slug) => $slug === 'store_owner' ? 'admin' : $slug;

        $targetRole = Role::where('slug', $normalize($roleSlug))->first();
        $targetPermissions = $targetRole
            ? $targetRole->permissions()->pluck('slug')->all()
            : [];

        $callerRoleSlug = $currentUser->userRole?->slug ?? $currentUser->role;
        $callerRole = $callerRoleSlug ? Role::where('slug', $normalize($callerRoleSlug))->first() : null;
        $callerPermissions = $callerRole
            ? $callerRole->permissions()->pluck('slug')->all()
            : [];

        return empty(array_diff($targetPermissions, $callerPermissions));
    }
}
