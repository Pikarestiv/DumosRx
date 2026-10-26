<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\SystemConfig;
use App\Models\User;
use App\Services\Admin\AdminStoreService;
use App\Services\Admin\AdminStoreStorefrontService;
use App\Services\Admin\AdminUserService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** A-278: a server-side model save of a client-pushable column must move `_version`, or a stale push writes the old value back. */
class ServerModelSaveVersionBumpTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private Store $store;

    private User $staff;

    protected function setUp(): void
    {
        parent::setUp();

        Schema::disableForeignKeyConstraints();
        $this->seed(\Database\Seeders\RolesAndPermissionsSeeder::class);

        $this->owner = User::create([
            'first_name' => 'Owner', 'last_name' => 'A278', 'email' => 'owner-a278@dumosrx.test',
            'password' => bcrypt('password'), 'role' => 'store_owner', 'email_verified_at' => now(),
        ]);
        $this->store = Store::create([
            'user_id' => $this->owner->id, 'name' => 'Main Branch', 'store_slug' => 'main-branch-a278',
            'device_id' => 'DRX-A278', 'currency' => 'NGN', 'status' => 'Active', 'online_store_enabled' => true,
        ]);
        $this->staff = User::create([
            'first_name' => 'Till', 'last_name' => 'Staff', 'email' => 'staff-a278@dumosrx.test',
            'password' => bcrypt('password'), 'role' => 'sales_staff', 'store_id' => $this->store->id,
        ]);
        SystemConfig::setVal('subscription_plans', [
            'tiers' => ['free' => ['features' => ['cloud_sync' => true, 'online_store' => true], 'limits' => ['staff' => -1, 'stores' => -1]]],
        ]);
        $this->withoutMiddleware();
        $this->actingAs($this->owner);
    }

    private function version(string $table, string $id): int
    {
        return (int) DB::table($table)->where('id', $id)->value('_version');
    }

    private function pushStale(string $table, string $id, array $payload, int $version)
    {
        return $this->actingAs($this->owner)->postJson('/api/v1/app/sync/push', [
            'setup' => true,
            'changes' => [[
                'table_name' => $table, 'operation' => 'UPDATE', 'record_id' => $id,
                'payload' => ['id' => $id, '_version' => $version, '_synced' => 0, 'updated_at' => now()->toDateTimeString()] + $payload,
            ]],
        ]);
    }

    public function test_an_admin_deactivation_cannot_be_undone_by_a_stale_push(): void
    {
        $held = $this->version('users', $this->staff->id);

        app(AdminUserService::class)->deactivateUser($this->staff->id);
        $this->assertSame($held + 1, $this->version('users', $this->staff->id));

        $this->pushStale('users', $this->staff->id, ['is_active' => 1], $held)
            ->assertStatus(200)
            ->assertJsonPath('failed.0.reason', 'version_conflict');

        $this->assertSame(0, (int) DB::table('users')->where('id', $this->staff->id)->value('is_active'));
    }

    public function test_an_admin_reactivation_moves_the_version(): void
    {
        DB::table('users')->where('id', $this->staff->id)->update(['is_active' => false]);
        $held = $this->version('users', $this->staff->id);

        app(AdminUserService::class)->reactivateUser($this->staff->id);

        $this->assertSame($held + 1, $this->version('users', $this->staff->id));
    }

    public function test_a_save_that_changed_nothing_does_not_move_the_version(): void
    {
        DB::table('users')->where('id', $this->staff->id)->update(['is_active' => false]);
        $held = $this->version('users', $this->staff->id);

        app(AdminUserService::class)->deactivateUser($this->staff->id);

        $this->assertSame($held, $this->version('users', $this->staff->id));
    }

    public function test_deactivating_through_the_staff_edit_moves_the_version_and_a_stale_push_cannot_undo_it(): void
    {
        $held = $this->version('users', $this->staff->id);

        $this->actingAs($this->owner)->putJson("/api/v1/staff/{$this->staff->id}", ['is_active' => false])->assertStatus(200);
        $this->assertSame($held + 1, $this->version('users', $this->staff->id));
        $this->pushStale('users', $this->staff->id, ['is_active' => 1], $held)->assertStatus(200);

        $this->assertSame(0, (int) DB::table('users')->where('id', $this->staff->id)->value('is_active'));
    }

    public function test_suspending_a_store_moves_its_owners_version(): void
    {
        $held = $this->version('users', $this->owner->id);

        app(AdminStoreService::class)->suspendStore($this->store->id);

        $this->assertSame($held + 1, $this->version('users', $this->owner->id));
    }

    public function test_an_admin_unpublish_cannot_be_undone_by_a_stale_business_info_save(): void
    {
        $held = $this->version('stores', $this->store->id);

        app(AdminStoreStorefrontService::class)->setEnabled($this->store->id, false);
        $this->pushStale('stores', $this->store->id, ['name' => 'Main Branch', 'online_store_enabled' => 1], $held)->assertStatus(200);

        $this->assertSame(0, (int) DB::table('stores')->where('id', $this->store->id)->value('online_store_enabled'));
    }

    public function test_an_admin_profile_edit_moves_the_version(): void
    {
        $held = $this->version('users', $this->staff->id);

        app(AdminUserService::class)->updateUserProfile($this->staff->id, ['first_name' => 'Renamed'], $this->owner->id);

        $this->assertSame($held + 1, $this->version('users', $this->staff->id));
    }

    public function test_the_web_store_edit_moves_the_version(): void
    {
        $held = $this->version('stores', $this->store->id);

        $this->actingAs($this->owner)->putJson("/api/v1/stores/{$this->store->id}", ['name' => 'Renamed Branch'])->assertStatus(200);

        $this->assertSame($held + 1, $this->version('stores', $this->store->id));
    }

    public function test_the_own_profile_edit_moves_the_version(): void
    {
        $held = $this->version('users', $this->owner->id);

        $this->actingAs($this->owner)->postJson('/api/v1/profile/update', ['first_name' => 'Renamed', 'last_name' => 'Owner'])->assertStatus(200);

        $this->assertSame($held + 1, $this->version('users', $this->owner->id));
    }
}
