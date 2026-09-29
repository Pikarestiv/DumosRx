<?php

namespace Tests\Feature;

use App\Models\PermissionGroup;
use App\Models\Store;
use App\Models\User;
use App\Services\PermissionGroupSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * ensureSeeded() runs once per store, gated on
 * stores.permission_groups_seeded_at, so a store seeded under an older
 * catalog was permanently frozen on that catalog's permission lists. This
 * covers the versioned, add-only backfill that unfreezes it - see
 * client/AGENTS.md's "Catalog versioning and the default-group backfill".
 */
class PermissionCatalogBackfillTest extends TestCase
{
    use RefreshDatabase;

    /** The 2026-09-27 launch lists (a5f40463) - what an already-seeded
     * store is still carrying. */
    private const V1_DEFAULTS = [
        'admin' => [
            'process_sales', 'apply_discounts', 'void_refund_sales', 'open_cash_drawer', 'override_price',
            'manage_products', 'manage_stock_batches', 'adjust_stock_counts', 'manage_purchase_orders',
            'receive_purchase_orders', 'manage_suppliers', 'request_stock_transfers', 'approve_stock_transfers',
            'dispense_prescriptions', 'manage_prescriptions', 'manage_customers', 'manage_loyalty',
            'view_reports', 'export_reports', 'view_activity_log', 'record_expenses', 'view_all_expenses',
            'manage_staff', 'manage_roles_permissions', 'manage_store_settings', 'manage_payment_accounts',
            'manage_online_store', 'manage_billing', 'backup_restore_data', 'factory_reset',
        ],
        'manager' => [
            'process_sales', 'apply_discounts', 'void_refund_sales', 'open_cash_drawer', 'override_price',
            'manage_products', 'manage_stock_batches', 'adjust_stock_counts', 'manage_purchase_orders',
            'receive_purchase_orders', 'manage_suppliers', 'request_stock_transfers', 'approve_stock_transfers',
            'dispense_prescriptions', 'manage_prescriptions', 'manage_customers', 'manage_loyalty',
            'view_reports', 'export_reports', 'record_expenses', 'view_all_expenses', 'manage_staff',
            'manage_store_settings', 'manage_payment_accounts', 'manage_online_store', 'backup_restore_data',
        ],
        'specialist' => [
            'process_sales', 'manage_products', 'manage_stock_batches', 'adjust_stock_counts',
            'manage_purchase_orders', 'receive_purchase_orders', 'manage_suppliers',
            'request_stock_transfers', 'dispense_prescriptions', 'manage_prescriptions',
            'manage_customers', 'record_expenses',
        ],
        'sales_staff' => ['process_sales', 'manage_customers', 'record_expenses'],
        'auditor' => ['view_reports', 'export_reports', 'view_all_expenses'],
    ];

    protected function setUp(): void
    {
        parent::setUp();
        \Illuminate\Support\Facades\Schema::disableForeignKeyConstraints();
        $this->seed(\Database\Seeders\RolesAndPermissionsSeeder::class);
        \Illuminate\Support\Facades\Schema::enableForeignKeyConstraints();
    }

    private function makeStore(): Store
    {
        $owner = User::create([
            'first_name' => 'Owner', 'last_name' => 'Backfill',
            'email' => 'owner-pgbf-' . uniqid() . '@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        return Store::create([
            'user_id' => $owner->id,
            'name' => 'Store PG Backfill',
            'email' => 'store-pgbf-' . uniqid() . '@dumosrx.com',
            'phone' => '1234567890',
            'address' => '123 Test St',
            'store_slug' => 'store-pgbf-' . uniqid(),
            'device_id' => 'WEB-PGBF-' . uniqid(),
        ]);
    }

    /** A store seeded before the catalog grew: groups exist, seeded-at is
     * stamped, and there is no catalog-version stamp at all. */
    private function seedPreExpansionStore(array $overrides = []): Store
    {
        $store = $this->makeStore();
        foreach (self::V1_DEFAULTS as $role => $permissions) {
            $group = new PermissionGroup();
            $group->forceFill([
                'id' => PermissionGroupSeeder::deterministicDefaultGroupId($store->id, $role),
                'store_id' => $store->id,
                'name' => ucfirst($role),
                'based_on_role' => $role,
                'is_default' => true,
                'permissions' => $overrides[$role] ?? $permissions,
                '_version' => 3,
            ])->save();
        }
        $store->forceFill([
            'permission_groups_seeded_at' => now(),
            'permission_catalog_version' => null,
        ])->save();

        return $store->fresh();
    }

    private function groupFor(Store $store, string $role): PermissionGroup
    {
        return PermissionGroup::where('store_id', $store->id)->where('based_on_role', $role)->first();
    }

    public function test_it_brings_an_already_seeded_pre_expansion_store_up_to_the_current_defaults(): void
    {
        $store = $this->seedPreExpansionStore();

        PermissionGroupSeeder::ensureSeeded($store);

        foreach (PermissionGroupSeeder::defaultGroupPermissions() as $role => $expected) {
            $granted = $this->groupFor($store, $role)->permissions;
            $this->assertEmpty(
                array_diff($expected, $granted),
                "'{$role}' is still missing " . implode(', ', array_diff($expected, $granted)),
            );
        }
    }

    public function test_it_restores_the_exact_cashier_keys_the_enforcement_pass_depended_on(): void
    {
        $store = $this->seedPreExpansionStore();

        PermissionGroupSeeder::ensureSeeded($store);

        $granted = $this->groupFor($store, 'sales_staff')->permissions;
        foreach (['hold_sales', 'view_sales_history', 'reprint_receipt', 'override_price', 'view_customer_balances'] as $key) {
            $this->assertContains($key, $granted);
        }
    }

    public function test_it_never_removes_a_key_the_store_already_had(): void
    {
        $store = $this->seedPreExpansionStore();

        PermissionGroupSeeder::ensureSeeded($store);

        $granted = $this->groupFor($store, 'admin')->permissions;
        $this->assertContains('open_cash_drawer', $granted);
        $this->assertContains('manage_stock_batches', $granted);
    }

    public function test_it_leaves_a_custom_non_default_group_untouched(): void
    {
        $store = $this->seedPreExpansionStore();
        $custom = new PermissionGroup();
        $custom->forceFill([
            'id' => (string) Str::uuid(),
            'store_id' => $store->id,
            'name' => 'Supervisor',
            'based_on_role' => 'manager',
            'is_default' => false,
            'permissions' => ['process_sales'],
            '_version' => 1,
        ])->save();

        PermissionGroupSeeder::ensureSeeded($store);

        $this->assertSame(['process_sales'], $custom->fresh()->permissions);
        $this->assertSame(1, (int) $custom->fresh()->_version);
    }

    public function test_it_does_not_restore_a_key_the_owner_unticked_outside_the_version_delta(): void
    {
        $trimmed = array_values(array_diff(self::V1_DEFAULTS['manager'], ['manage_loyalty']));
        $store = $this->seedPreExpansionStore(['manager' => $trimmed]);

        PermissionGroupSeeder::ensureSeeded($store);

        $this->assertNotContains('manage_loyalty', $this->groupFor($store, 'manager')->permissions);
    }

    public function test_it_is_idempotent_and_duplicates_no_key(): void
    {
        $store = $this->seedPreExpansionStore();

        PermissionGroupSeeder::ensureSeeded($store);
        $afterFirst = [];
        $versionsAfterFirst = [];
        foreach (array_keys(self::V1_DEFAULTS) as $role) {
            $group = $this->groupFor($store, $role);
            $afterFirst[$role] = $group->permissions;
            $versionsAfterFirst[$role] = (int) $group->_version;
        }

        PermissionGroupSeeder::ensureSeeded($store->fresh());

        foreach (array_keys(self::V1_DEFAULTS) as $role) {
            $group = $this->groupFor($store, $role);
            $this->assertSame($afterFirst[$role], $group->permissions);
            $this->assertSame(count($group->permissions), count(array_unique($group->permissions)));
            $this->assertSame($versionsAfterFirst[$role], (int) $group->_version, "'{$role}' was rewritten on the second run");
        }
    }

    public function test_it_stamps_the_current_catalog_version(): void
    {
        $store = $this->seedPreExpansionStore();

        PermissionGroupSeeder::ensureSeeded($store);

        $this->assertSame(PermissionGroupSeeder::catalogVersion(), (int) $store->fresh()->permission_catalog_version);
    }

    public function test_a_freshly_seeded_store_is_stamped_at_the_current_version(): void
    {
        $store = $this->makeStore();

        PermissionGroupSeeder::ensureSeeded($store);

        $this->assertSame(PermissionGroupSeeder::catalogVersion(), (int) $store->fresh()->permission_catalog_version);
    }

    public function test_a_store_already_stamped_at_the_current_version_is_left_alone(): void
    {
        $store = $this->seedPreExpansionStore();
        $store->forceFill(['permission_catalog_version' => PermissionGroupSeeder::catalogVersion()])->save();

        PermissionGroupSeeder::ensureSeeded($store->fresh());

        $this->assertSame(self::V1_DEFAULTS['sales_staff'], $this->groupFor($store, 'sales_staff')->permissions);
    }

    /**
     * The silent-overwrite hazard: a device that has not backfilled yet
     * still holds the pre-backfill array at the pre-backfill _version. Unless
     * the backfill BUMPS _version, that device's next push carries a version
     * equal to the server's and sails through push()'s strict-equality check,
     * erasing the backfill. Bumping it turns that push into the
     * version_conflict push.ts already knows how to resolve (drop the queue
     * row, let the next pull bring the server's superset down).
     */
    public function test_it_bumps_the_row_version_so_a_stale_device_push_cannot_silently_erase_it(): void
    {
        $store = $this->seedPreExpansionStore();
        $before = (int) $this->groupFor($store, 'sales_staff')->_version;

        PermissionGroupSeeder::ensureSeeded($store);

        $this->assertGreaterThan($before, (int) $this->groupFor($store, 'sales_staff')->_version);
    }

    public function test_client_first_and_server_first_orderings_converge_on_the_same_array(): void
    {
        $serverFirst = $this->seedPreExpansionStore();
        PermissionGroupSeeder::ensureSeeded($serverFirst);

        $alreadyApplied = [];
        foreach (self::V1_DEFAULTS as $role => $permissions) {
            $alreadyApplied[$role] = array_values(array_unique(array_merge(
                $permissions,
                PermissionGroupSeeder::defaultGroupPermissionAdditions()[2][$role],
            )));
        }
        $clientFirst = $this->seedPreExpansionStore($alreadyApplied);
        PermissionGroupSeeder::ensureSeeded($clientFirst);

        foreach (array_keys(self::V1_DEFAULTS) as $role) {
            $a = $this->groupFor($serverFirst, $role)->permissions;
            $b = $this->groupFor($clientFirst, $role)->permissions;
            sort($a);
            sort($b);
            $this->assertSame($a, $b, "'{$role}' diverged between orderings");
        }
    }

    /** A client that has already applied the delta pushes nothing, so the
     * server must not rewrite (and re-version) rows that already carry it. */
    public function test_it_does_not_rewrite_a_group_that_already_carries_the_whole_delta(): void
    {
        $alreadyApplied = [];
        foreach (self::V1_DEFAULTS as $role => $permissions) {
            $alreadyApplied[$role] = array_values(array_unique(array_merge(
                $permissions,
                PermissionGroupSeeder::defaultGroupPermissionAdditions()[2][$role],
            )));
        }
        $store = $this->seedPreExpansionStore($alreadyApplied);

        PermissionGroupSeeder::ensureSeeded($store);

        $this->assertSame(3, (int) $this->groupFor($store, 'auditor')->_version);
    }
}
