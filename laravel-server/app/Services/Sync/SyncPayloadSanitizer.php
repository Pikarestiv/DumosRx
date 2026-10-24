<?php

namespace App\Services\Sync;

use App\Http\Controllers\Concerns\EnforcesStaffOwnership;

/** Design notes: docs/SYNC_SERVER_RATIONALE.md#syncpayloadsanitizer */
class SyncPayloadSanitizer
{
    use EnforcesStaffOwnership;

    private const USER_SYNC_FORBIDDEN_FIELDS = [
        'role_id', 'email_verified_at', 'remember_token',
        'referral_code', 'referred_by_id', 'referral_credits',
        'platform_referral_code', 'registered_by_id', 'account_manager_id',
        'deletion_requested_at', 'deletion_reason',
        'setup_reminder_level', 'setup_reminder_last_sent_at',
    ];

    private const USER_SYNC_SELF_ALLOWED_FIELDS = [
        'id', 'first_name', 'last_name', 'phone', 'email', 'username',
        'password', 'pin', 'auto_lock_duration', 'last_login_at', 'updated_at',
        '_version', '_synced_at',
    ];

    private const USER_SYNC_ASSIGNABLE_ROLES = ['admin', 'manager', 'specialist', 'sales_staff', 'auditor'];

    public function sanitizeUserSyncPayload(array $payload, $recordId, $currentUser, array $allowedStoreIds): array
    {
        foreach (self::USER_SYNC_FORBIDDEN_FIELDS as $field) {
            unset($payload[$field]);
        }

        $isSelf = $recordId !== null && (string) $recordId === (string) $currentUser->id;

        if ($isSelf) {
            return array_intersect_key($payload, array_flip(self::USER_SYNC_SELF_ALLOWED_FIELDS));
        }

        if (! $currentUser->hasPermission('manage_staff')) {
            throw new \RuntimeException('Sync push: users payload attempted to modify another user without manage_staff permission');
        }

        if (array_key_exists('role', $payload) && $payload['role'] !== null) {
            if (! in_array($payload['role'], self::USER_SYNC_ASSIGNABLE_ROLES, true)) {
                throw new \RuntimeException('Sync push: users payload attempted to set a disallowed role');
            }

            if (! $this->roleIsAtOrBelowCallerPrivilege($payload['role'], $currentUser)) {
                throw new \RuntimeException('Sync push: users payload attempted to grant a role above the caller\'s own privilege level');
            }
        }

        if (array_key_exists('store_id', $payload) && $payload['store_id'] !== null) {
            if (! in_array($payload['store_id'], $allowedStoreIds, true)) {
                throw new \RuntimeException('Sync push: users payload attempted to set store_id outside caller\'s allowed stores');
            }
        }

        return $payload;
    }

    public function sanitizePermissionGroupSyncPayload(array $payload, ?string $recordId, string $operation, $currentUser, array $allowedStoreIds = []): array
    {
        $existing = $recordId ? \App\Models\PermissionGroup::withTrashed()->find($recordId) : null;

        if ($existing && ! in_array($existing->store_id, $allowedStoreIds, true)) {
            return $payload;
        }

        if ($operation === 'DELETE') {
            if ($existing && $existing->is_default) {
                throw new \RuntimeException('Sync push: default permission groups cannot be deleted');
            }
            if ($existing && \App\Models\User::where('permission_group_id', $existing->id)->where('is_active', true)->exists()) {
                throw new \RuntimeException('Sync push: cannot delete a permission group with staff assigned - reassign them first');
            }
        }

        if ($existing && $existing->is_default) {
            unset($payload['name'], $payload['is_default'], $payload['based_on_role']);
        }

        $role = strtolower(preg_replace('/[^a-z_]/i', '', $currentUser->role ?? ''));
        if (in_array($role, ['store_owner', 'admin', 'super_admin'], true)) {
            return $payload;
        }

        if ($operation === 'INSERT') {
            $isFirstTimeDefaultSeed = ! empty($payload['is_default'])
                && ! empty($payload['based_on_role'])
                && $currentUser->store_id
                && ! \App\Models\PermissionGroup::withTrashed()->where('store_id', $currentUser->store_id)
                    ->where('based_on_role', $payload['based_on_role'])
                    ->exists();
            if ($isFirstTimeDefaultSeed) {
                return $payload;
            }
        }

        $ownGroup = $currentUser->permission_group_id
            ? \App\Models\PermissionGroup::find($currentUser->permission_group_id)
            : null;
        $ownPermissions = $ownGroup->permissions ?? [];

        if (isset($payload['permissions']) && is_array($payload['permissions'])) {
            $disallowed = array_diff($payload['permissions'], $ownPermissions);
            if (! empty($disallowed)) {
                throw new \App\Exceptions\SyncPushPermissionDeniedException(
                    'Sync push: permission_groups payload attempted to grant a permission the caller does not hold: '
                    .implode(', ', $disallowed),
                );
            }
        }

        if (! in_array('manage_roles_permissions', $ownPermissions, true)) {
            throw new \App\Exceptions\SyncPushPermissionDeniedException('Sync push: caller lacks manage_roles_permissions');
        }

        return $payload;
    }
}
