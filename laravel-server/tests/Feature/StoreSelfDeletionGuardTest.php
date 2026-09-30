<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * A-84: `DELETE /stores/{id}` soft-deletes, and CheckAccountStatus refuses
 * every request for an archived store — so removing your only store used to
 * brick the account with no self-service way back, under a message blaming
 * an administrator who never touched it.
 */
class StoreSelfDeletionGuardTest extends TestCase
{
    use RefreshDatabase;

    protected User $owner;

    protected Store $store;

    protected function setUp(): void
    {
        parent::setUp();

        $this->owner = User::create([
            'first_name' => 'Solo', 'last_name' => 'Owner',
            'email' => 'solo-owner@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner', 'email_verified_at' => now(),
        ]);

        $this->store = Store::create([
            'user_id' => $this->owner->id,
            'name' => 'Only Branch', 'device_id' => 'DEV-SOLO-1', 'status' => 'Active',
        ]);

        \Illuminate\Support\Facades\DB::table('users')
            ->where('id', $this->owner->id)->update(['is_active' => true]);
        $this->owner->refresh();

        $this->withoutMiddleware([
            \App\Http\Middleware\CheckPermission::class,
            \App\Http\Middleware\CheckSubscription::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);
    }

    #[Test]
    public function deleting_the_only_store_is_refused_with_a_conflict()
    {
        $this->actingAs($this->owner)
            ->deleteJson("/api/v1/stores/{$this->store->id}")
            ->assertStatus(409);

        $this->assertNull($this->store->fresh()->deleted_at);
    }

    #[Test]
    public function the_refusal_does_not_deactivate_the_stores_staff()
    {
        $staff = User::create([
            'first_name' => 'Till', 'last_name' => 'Staff',
            'email' => 'solo-staff@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'sales_staff', 'store_id' => $this->store->id,
        ]);

        $this->actingAs($this->owner)->deleteJson("/api/v1/stores/{$this->store->id}");

        $this->assertTrue((bool) $staff->fresh()->is_active);
    }

    #[Test]
    public function the_owner_can_still_use_the_api_after_the_refusal()
    {
        $this->actingAs($this->owner)->deleteJson("/api/v1/stores/{$this->store->id}");

        $this->actingAs($this->owner)->getJson('/api/v1/user')->assertStatus(200);
    }

    #[Test]
    public function deleting_one_of_several_stores_still_works_and_records_the_actor()
    {
        $second = Store::create([
            'user_id' => $this->owner->id,
            'name' => 'Second Branch', 'device_id' => 'DEV-SOLO-2', 'status' => 'Active',
        ]);

        $this->actingAs($this->owner)
            ->deleteJson("/api/v1/stores/{$second->id}")
            ->assertStatus(200);

        $archived = Store::withTrashed()->find($second->id);
        $this->assertNotNull($archived->deleted_at);
        $this->assertSame($this->owner->id, $archived->deleted_by_id);
        $this->assertNotNull($archived->deletion_reason);
    }

    #[Test]
    public function a_self_archived_store_is_403d_with_a_reason_that_does_not_blame_an_administrator()
    {
        $second = Store::create([
            'user_id' => $this->owner->id,
            'name' => 'Second Branch', 'device_id' => 'DEV-SOLO-3', 'status' => 'Active',
        ]);

        $this->actingAs($this->owner)->deleteJson("/api/v1/stores/{$second->id}");

        $response = $this->actingAs($this->owner)
            ->getJson('/api/v1/user', ['X-Store-Id' => $second->id]);

        $response->assertStatus(403)->assertJsonPath('message', 'STORE_ARCHIVED');
        $this->assertSame('owner', $response->json('archived_by'));
        $this->assertStringNotContainsStringIgnoringCase('administrator', $response->json('reason'));
    }

    #[Test]
    public function an_admin_archived_store_still_names_the_administrator()
    {
        $superAdmin = User::create([
            'first_name' => 'Super', 'last_name' => 'Admin',
            'email' => 'solo-super@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'super_admin',
        ]);

        app(\App\Services\Admin\AdminStoreDeletionService::class)
            ->archiveStore($this->store->id, 'Fraud', $superAdmin);

        $response = $this->actingAs($this->owner)->getJson('/api/v1/user');

        $response->assertStatus(403)->assertJsonPath('message', 'STORE_ARCHIVED');
        $this->assertSame('administrator', $response->json('archived_by'));
        $this->assertStringContainsStringIgnoringCase('administrator', $response->json('reason'));
    }
}
