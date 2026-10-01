<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * A store owner whose own `users.store_id` is non-null (historical client
 * poisoning, see docs/FIXED_BUGS.md A-127) must still be authorized against
 * every store they actually own, not just the one that column names.
 */
class SyncMultiStoreOwnerScopeTest extends TestCase
{
    use RefreshDatabase;

    protected User $owner;
    protected Store $storeA;
    protected Store $storeB;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(\Database\Seeders\RolesAndPermissionsSeeder::class);

        $this->owner = User::create([
            'first_name' => 'Multi',
            'last_name' => 'Owner',
            'email' => 'multi-owner@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $this->storeA = Store::create([
            'user_id' => $this->owner->id,
            'name' => 'Store A',
            'store_slug' => 'multi-store-a',
            'device_id' => 'WEB-MULTI-A',
        ]);

        $this->storeB = Store::create([
            'user_id' => $this->owner->id,
            'name' => 'Store B',
            'store_slug' => 'multi-store-b',
            'device_id' => 'WEB-MULTI-B',
        ]);

        $this->owner->update(['store_id' => $this->storeA->id]);

        \App\Models\SystemConfig::setVal('subscription_plans', [
            'tiers' => [
                'free' => [
                    'features' => ['cloud_sync' => true],
                    'limits' => ['stores' => -1],
                ],
            ],
        ]);

        $this->withoutMiddleware();
    }

    #[Test]
    public function a_poisoned_owner_can_push_an_insert_scoped_to_their_other_store()
    {
        $response = $this->actingAs($this->owner)->postJson('/api/v1/app/sync/push', [
            'setup' => true,
            'changes' => [[
                'table_name' => 'products',
                'operation' => 'INSERT',
                'record_id' => 'prod-store-b',
                'payload' => [
                    'id' => 'prod-store-b',
                    'name' => 'Panadol',
                    'selling_price' => 100,
                    'store_id' => $this->storeB->id,
                    'is_active' => true,
                ],
            ]],
        ]);

        $response->assertStatus(200);
        $this->assertSame([], $response->json('failed') ?? []);
        $this->assertDatabaseHas('products', [
            'id' => 'prod-store-b',
            'store_id' => $this->storeB->id,
        ]);
    }

    #[Test]
    public function a_poisoned_owner_can_push_an_update_against_a_row_in_their_other_store()
    {
        $product = Product::create([
            'id' => 'prod-store-b-update',
            'name' => 'Vitamin C',
            'selling_price' => 50,
            'user_id' => $this->owner->id,
            'store_id' => $this->storeB->id,
            'is_active' => true,
        ]);

        $response = $this->actingAs($this->owner)->postJson('/api/v1/app/sync/push', [
            'setup' => true,
            'changes' => [[
                'table_name' => 'products',
                'operation' => 'UPDATE',
                'record_id' => $product->id,
                'payload' => [
                    'id' => $product->id,
                    'name' => 'Vitamin C Forte',
                    'store_id' => $this->storeB->id,
                ],
            ]],
        ]);

        $response->assertStatus(200);
        $this->assertSame([], $response->json('failed') ?? []);
        $this->assertSame('Vitamin C Forte', $product->refresh()->name);
    }

    #[Test]
    public function a_poisoned_owners_pull_includes_rows_from_their_other_store()
    {
        Product::create([
            'id' => 'prod-pull-store-b',
            'name' => 'Amoxicillin',
            'selling_price' => 300,
            'user_id' => $this->owner->id,
            'store_id' => $this->storeB->id,
            'is_active' => true,
        ]);

        $response = $this->actingAs($this->owner)->postJson('/api/v1/app/sync/pull', [
            'last_synced' => [],
        ]);

        $response->assertStatus(200);
        $ids = array_column($response->json('changes.products') ?? [], 'id');
        $this->assertContains('prod-pull-store-b', $ids);
    }

    #[Test]
    public function a_genuine_staff_account_is_still_narrowed_to_its_employer_store()
    {
        $staff = User::create([
            'first_name' => 'Staff',
            'last_name' => 'Member',
            'email' => 'staff-scope@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'sales_staff',
            'store_id' => $this->storeA->id,
        ]);

        Product::create([
            'id' => 'prod-staff-blocked',
            'name' => 'Ibuprofen',
            'selling_price' => 120,
            'user_id' => $this->owner->id,
            'store_id' => $this->storeB->id,
            'is_active' => true,
        ]);

        $response = $this->actingAs($staff)->postJson('/api/v1/app/sync/pull', [
            'last_synced' => [],
        ]);

        $response->assertStatus(200);
        $ids = array_column($response->json('changes.products') ?? [], 'id');
        $this->assertNotContains('prod-staff-blocked', $ids);

        $push = $this->actingAs($staff)->postJson('/api/v1/app/sync/push', [
            'setup' => true,
            'changes' => [[
                'table_name' => 'products',
                'operation' => 'INSERT',
                'record_id' => 'prod-staff-insert-b',
                'payload' => [
                    'id' => 'prod-staff-insert-b',
                    'name' => 'Cetirizine',
                    'selling_price' => 90,
                    'store_id' => $this->storeB->id,
                    'is_active' => true,
                ],
            ]],
        ]);

        $push->assertStatus(200);
        $this->assertNotEmpty($push->json('failed'));
        $this->assertDatabaseMissing('products', ['id' => 'prod-staff-insert-b']);
    }
}
