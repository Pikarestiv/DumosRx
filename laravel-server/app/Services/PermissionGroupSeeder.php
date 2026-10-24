<?php

namespace App\Services;

use App\Models\PermissionGroup;
use App\Models\Store;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/** Port of the client's permission-group seeding and catalog backfill; see
 * laravel-server/AGENTS.md's "PermissionGroupSeeder" section. */
class PermissionGroupSeeder
{
    /** Hand-maintained port of client/lib/constants/permissions.ts's
     * PERMISSION_CATALOG_VERSION. See PermissionCatalogParityTest. */
    private const CATALOG_VERSION = 3;

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
            'view_stock_quantities',
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
            'view_stock_quantities',
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
            'view_stock_quantities',
        ],
        'sales_staff' => [
            'process_sales', 'override_price',
            'hold_sales', 'view_sales_history', 'reprint_receipt',
            'request_stock_transfers',
            'manage_customers', 'view_customer_balances',
            'view_dashboard',
            'record_expenses',
            'view_stock_quantities',
        ],
        'auditor' => [
            'view_reports', 'export_reports', 'view_all_expenses',
            'view_sales_history',
            'view_cost_fields', 'view_stock_adjustment_history', 'view_suppliers',
            'export_product_list',
            'view_customer_balances', 'view_dashboard', 'view_financial_reports',
            'view_stock_quantities',
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
        3 => [
            'admin' => ['view_stock_quantities'],
            'manager' => ['view_stock_quantities'],
            'specialist' => ['view_stock_quantities'],
            'sales_staff' => ['view_stock_quantities'],
            'auditor' => ['view_stock_quantities'],
        ],
    ];

    /** Port of the client's ALL_GROUP_PERMISSION_ADDITIONS: carve-out keys
     * every group, default or custom, gains at that version. */
    private const ALL_GROUP_PERMISSION_ADDITIONS = [
        3 => ['view_stock_quantities'],
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

    /** @return array<int, string[]> */
    public static function allGroupPermissionAdditions(): array
    {
        return self::ALL_GROUP_PERMISSION_ADDITIONS;
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
        $seedOffsets = [0x811C9DC5, 0x9E3779B9, 0x85EBCA6B, 0xC2B2AE35];
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

        $existingRoles = PermissionGroup::withTrashed()->where('store_id', $store->id)->pluck('based_on_role')->all();

        $groupIdByRole = [];
        foreach (self::DEFAULT_GROUP_PERMISSIONS as $role => $permissions) {
            $id = self::deterministicDefaultGroupId($store->id, $role);
            $groupIdByRole[$role] = $id;
            if (in_array($role, $existingRoles, true)) {
                continue;
            }
            $group = new PermissionGroup;
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
                ->update([
                    'permission_group_id' => $groupIdByRole[$role],
                    '_version' => DB::raw('COALESCE(_version, 0) + 1'),
                ]);
        }

        $store->permission_groups_seeded_at = now();
        $store->permission_catalog_version = self::CATALOG_VERSION;
        $store->save();
    }

    /** Mirror of the client's pendingCatalogAdditions(). */
    public static function pendingCatalogAdditions(string $role, int $fromVersion, bool $isDefault = true): array
    {
        $pending = [];
        foreach (self::DEFAULT_GROUP_PERMISSION_ADDITIONS as $version => $byRole) {
            if ($version <= $fromVersion || ! $isDefault) {
                continue;
            }
            foreach ($byRole[$role] ?? [] as $key) {
                $pending[$key] = true;
            }
        }
        foreach (self::ALL_GROUP_PERMISSION_ADDITIONS as $version => $keys) {
            if ($version > $fromVersion) {
                $pending += array_fill_keys($keys, true);
            }
        }

        return array_keys($pending);
    }

    /** Add-only, delta-scoped, idempotent; the _version bump is load-bearing.
     * See client/AGENTS.md's "Catalog versioning and the default-group backfill". */
    public static function ensureCatalogBackfilled(Store $store): void
    {
        $stamped = $store->permission_catalog_version ?? 1;
        if ($stamped >= self::CATALOG_VERSION) {
            return;
        }

        $groups = PermissionGroup::where('store_id', $store->id)->get();
        foreach ($groups as $group) {
            $owed = self::pendingCatalogAdditions((string) $group->based_on_role, $stamped, (bool) $group->is_default);
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
