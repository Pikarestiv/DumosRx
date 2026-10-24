<?php

namespace App\Services\Sync;

use App\Casts\JsonList;
use App\Models\PermissionGroup;

/** Keeps view_stock_quantities on groups written by bundles older than INTRODUCED_IN.
 * Retire once no active device reports an older X-App-Version; see laravel-server/AGENTS.md. */
final class LegacyStockQuantitiesGrant
{
    public const KEY = 'view_stock_quantities';

    public const INTRODUCED_IN = '0.0.41';

    private const UNRESTRICTED_ROLES = ['store_owner', 'admin', 'super_admin'];

    public static function apply(array $payload, ?string $recordId, string $operation, ?string $appVersion, $caller): array
    {
        if (! array_key_exists('permissions', $payload) || $payload['permissions'] === null) {
            return $payload;
        }

        $payload['permissions'] = JsonList::decodeList($payload['permissions']);

        if (! self::isLegacyBundle($appVersion)
            || in_array(self::KEY, $payload['permissions'], true)
            || ! self::callerMayGrant($caller)
            || ! self::isOwed($recordId, $operation)) {
            return $payload;
        }

        $payload['permissions'][] = self::KEY;

        return $payload;
    }

    private static function isLegacyBundle(?string $appVersion): bool
    {
        return ! $appVersion || version_compare($appVersion, self::INTRODUCED_IN, '<');
    }

    private static function callerMayGrant($caller): bool
    {
        $role = strtolower(preg_replace('/[^a-z_]/i', '', $caller->role ?? ''));
        if (in_array($role, self::UNRESTRICTED_ROLES, true)) {
            return true;
        }

        $ownGroup = $caller->permission_group_id ? PermissionGroup::find($caller->permission_group_id) : null;

        return in_array(self::KEY, $ownGroup->permissions ?? [], true);
    }

    private static function isOwed(?string $recordId, string $operation): bool
    {
        $existing = $recordId ? PermissionGroup::withTrashed()->find($recordId) : null;
        if ($existing) {
            return in_array(self::KEY, $existing->permissions ?? [], true);
        }

        return $operation === 'INSERT';
    }
}
