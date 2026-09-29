<?php

namespace Tests\Feature\Admin;

use App\Models\Sale;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Covers the two destructive store actions: DELETE /admin/stores/{id}
 * (archive, reversible) and DELETE /admin/stores/{id}/purge (permanent,
 * gated behind the typed confirmation phrase).
 */
class AdminStoreDeletionTest extends TestCase
{
    use RefreshDatabase;

    protected User $superAdmin;

    protected User $platformAdmin;

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

        $this->platformAdmin = User::create([
            'first_name' => 'Platform', 'last_name' => 'Admin',
            'email' => 'platform@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'platform_admin',
        ]);

        $this->owner = User::create([
            'first_name' => 'Ada', 'last_name' => 'Owner',
            'email' => 'ada@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $this->store = Store::create([
            'user_id' => $this->owner->id,
            'name' => 'Duplicate Test Store',
            'device_id' => 'DEV-PURGE-001',
            'status' => 'Active',
        ]);

        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);
    }

    #[Test]
    public function archiving_a_store_soft_deletes_it_and_hides_it_from_the_fleet_list()
    {
        $response = $this->actingAs($this->superAdmin)
            ->deleteJson('/api/v1/admin/stores/'.$this->store->id, ['reason' => 'Created twice by mistake']);

        $response->assertStatus(200);

        $this->assertSoftDeleted('stores', ['id' => $this->store->id]);

        $list = $this->actingAs($this->superAdmin)->getJson('/api/v1/admin/stores');
        $this->assertSame([], collect($list->json('data'))->pluck('id')->all());
    }

    #[Test]
    public function archived_stores_are_listed_when_explicitly_requested()
    {
        $this->actingAs($this->superAdmin)->deleteJson('/api/v1/admin/stores/'.$this->store->id);

        $list = $this->actingAs($this->superAdmin)->getJson('/api/v1/admin/stores?archived=only');

        $list->assertStatus(200);
        $this->assertSame([$this->store->id], collect($list->json('data'))->pluck('id')->all());
        $this->assertTrue($list->json('data.0.is_archived'));
    }

    #[Test]
    public function an_archived_store_can_be_restored()
    {
        $this->actingAs($this->superAdmin)->deleteJson('/api/v1/admin/stores/'.$this->store->id);

        $response = $this->actingAs($this->superAdmin)
            ->postJson('/api/v1/admin/stores/'.$this->store->id.'/restore');

        $response->assertStatus(200);
        $this->assertNotSoftDeleted('stores', ['id' => $this->store->id]);
        $this->assertDatabaseHas('stores', ['id' => $this->store->id, 'deletion_reason' => null]);
    }

    #[Test]
    public function purging_requires_the_typed_confirmation_phrase()
    {
        $wrong = $this->actingAs($this->superAdmin)
            ->deleteJson('/api/v1/admin/stores/'.$this->store->id.'/purge', ['confirmation' => 'dumosrx']);

        $wrong->assertStatus(422);

        $missing = $this->actingAs($this->superAdmin)
            ->deleteJson('/api/v1/admin/stores/'.$this->store->id.'/purge');

        $missing->assertStatus(422);

        $this->assertDatabaseHas('stores', ['id' => $this->store->id]);
    }

    #[Test]
    public function purging_removes_the_store_its_staff_and_its_scoped_records()
    {
        $staff = User::create([
            'first_name' => 'Sales', 'last_name' => 'Staff',
            'email' => 'staff@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'sales_staff', 'store_id' => $this->store->id,
        ]);

        $sale = Sale::create([
            'transaction_number' => 'TXN-'.uniqid(),
            'cashier_id' => $staff->id,
            'subtotal' => 1000,
            'total_amount' => 1000,
            'payment_method' => 'cash',
            'payment_status' => 'completed',
            'amount_paid' => 1000,
        ]);
        DB::table('sales')->where('id', $sale->id)->update(['store_id' => $this->store->id]);

        DB::table('customers')->insert([
            'id' => (string) \Illuminate\Support\Str::uuid(),
            'first_name' => 'Walk',
            'last_name' => 'In',
            'store_id' => $this->store->id,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $response = $this->actingAs($this->superAdmin)
            ->deleteJson('/api/v1/admin/stores/'.$this->store->id.'/purge', ['confirmation' => 'DumosRx']);

        $response->assertStatus(200);

        $this->assertDatabaseMissing('stores', ['id' => $this->store->id]);
        $this->assertDatabaseMissing('sales', ['id' => $sale->id]);
        $this->assertDatabaseMissing('customers', ['store_id' => $this->store->id]);
        $this->assertDatabaseMissing('users', ['id' => $staff->id]);
        $this->assertDatabaseMissing('users', ['id' => $this->owner->id]);
    }

    #[Test]
    public function purging_keeps_an_owner_who_still_has_another_store()
    {
        Store::create([
            'user_id' => $this->owner->id,
            'name' => 'The Real Store',
            'device_id' => 'DEV-KEEP-002',
        ]);

        $this->actingAs($this->superAdmin)
            ->deleteJson('/api/v1/admin/stores/'.$this->store->id.'/purge', ['confirmation' => 'DumosRx'])
            ->assertStatus(200);

        $this->assertDatabaseHas('users', ['id' => $this->owner->id]);
    }

    #[Test]
    public function an_already_archived_store_can_still_be_purged()
    {
        $this->actingAs($this->superAdmin)->deleteJson('/api/v1/admin/stores/'.$this->store->id);

        $this->actingAs($this->superAdmin)
            ->deleteJson('/api/v1/admin/stores/'.$this->store->id.'/purge', ['confirmation' => 'DumosRx'])
            ->assertStatus(200);

        $this->assertDatabaseMissing('stores', ['id' => $this->store->id]);
    }

    #[Test]
    public function every_deletion_route_is_closed_to_non_super_admin_accounts()
    {
        $this->actingAs($this->platformAdmin)
            ->deleteJson('/api/v1/admin/stores/'.$this->store->id)
            ->assertStatus(403);

        $this->actingAs($this->platformAdmin)
            ->postJson('/api/v1/admin/stores/'.$this->store->id.'/restore')
            ->assertStatus(403);

        $this->actingAs($this->platformAdmin)
            ->deleteJson('/api/v1/admin/stores/'.$this->store->id.'/purge', ['confirmation' => 'DumosRx'])
            ->assertStatus(403);

        $this->actingAs($this->owner)
            ->deleteJson('/api/v1/admin/stores/'.$this->store->id.'/purge', ['confirmation' => 'DumosRx'])
            ->assertStatus(403);

        $this->assertDatabaseHas('stores', ['id' => $this->store->id]);
    }

    #[Test]
    public function archiving_a_store_that_does_not_exist_404s()
    {
        $this->actingAs($this->superAdmin)
            ->deleteJson('/api/v1/admin/stores/00000000-0000-0000-0000-000000000000')
            ->assertStatus(404);
    }
}
