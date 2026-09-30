<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * A-85: deactivating the tenant owner (or yourself) through the staff
 * endpoints is terminal — nobody inside the tenant can undo it, because
 * reactivation needs an authenticated session in that same tenant. Both
 * `DELETE /staff/{id}` and `is_active: false` on `PUT /staff/{id}` must
 * refuse those two targets.
 */
class StaffSelfLockoutGuardTest extends TestCase
{
    use RefreshDatabase;

    protected User $owner;

    protected User $manager;

    protected User $cashier;

    protected Store $store;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(\Database\Seeders\RolesAndPermissionsSeeder::class);

        $this->owner = User::create([
            'first_name' => 'Tenant', 'last_name' => 'Owner',
            'email' => 'lockout-owner@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $this->store = Store::create([
            'user_id' => $this->owner->id,
            'name' => 'Lockout Pharmacy', 'device_id' => 'DEV-LOCKOUT',
        ]);

        $this->manager = User::create([
            'first_name' => 'Middle', 'last_name' => 'Manager',
            'email' => 'lockout-manager@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'admin', 'store_id' => $this->store->id,
        ]);

        $this->cashier = User::create([
            'first_name' => 'Till', 'last_name' => 'Cashier',
            'email' => 'lockout-cashier@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'sales_staff', 'store_id' => $this->store->id,
        ]);

        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
            \App\Http\Middleware\CheckPermission::class,
            \App\Http\Middleware\CheckSubscription::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);
    }

    #[Test]
    public function a_subordinate_cannot_deactivate_the_tenant_owner()
    {
        $this->actingAs($this->manager)
            ->deleteJson("/api/v1/staff/{$this->owner->id}")
            ->assertStatus(422);

        $this->assertTrue((bool) $this->owner->fresh()->is_active);
    }

    #[Test]
    public function a_subordinate_cannot_deactivate_the_owner_through_update()
    {
        $this->actingAs($this->manager)
            ->putJson("/api/v1/staff/{$this->owner->id}", ['is_active' => false])
            ->assertStatus(422);

        $this->assertTrue((bool) $this->owner->fresh()->is_active);
    }

    #[Test]
    public function the_owner_cannot_deactivate_their_own_account()
    {
        $this->actingAs($this->owner)
            ->deleteJson("/api/v1/staff/{$this->owner->id}")
            ->assertStatus(422);

        $this->actingAs($this->owner)
            ->putJson("/api/v1/staff/{$this->owner->id}", ['is_active' => false])
            ->assertStatus(422);

        $this->assertTrue((bool) $this->owner->fresh()->is_active);
    }

    #[Test]
    public function a_staff_member_cannot_deactivate_themselves()
    {
        $this->actingAs($this->manager)
            ->deleteJson("/api/v1/staff/{$this->manager->id}")
            ->assertStatus(422);

        $this->assertTrue((bool) $this->manager->fresh()->is_active);
    }

    #[Test]
    public function deactivating_an_ordinary_staff_member_still_works()
    {
        $this->actingAs($this->owner)
            ->deleteJson("/api/v1/staff/{$this->cashier->id}")
            ->assertStatus(200);

        $this->assertFalse((bool) $this->cashier->fresh()->is_active);
    }

    #[Test]
    public function editing_other_fields_on_the_owners_own_row_still_works()
    {
        $this->actingAs($this->owner)
            ->putJson("/api/v1/staff/{$this->owner->id}", ['first_name' => 'Renamed', 'is_active' => true])
            ->assertStatus(200);

        $this->assertSame('Renamed', $this->owner->fresh()->first_name);
    }

    #[Test]
    public function a_super_admin_cannot_deactivate_their_own_account_through_the_admin_endpoint()
    {
        $superAdmin = User::create([
            'first_name' => 'Super', 'last_name' => 'Admin',
            'email' => 'lockout-super@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'super_admin',
        ]);

        $this->actingAs($superAdmin)
            ->postJson("/api/v1/admin/users/{$superAdmin->id}/deactivate")
            ->assertStatus(422);

        $this->assertTrue((bool) $superAdmin->fresh()->is_active);
    }

    #[Test]
    public function a_super_admin_can_still_deactivate_someone_else()
    {
        $superAdmin = User::create([
            'first_name' => 'Super', 'last_name' => 'Admin',
            'email' => 'lockout-super2@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'super_admin',
        ]);

        $this->actingAs($superAdmin)
            ->postJson("/api/v1/admin/users/{$this->cashier->id}/deactivate")
            ->assertStatus(200);

        $this->assertFalse((bool) $this->cashier->fresh()->is_active);
    }
}
