<?php

namespace Tests\Feature\Admin;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Coverage for AdminController::suspendStore/unsuspendStore/markStoreDemo/
 * unmarkStoreDemo, whose AdminService internals were consolidated into two
 * shared toggleStoreSuspension()/toggleStoreDemo() private helpers.
 */
class AdminStoreToggleTest extends TestCase
{
    use RefreshDatabase;

    protected User $superAdmin;
    protected User $owner;
    protected Store $store;

    protected function setUp(): void
    {
        parent::setUp();

        $this->superAdmin = User::create([
            'first_name' => 'Super', 'last_name' => 'Admin',
            'email' => 'super@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'super_admin',
        ]);

        $this->owner = User::create([
            'first_name' => 'Store', 'last_name' => 'Owner',
            'email' => 'owner@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner', 'is_active' => true,
        ]);

        $this->store = Store::create([
            'user_id' => $this->owner->id,
            'name' => 'Test Pharmacy',
            'device_id' => 'TEST-'.uniqid(),
            'status' => 'Active',
        ]);

        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);
    }

    public function test_suspend_store_sets_status_reason_and_deactivates_owner()
    {
        $response = $this->actingAs($this->superAdmin)
            ->postJson("/api/v1/admin/stores/{$this->store->id}/suspend", [
                'reason' => 'Terms violation',
            ]);

        $response->assertStatus(200);
        $this->store->refresh();
        $this->assertSame('Suspended', $this->store->status);
        $this->assertSame('Terms violation', $this->store->suspension_reason);
        $this->assertFalse($this->owner->fresh()->is_active);
        $this->assertDatabaseHas('activity_logs', [
            'action' => 'ACCOUNT_SUSPENSION',
            'description' => "Suspended store account: Test Pharmacy ({$this->store->id}). Reason: Terms violation",
        ]);
    }

    public function test_suspend_store_falls_back_to_a_default_reason_when_none_given()
    {
        $response = $this->actingAs($this->superAdmin)
            ->postJson("/api/v1/admin/stores/{$this->store->id}/suspend");

        $response->assertStatus(200);
        $this->store->refresh();
        $this->assertStringContainsString('violating our terms of usage', $this->store->suspension_reason);
        $this->assertDatabaseHas('activity_logs', [
            'action' => 'ACCOUNT_SUSPENSION',
            'description' => "Suspended store account: Test Pharmacy ({$this->store->id}). Reason: N/A",
        ]);
    }

    public function test_unsuspend_store_clears_status_and_reactivates_owner()
    {
        $this->store->update(['status' => 'Suspended', 'suspension_reason' => 'Terms violation']);
        $this->owner->update(['is_active' => false]);

        $response = $this->actingAs($this->superAdmin)
            ->postJson("/api/v1/admin/stores/{$this->store->id}/unsuspend");

        $response->assertStatus(200);
        $this->store->refresh();
        $this->assertSame('Active', $this->store->status);
        $this->assertNull($this->store->suspension_reason);
        $this->assertTrue($this->owner->fresh()->is_active);
        $this->assertDatabaseHas('activity_logs', [
            'action' => 'ACCOUNT_UNSUSPENSION',
            'description' => "Unsuspended store account: Test Pharmacy ({$this->store->id})",
        ]);
    }

    public function test_mark_store_demo_sets_the_flag()
    {
        $response = $this->actingAs($this->superAdmin)
            ->postJson("/api/v1/admin/stores/{$this->store->id}/mark-demo");

        $response->assertStatus(200);
        $this->assertTrue($this->store->fresh()->is_demo);
        $this->assertDatabaseHas('activity_logs', [
            'action' => 'STORE_MARKED_DEMO',
            'description' => "Marked store account as demo: Test Pharmacy ({$this->store->id})",
        ]);
    }

    public function test_unmark_store_demo_clears_the_flag()
    {
        $this->store->update(['is_demo' => true]);

        $response = $this->actingAs($this->superAdmin)
            ->postJson("/api/v1/admin/stores/{$this->store->id}/unmark-demo");

        $response->assertStatus(200);
        $this->assertFalse($this->store->fresh()->is_demo);
        $this->assertDatabaseHas('activity_logs', [
            'action' => 'STORE_UNMARKED_DEMO',
            'description' => "Unmarked store account as demo: Test Pharmacy ({$this->store->id})",
        ]);
    }

    public function test_non_super_admin_cannot_toggle_store_state()
    {
        $response = $this->actingAs($this->owner)
            ->postJson("/api/v1/admin/stores/{$this->store->id}/suspend");

        $response->assertStatus(403);
        $this->assertSame('Active', $this->store->fresh()->status);
    }
}
