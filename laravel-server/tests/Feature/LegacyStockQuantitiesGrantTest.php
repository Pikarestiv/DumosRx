<?php

namespace Tests\Feature;

use App\Models\PermissionGroup;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class LegacyStockQuantitiesGrantTest extends TestCase
{
    use RefreshDatabase;

    private const KEY = 'view_stock_quantities';

    private const OLD_BUNDLE = '0.0.40';

    private const CURRENT_BUNDLE = '0.0.41';

    private User $owner;

    private Store $store;

    protected function setUp(): void
    {
        parent::setUp();
        \Illuminate\Support\Facades\Schema::disableForeignKeyConstraints();
        $this->seed(\Database\Seeders\RolesAndPermissionsSeeder::class);
        \App\Models\SystemConfig::setVal('subscription_plans', [
            'tiers' => ['free' => ['features' => ['cloud_sync' => true], 'limits' => ['stores' => -1, 'staff' => -1]]],
        ]);
        $this->withoutMiddleware();
        \Illuminate\Support\Facades\Schema::enableForeignKeyConstraints();

        $this->owner = User::create([
            'first_name' => 'Owner', 'last_name' => 'Legacy',
            'email' => 'owner-legacy-' . uniqid() . '@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);
        $this->store = Store::create([
            'user_id' => $this->owner->id,
            'name' => 'Legacy Grant Store',
            'email' => 'store-legacy-' . uniqid() . '@dumosrx.com',
            'phone' => '1234567890',
            'address' => '1 Test St',
            'store_slug' => 'store-legacy-' . uniqid(),
            'device_id' => 'WEB-LEGACY-' . uniqid(),
        ]);
        $this->owner->update(['store_id' => $this->store->id]);
    }

    private function group(array $permissions, string $name = 'Supervisor'): PermissionGroup
    {
        return PermissionGroup::create([
            'store_id' => $this->store->id, 'name' => $name, 'based_on_role' => 'manager',
            'is_default' => false, 'permissions' => $permissions,
        ]);
    }

    private function staff(PermissionGroup $group): User
    {
        return User::create([
            'first_name' => 'Staff', 'last_name' => 'Legacy',
            'email' => 'staff-legacy-' . uniqid() . '@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'manager', 'store_id' => $this->store->id, 'permission_group_id' => $group->id,
        ]);
    }

    private function push(User $as, string $operation, string $id, array $permissions, ?string $appVersion)
    {
        $request = $this->actingAs($as);
        if ($appVersion !== null) {
            $request = $request->withHeader('X-App-Version', $appVersion);
        }

        return $request->postJson('/api/v1/app/sync/push', [
            'setup' => true,
            'changes' => [[
                'table_name' => 'permission_groups',
                'operation' => $operation,
                'record_id' => $id,
                'payload' => array_filter([
                    'id' => $id,
                    'store_id' => $operation === 'INSERT' ? $this->store->id : null,
                    'name' => $operation === 'INSERT' ? 'New group' : null,
                    'based_on_role' => $operation === 'INSERT' ? 'manager' : null,
                    'is_default' => $operation === 'INSERT' ? false : null,
                    'permissions' => json_encode($permissions),
                    '_synced' => 0,
                ], fn ($v) => $v !== null),
            ]],
        ]);
    }

    public function test_an_old_bundle_revert_that_drops_the_key_keeps_it(): void
    {
        $group = $this->group(['process_sales', self::KEY]);

        $this->push($this->owner, 'UPDATE', $group->id, ['process_sales'], self::OLD_BUNDLE)->assertOk();

        $this->assertSame(['process_sales', self::KEY], $group->fresh()->permissions);
    }

    public function test_a_current_bundle_payload_that_drops_the_key_removes_it(): void
    {
        $group = $this->group(['process_sales', self::KEY]);

        $this->push($this->owner, 'UPDATE', $group->id, ['process_sales'], self::CURRENT_BUNDLE)->assertOk();

        $this->assertSame(['process_sales'], $group->fresh()->permissions);
    }

    public function test_an_old_bundle_insert_gets_the_key(): void
    {
        $id = (string) Str::uuid();

        $this->push($this->owner, 'INSERT', $id, [], self::OLD_BUNDLE)->assertOk();

        $this->assertSame([self::KEY], PermissionGroup::find($id)->permissions);
    }

    public function test_a_bundle_sending_no_version_header_is_treated_as_old(): void
    {
        $id = (string) Str::uuid();

        $this->push($this->owner, 'INSERT', $id, ['process_sales'], null)->assertOk();

        $this->assertSame(['process_sales', self::KEY], PermissionGroup::find($id)->permissions);
    }

    public function test_an_old_bundle_update_on_a_group_that_never_had_the_key_does_not_add_it(): void
    {
        $group = $this->group(['process_sales']);

        $this->push($this->owner, 'UPDATE', $group->id, ['process_sales', 'hold_sales'], self::OLD_BUNDLE)->assertOk();

        $this->assertSame(['process_sales', 'hold_sales'], $group->fresh()->permissions);
    }

    public function test_a_non_owner_without_the_key_never_has_it_added(): void
    {
        $caller = $this->staff($this->group(['process_sales', 'manage_roles_permissions'], 'Lead'));
        $id = (string) Str::uuid();

        $response = $this->push($caller, 'INSERT', $id, ['process_sales'], self::OLD_BUNDLE)->assertOk();

        $this->assertEmpty($response->json('failed'));
        $this->assertSame(['process_sales'], PermissionGroup::find($id)->permissions);
    }

    public function test_a_non_owner_holding_the_key_gets_it_preserved(): void
    {
        $caller = $this->staff($this->group(['process_sales', 'manage_roles_permissions', self::KEY], 'Lead'));
        $target = $this->group(['process_sales', self::KEY]);

        $this->push($caller, 'UPDATE', $target->id, ['process_sales'], self::OLD_BUNDLE)->assertOk();

        $this->assertSame(['process_sales', self::KEY], $target->fresh()->permissions);
    }

    public function test_a_json_string_payload_still_goes_through_the_escalation_check(): void
    {
        $caller = $this->staff($this->group(['process_sales', 'manage_roles_permissions', self::KEY], 'Lead'));
        $target = $this->group(['process_sales']);

        $response = $this->push($caller, 'UPDATE', $target->id, ['process_sales', 'factory_reset'], self::CURRENT_BUNDLE);

        $response->assertOk();
        $this->assertSame('permission_denied', $response->json('failed.0.reason'));
        $this->assertSame(['process_sales'], $target->fresh()->permissions);
    }

    public function test_a_double_encoded_row_reads_back_as_a_list(): void
    {
        $group = $this->group(['process_sales']);
        \DB::table('permission_groups')->where('id', $group->id)
            ->update(['permissions' => json_encode(json_encode(['process_sales', 'hold_sales']))]);

        $this->assertSame(['process_sales', 'hold_sales'], $group->fresh()->permissions);
    }
}
