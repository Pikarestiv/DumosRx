<?php

namespace Tests\Feature;

use App\Models\PermissionGroup;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Spec (2026-09-27-roles-and-permissions-design.md, "Default group
 * seeding"): seeding must happen "server: equivalent lazy check on
 * relevant API entry points" - not just client-side on login. Without
 * this, a store whose owner never logs in through a client that runs
 * ensurePermissionGroupsSeeded() (e.g. staff/groups created entirely via
 * the web dashboard) never gets its default groups server-side, and any
 * OTHER device pulling before the seeding device has pushed sees no
 * groups at all (final review, Important I4).
 */
class PermissionGroupServerSeedingTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        \Illuminate\Support\Facades\Schema::disableForeignKeyConstraints();
        $this->seed(\Database\Seeders\RolesAndPermissionsSeeder::class);
        \App\Models\SystemConfig::setVal('subscription_plans', [
            'tiers' => [
                'free' => [
                    'features' => ['cloud_sync' => true],
                    'limits' => ['stores' => -1, 'staff' => -1],
                ],
            ],
        ]);
        $this->withoutMiddleware();
        \Illuminate\Support\Facades\Schema::enableForeignKeyConstraints();
    }

    /** The push validation rejects a wholly empty `changes` array outright
     * ("The changes field is required") - a single harmless categories
     * INSERT keeps every test's push a genuine, minimal, valid request. */
    private function push(User $owner): \Illuminate\Testing\TestResponse
    {
        return $this->actingAs($owner)->postJson('/api/v1/app/sync/push', [
            'setup' => true,
            'changes' => [[
                'table_name' => 'categories',
                'operation' => 'INSERT',
                'record_id' => (string) \Illuminate\Support\Str::uuid(),
                'payload' => ['name' => 'Seeding Probe ' . uniqid()],
            ]],
        ]);
    }

    private function makeStore(): Store
    {
        $owner = User::create([
            'first_name' => 'Owner', 'last_name' => 'Seed',
            'email' => 'owner-pgseed-' . uniqid() . '@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        return Store::create([
            'user_id' => $owner->id,
            'name' => 'Store PG Seed',
            'email' => 'store-pgseed-' . uniqid() . '@dumosrx.com',
            'phone' => '1234567890',
            'address' => '123 Test St',
            'store_slug' => 'store-pgseed-' . uniqid(),
            'device_id' => 'WEB-PGSEED-' . uniqid(),
        ]);
    }

    public function test_a_sync_push_lazily_seeds_the_5_default_groups_server_side(): void
    {
        $store = $this->makeStore();
        $owner = User::where('id', $store->user_id)->first();

        $this->assertSame(0, PermissionGroup::where('store_id', $store->id)->count());

        $response = $this->push($owner);

        $response->assertStatus(200);
        $groups = PermissionGroup::where('store_id', $store->id)->get();
        $this->assertCount(5, $groups);
        $this->assertEqualsCanonicalizing(
            ['admin', 'manager', 'specialist', 'sales_staff', 'auditor'],
            $groups->pluck('based_on_role')->all(),
        );
        $this->assertTrue($groups->every(fn ($g) => (bool) $g->is_default));
        $this->assertNotNull($store->fresh()->permission_groups_seeded_at);
    }

    public function test_server_side_seeding_uses_the_same_deterministic_ids_the_client_uses(): void
    {
        $store = $this->makeStore();
        $owner = User::where('id', $store->user_id)->first();

        $this->push($owner);

        // Independently computed via the client's deterministicDefaultGroupId(storeId, role)
        // for this exact store id - if this drifts, a client and a server that seed the
        // same store independently (the whole reason for determinism) would collide/duplicate
        // instead of collapsing into one row per role.
        $managerGroup = PermissionGroup::where('store_id', $store->id)->where('based_on_role', 'manager')->first();
        $expectedId = \App\Services\PermissionGroupSeeder::deterministicDefaultGroupId($store->id, 'manager');
        $this->assertSame($expectedId, $managerGroup->id);
    }

    public function test_seeding_is_a_no_op_the_second_time_for_the_same_store(): void
    {
        $store = $this->makeStore();
        $owner = User::where('id', $store->user_id)->first();

        $this->push($owner);
        $this->push($owner);

        $this->assertSame(5, PermissionGroup::where('store_id', $store->id)->count());
    }

    public function test_does_not_reseed_a_store_that_deliberately_deleted_its_default_groups(): void
    {
        $store = $this->makeStore();
        $owner = User::where('id', $store->user_id)->first();

        $this->push($owner);
        PermissionGroup::where('store_id', $store->id)->delete();

        $this->push($owner);

        $this->assertSame(0, PermissionGroup::where('store_id', $store->id)->count());
    }

    public function test_backfills_existing_staff_to_the_default_group_matching_their_role(): void
    {
        $store = $this->makeStore();
        $owner = User::where('id', $store->user_id)->first();
        $manager = User::create([
            'first_name' => 'Mgr', 'last_name' => 'Seed',
            'email' => 'mgr-pgseed-' . uniqid() . '@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'manager', 'store_id' => $store->id,
        ]);

        $this->push($owner);

        $managerGroup = PermissionGroup::where('store_id', $store->id)->where('based_on_role', 'manager')->first();
        $this->assertSame($managerGroup->id, $manager->fresh()->permission_group_id);
    }
}
