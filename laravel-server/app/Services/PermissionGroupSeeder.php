<?php

namespace App\Services;

use App\Models\PermissionGroup;
use App\Models\Store;
use App\Models\User;
use Illuminate\Support\Str;

/**
 * Server-side counterpart to the client's ensurePermissionGroupsSeeded()
 * (client/lib/db/queries/permission-groups.ts) - the spec ("Default group
 * seeding") calls for a lazy check on "relevant API entry points" server
 * side too, not just client-side on login (final review, Important I4):
 * a store whose staff/groups are only ever touched through the web
 * dashboard, or a second device pulling before the first device's own
 * seed has pushed up, would otherwise never see default groups exist.
 *
 * deterministicDefaultGroupId() is a byte-for-byte port of the client's
 * own algorithm (same 4-lane FNV-1a-style hash) - this is load-bearing:
 * a client and this server seeding the SAME store independently, before
 * either has synced with the other, must compute the SAME id per role so
 * the sync engine's existing "INSERT against an existing id becomes an
 * UPDATE" handling collapses the race instead of leaving two rows.
 */
class PermissionGroupSeeder
{
    private const DEFAULT_GROUP_PERMISSIONS = [
        'admin' => [
            'process_sales', 'apply_discounts', 'void_refund_sales', 'override_price',
            'manage_products', 'adjust_stock_counts', 'manage_purchase_orders',
            'receive_purchase_orders', 'manage_suppliers', 'request_stock_transfers',
            'approve_stock_transfers',
            'dispense_prescriptions', 'manage_prescriptions',
            'manage_customers', 'manage_loyalty',
            'view_reports', 'export_reports', 'view_activity_log',
            'record_expenses', 'view_all_expenses',
            'manage_staff', 'manage_roles_permissions',
            'manage_store_settings', 'manage_payment_accounts', 'manage_online_store', 'manage_billing',
            'backup_restore_data', 'factory_reset',
        ],
        'manager' => [
            'process_sales', 'apply_discounts', 'void_refund_sales', 'override_price',
            'manage_products', 'adjust_stock_counts', 'manage_purchase_orders',
            'receive_purchase_orders', 'manage_suppliers', 'request_stock_transfers',
            'approve_stock_transfers',
            'dispense_prescriptions', 'manage_prescriptions',
            'manage_customers', 'manage_loyalty',
            'view_reports', 'export_reports',
            'record_expenses', 'view_all_expenses',
            'manage_staff',
            'manage_store_settings', 'manage_payment_accounts', 'manage_online_store', 'backup_restore_data',
        ],
        'specialist' => [
            'process_sales',
            'manage_products', 'adjust_stock_counts', 'manage_purchase_orders',
            'receive_purchase_orders', 'manage_suppliers', 'request_stock_transfers',
            'dispense_prescriptions', 'manage_prescriptions',
            'manage_customers',
            'record_expenses',
        ],
        'sales_staff' => [
            'process_sales',
            'manage_customers',
            'record_expenses',
        ],
        'auditor' => [
            'view_reports', 'export_reports', 'view_all_expenses',
        ],
    ];

    private const LABELS = [
        'admin' => 'Admin',
        'manager' => 'Manager',
        'specialist' => 'Specialist',
        'sales_staff' => 'Sales Staff',
        'auditor' => 'Auditor',
    ];

    public static function deterministicDefaultGroupId(string $storeId, string $role): string
    {
        $seed = "permission-group-default:{$storeId}:{$role}";
        $seedOffsets = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35];
        $lanes = [];
        foreach ($seedOffsets as $seedOffset) {
            $h = $seedOffset;
            for ($i = 0; $i < strlen($seed); $i++) {
                $h ^= ord($seed[$i]);
                $h = ($h * 0x01000193) & 0xFFFFFFFF;
            }
            $lanes[] = str_pad(dechex($h), 8, '0', STR_PAD_LEFT);
        }
        [$a, $b, $c, $d] = $lanes;

        return sprintf(
            '%s-%s-4%s-%s%s-%s%s',
            $a,
            substr($b, 0, 4),
            substr($b, 5, 3),
            dechex((hexdec($c[0]) & 0x3) | 0x8),
            substr($c, 1, 3),
            $d,
            substr($c, 4, 4),
        );
    }

    /** Idempotent, gated on stores.permission_groups_seeded_at exactly
     * like the client - a store that deliberately deletes its default
     * groups is never silently reseeded. */
    public static function ensureSeeded(Store $store): void
    {
        if ($store->permission_groups_seeded_at) {
            return;
        }

        $existingRoles = PermissionGroup::where('store_id', $store->id)->pluck('based_on_role')->all();

        $groupIdByRole = [];
        foreach (self::DEFAULT_GROUP_PERMISSIONS as $role => $permissions) {
            $id = self::deterministicDefaultGroupId($store->id, $role);
            $groupIdByRole[$role] = $id;
            if (in_array($role, $existingRoles, true)) {
                continue;
            }
            $group = new PermissionGroup();
            $group->forceFill([
                'id' => $id,
                'store_id' => $store->id,
                'name' => self::LABELS[$role],
                'based_on_role' => $role,
                'is_default' => true,
                'permissions' => $permissions,
            ]);
            $group->save();
        }

        foreach (array_keys(self::DEFAULT_GROUP_PERMISSIONS) as $role) {
            User::where('store_id', $store->id)
                ->where('role', $role)
                ->whereNull('permission_group_id')
                ->update(['permission_group_id' => $groupIdByRole[$role]]);
        }

        $store->permission_groups_seeded_at = now();
        $store->save();
    }
}
