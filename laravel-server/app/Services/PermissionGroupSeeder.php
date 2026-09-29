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
    /** Hand-maintained port of client/lib/constants/permissions.ts's
     * PERMISSION_CATALOG_VERSION. See PermissionCatalogParityTest. */
    private const CATALOG_VERSION = 2;

    private const DEFAULT_GROUP_PERMISSIONS = [
        'admin' => [
            'process_sales', 'apply_discounts', 'void_refund_sales', 'override_price',
            'hold_sales', 'view_sales_history', 'reprint_receipt', 'run_daily_close',
            'manage_products', 'adjust_stock_counts', 'manage_purchase_orders',
            'receive_purchase_orders', 'manage_suppliers', 'request_stock_transfers',
            'approve_stock_transfers',
            'view_cost_fields', 'edit_product_cost', 'edit_product_price', 'delete_products',
            'perform_stock_audit', 'view_stock_adjustment_history', 'print_product_labels',
            'export_product_list', 'view_suppliers', 'delete_suppliers',
            'dispense_prescriptions', 'manage_prescriptions',
            'manage_customers', 'manage_loyalty', 'delete_customers', 'view_customer_balances',
            'view_reports', 'export_reports', 'view_activity_log',
            'view_dashboard', 'view_financial_reports',
            'record_expenses', 'view_all_expenses',
            'manage_staff', 'manage_roles_permissions',
            'manage_store_settings', 'manage_payment_accounts', 'manage_online_store', 'manage_billing',
            'backup_restore_data', 'manage_device_settings', 'install_app_updates', 'factory_reset',
        ],
        'manager' => [
            'process_sales', 'apply_discounts', 'void_refund_sales', 'override_price',
            'hold_sales', 'view_sales_history', 'reprint_receipt', 'run_daily_close',
            'manage_products', 'adjust_stock_counts', 'manage_purchase_orders',
            'receive_purchase_orders', 'manage_suppliers', 'request_stock_transfers',
            'approve_stock_transfers',
            'view_cost_fields', 'edit_product_cost', 'edit_product_price', 'delete_products',
            'perform_stock_audit', 'view_stock_adjustment_history', 'print_product_labels',
            'export_product_list', 'view_suppliers', 'delete_suppliers',
            'dispense_prescriptions', 'manage_prescriptions',
            'manage_customers', 'manage_loyalty', 'delete_customers', 'view_customer_balances',
            'view_reports', 'export_reports',
            'view_dashboard', 'view_financial_reports',
            'record_expenses', 'view_all_expenses',
            'manage_staff',
            'manage_store_settings', 'manage_payment_accounts', 'manage_online_store', 'backup_restore_data',
            'manage_device_settings', 'install_app_updates',
        ],
        'specialist' => [
            'process_sales',
            'hold_sales', 'view_sales_history',
            'manage_products', 'adjust_stock_counts', 'manage_purchase_orders',
            'receive_purchase_orders', 'manage_suppliers', 'request_stock_transfers',
            'view_cost_fields', 'edit_product_cost', 'edit_product_price',
            'perform_stock_audit', 'view_stock_adjustment_history', 'print_product_labels',
            'export_product_list', 'view_suppliers',
            'dispense_prescriptions', 'manage_prescriptions',
            'manage_customers', 'view_customer_balances',
            'view_dashboard',
            'record_expenses',
            'manage_device_settings',
        ],
        'sales_staff' => [
            'process_sales', 'override_price',
            'hold_sales', 'view_sales_history', 'reprint_receipt',
            'request_stock_transfers',
            'manage_customers', 'view_customer_balances',
            'view_dashboard',
            'record_expenses',
        ],
        'auditor' => [
            'view_reports', 'export_reports', 'view_all_expenses',
            'view_sales_history',
            'view_cost_fields', 'view_stock_adjustment_history', 'view_suppliers',
            'export_product_list',
            'view_customer_balances', 'view_dashboard', 'view_financial_reports',
        ],
    ];

    /** Port of the client's DEFAULT_GROUP_PERMISSION_ADDITIONS: per catalog
     * version, the keys each default group gained at that version. */
    private const DEFAULT_GROUP_PERMISSION_ADDITIONS = [
        2 => [
            'admin' => [
                'hold_sales', 'view_sales_history', 'reprint_receipt', 'run_daily_close',
                'view_cost_fields', 'edit_product_cost', 'edit_product_price', 'delete_products',
                'perform_stock_audit', 'view_stock_adjustment_history', 'print_product_labels',
                'export_product_list', 'view_suppliers', 'delete_suppliers',
                'delete_customers', 'view_customer_balances',
                'view_dashboard', 'view_financial_reports',
                'manage_device_settings', 'install_app_updates',
            ],
            'manager' => [
                'hold_sales', 'view_sales_history', 'reprint_receipt', 'run_daily_close',
                'view_cost_fields', 'edit_product_cost', 'edit_product_price', 'delete_products',
                'perform_stock_audit', 'view_stock_adjustment_history', 'print_product_labels',
                'export_product_list', 'view_suppliers', 'delete_suppliers',
                'delete_customers', 'view_customer_balances',
                'view_dashboard', 'view_financial_reports',
                'manage_device_settings', 'install_app_updates',
            ],
            'specialist' => [
                'hold_sales', 'view_sales_history',
                'view_cost_fields', 'edit_product_cost', 'edit_product_price',
                'perform_stock_audit', 'view_stock_adjustment_history', 'print_product_labels',
                'export_product_list', 'view_suppliers',
                'view_customer_balances', 'view_dashboard', 'manage_device_settings',
            ],
            'sales_staff' => [
                'hold_sales', 'view_sales_history', 'reprint_receipt', 'override_price',
                'request_stock_transfers', 'view_customer_balances', 'view_dashboard',
            ],
            'auditor' => [
                'view_sales_history', 'view_cost_fields', 'view_stock_adjustment_history',
                'view_suppliers', 'view_customer_balances', 'view_dashboard',
                'view_financial_reports', 'export_product_list',
            ],
        ],
    ];

    public static function catalogVersion(): int
    {
        return self::CATALOG_VERSION;
    }

    /** @return array<string, string[]> */
    public static function defaultGroupPermissions(): array
    {
        return self::DEFAULT_GROUP_PERMISSIONS;
    }

    /** @return array<int, array<string, string[]>> */
    public static function defaultGroupPermissionAdditions(): array
    {
        return self::DEFAULT_GROUP_PERMISSION_ADDITIONS;
    }

    /** Every key any backfill may ever add to a default group for $role.
     * SyncController uses it to recognise a client-pushed backfill UPDATE
     * whose signed-in user does not hold those keys themselves. */
    public static function backfillableKeysForRole(string $role): array
    {
        $keys = [];
        foreach (self::DEFAULT_GROUP_PERMISSION_ADDITIONS as $byRole) {
            foreach ($byRole[$role] ?? [] as $key) {
                $keys[$key] = true;
            }
        }

        return array_keys($keys);
    }

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
     * groups is never silently reseeded. An ALREADY-seeded store falls
     * through to ensureCatalogBackfilled(), which is what carries it
     * forward when the catalog grows. */
    public static function ensureSeeded(Store $store): void
    {
        if ($store->permission_groups_seeded_at) {
            self::ensureCatalogBackfilled($store);

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
        $store->permission_catalog_version = self::CATALOG_VERSION;
        $store->save();
    }

    /** The keys a default group for $role is owed by every catalog version
     * newer than $fromVersion. Mirror of the client's
     * pendingCatalogAdditions(). */
    public static function pendingCatalogAdditions(string $role, int $fromVersion): array
    {
        $pending = [];
        foreach (self::DEFAULT_GROUP_PERMISSION_ADDITIONS as $version => $byRole) {
            if ($version <= $fromVersion) {
                continue;
            }
            foreach ($byRole[$role] ?? [] as $key) {
                $pending[$key] = true;
            }
        }

        return array_keys($pending);
    }

    /**
     * Brings an already-seeded store's DEFAULT groups forward to the current
     * catalog. Add-only, delta-scoped and idempotent: it unions in the keys
     * listed for each role under every catalog version newer than the
     * store's stamp, removes nothing, and writes a group only when its
     * stored array actually changes.
     *
     * The _version bump on a changed group is load-bearing, not bookkeeping:
     * a device that has not backfilled yet still holds the pre-backfill
     * array at the pre-backfill version, and without the bump its next push
     * would pass push()'s strict version-equality check and silently erase
     * this write. With it, that push is rejected as a version_conflict,
     * which the client's push.ts already resolves by dropping the queue row
     * and letting the next pull bring this superset down. See
     * client/AGENTS.md's "Catalog versioning and the default-group backfill".
     */
    public static function ensureCatalogBackfilled(Store $store): void
    {
        $stamped = $store->permission_catalog_version ?? 1;
        if ($stamped >= self::CATALOG_VERSION) {
            return;
        }

        $groups = PermissionGroup::where('store_id', $store->id)->where('is_default', true)->get();
        foreach ($groups as $group) {
            $owed = self::pendingCatalogAdditions($group->based_on_role, $stamped);
            if (empty($owed)) {
                continue;
            }

            $granted = is_array($group->permissions) ? $group->permissions : [];
            $missing = array_values(array_diff($owed, $granted));
            if (empty($missing)) {
                continue;
            }

            $group->permissions = array_merge($granted, $missing);
            $group->_version = (int) ($group->_version ?? 1) + 1;
            $group->save();
        }

        $store->permission_catalog_version = self::CATALOG_VERSION;
        $store->save();
    }
}
