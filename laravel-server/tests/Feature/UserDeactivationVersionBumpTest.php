<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\SystemConfig;
use App\Models\User;
use App\Services\PermissionGroupSeeder;
use App\Services\SubscriptionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * A-277. Rationale in laravel-server/AGENTS.md, "A raw update on a synced
 * table must move _version".
 */
class UserDeactivationVersionBumpTest extends TestCase
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
            'first_name' => 'Owner', 'last_name' => 'A277',
            'email' => 'owner-a277@dumosrx.test', 'password' => bcrypt('password'),
            'role' => 'store_owner', 'email_verified_at' => now(),
        ]);

        $this->store = Store::create([
            'user_id' => $this->owner->id, 'name' => 'Main Branch',
            'store_slug' => 'main-branch-a277', 'device_id' => 'DRX-A277', 'currency' => 'NGN',
            'status' => 'Active',
        ]);

        $this->staff = User::create([
            'first_name' => 'Till', 'last_name' => 'Staff',
            'email' => 'staff-a277@dumosrx.test', 'password' => bcrypt('password'),
            'role' => 'sales_staff', 'store_id' => $this->store->id,
        ]);

        SystemConfig::setVal('subscription_plans', [
            'tiers' => ['free' => [
                'features' => ['cloud_sync' => true],
                'limits' => ['staff' => 0, 'stores' => -1],
            ]],
        ]);

        $this->withoutMiddleware();
    }

    private function pushStaleActiveCopy(int $version)
    {
        return $this->actingAs($this->owner)->postJson('/api/v1/app/sync/push', [
            'setup' => true,
            'changes' => [[
                'table_name' => 'users',
                'operation' => 'UPDATE',
                'record_id' => $this->staff->id,
                'payload' => [
                    'id' => $this->staff->id,
                    'first_name' => 'Till',
                    'last_name' => 'Staff',
                    'is_active' => 1,
                    '_version' => $version,
                    '_synced' => 0,
                    'updated_at' => now()->toDateTimeString(),
                ],
            ]],
        ]);
    }

    #[Test]
    public function a_stale_equal_version_push_cannot_reactivate_a_staff_limit_deactivation()
    {
        $versionDeviceHolds = (int) $this->staff->refresh()->_version;

        app(SubscriptionService::class)->enforceStaffLimits($this->owner);
        $this->assertSame(0, (int) $this->staff->fresh()->is_active);

        $response = $this->pushStaleActiveCopy($versionDeviceHolds);
        $response->assertStatus(200);

        $this->assertSame(
            0,
            (int) DB::table('users')->where('id', $this->staff->id)->value('is_active'),
            'A device still holding the pre-deactivation version must not reactivate the account.',
        );
        $response->assertJsonCount(1, 'failed');
    }

    #[Test]
    public function the_staff_limit_sweep_moves_the_version_forward()
    {
        $before = (int) $this->staff->refresh()->_version;

        app(SubscriptionService::class)->enforceStaffLimits($this->owner);

        $this->assertSame($before + 1, (int) $this->staff->fresh()->_version);
    }

    #[Test]
    public function removing_a_store_moves_its_staffs_version_forward()
    {
        Store::create([
            'user_id' => $this->owner->id, 'name' => 'Second Branch',
            'store_slug' => 'second-branch-a277', 'device_id' => 'DRX-A277-2', 'currency' => 'NGN',
            'status' => 'Active',
        ]);
        $before = (int) $this->staff->refresh()->_version;

        $this->actingAs($this->owner)
            ->deleteJson("/api/v1/stores/{$this->store->id}")
            ->assertStatus(200);

        $this->assertSame(0, (int) $this->staff->fresh()->is_active);
        $this->assertSame($before + 1, (int) $this->staff->fresh()->_version);
    }

    #[Test]
    public function deactivating_staff_through_the_staff_route_moves_the_version_forward()
    {
        $before = (int) $this->staff->refresh()->_version;

        $this->actingAs($this->owner)
            ->deleteJson("/api/v1/staff/{$this->staff->id}")
            ->assertStatus(200);

        $this->assertSame(0, (int) $this->staff->fresh()->is_active);
        $this->assertSame($before + 1, (int) $this->staff->fresh()->_version);
    }

    #[Test]
    public function seeding_default_permission_groups_moves_the_regrouped_users_version_forward()
    {
        $this->assertNull($this->staff->refresh()->permission_group_id);
        $before = (int) $this->staff->_version;

        PermissionGroupSeeder::ensureSeeded($this->store->fresh());

        $this->assertNotNull($this->staff->fresh()->permission_group_id);
        $this->assertSame($before + 1, (int) $this->staff->fresh()->_version);
    }
}
