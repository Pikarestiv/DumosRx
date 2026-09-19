<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Regression test for a real vulnerability: SyncController::push()'s
 * UPDATE/DELETE handling looked a record up by id and applied the change
 * with no check that the record actually belonged to the caller's
 * store(s) — $currentStoreId was only ever used to BACK-FILL a missing
 * store_id, never to verify one. Any authenticated user could harvest a
 * competitor's product/customer/etc. id (e.g. off the unauthenticated
 * public storefront endpoint, which exposes real ids) and push a crafted
 * UPDATE or DELETE against it, mutating or soft-deleting a stranger's row.
 * See docs/KNOWN_BUGS.md.
 */
class SyncPushOwnershipTest extends TestCase
{
    use RefreshDatabase;

    protected User $victimOwner;
    protected Store $victimStore;
    protected User $attackerOwner;
    protected Store $attackerStore;

    protected function setUp(): void
    {
        parent::setUp();

        \Illuminate\Support\Facades\Schema::disableForeignKeyConstraints();

        $this->victimOwner = User::create([
            'first_name' => 'Victim',
            'last_name' => 'Owner',
            'email' => 'victim@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'admin',
        ]);
        $this->victimStore = Store::create([
            'user_id' => $this->victimOwner->id,
            'name' => 'Victim Store',
            'email' => 'victim-store@dumosrx.com',
            'phone' => '1111111111',
            'address' => '1 Victim St',
            'slug' => 'victim-store',
            'device_id' => 'WEB-VICTIM',
        ]);
        $this->victimOwner->update(['store_id' => $this->victimStore->id]);

        $this->attackerOwner = User::create([
            'first_name' => 'Attacker',
            'last_name' => 'Owner',
            'email' => 'attacker@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'admin',
        ]);
        $this->attackerStore = Store::create([
            'user_id' => $this->attackerOwner->id,
            'name' => 'Attacker Store',
            'email' => 'attacker-store@dumosrx.com',
            'phone' => '2222222222',
            'address' => '2 Attacker St',
            'slug' => 'attacker-store',
            'device_id' => 'WEB-ATTACKER',
        ]);
        $this->attackerOwner->update(['store_id' => $this->attackerStore->id]);

        \App\Models\SystemConfig::setVal('subscription_plans', [
            'tiers' => [
                'free' => [
                    'features' => ['cloud_sync' => true],
                    'limits' => ['stores' => -1],
                ],
            ],
        ]);

        $this->withoutMiddleware();

        \Illuminate\Support\Facades\Schema::enableForeignKeyConstraints();
    }

    public function test_update_against_another_stores_product_is_rejected_not_applied()
    {
        $productId = 'victim-product-1';
        DB::table('products')->insert([
            'id' => $productId,
            'store_id' => $this->victimStore->id,
            'user_id' => $this->victimOwner->id,
            'name' => 'Victim Painkillers',
            'selling_price' => 500,
            '_version' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $response = $this->actingAs($this->attackerOwner)->postJson('/api/v1/app/sync/push', [
            'setup' => true,
            'changes' => [
                [
                    'table_name' => 'products',
                    'operation' => 'UPDATE',
                    'record_id' => $productId,
                    'payload' => [
                        'id' => $productId,
                        'selling_price' => 1,
                        '_version' => 1,
                    ],
                ],
            ],
        ]);

        $response->assertStatus(200);
        $response->assertJsonCount(1, 'failed');
        $response->assertJsonPath('failed.0.reason', 'forbidden');

        $this->assertDatabaseHas('products', [
            'id' => $productId,
            'selling_price' => 500,
        ]);
    }

    public function test_delete_against_another_stores_customer_is_rejected_not_applied()
    {
        $customerId = 'victim-customer-1';
        DB::table('customers')->insert([
            'id' => $customerId,
            'store_id' => $this->victimStore->id,
            'user_id' => $this->victimOwner->id,
            'first_name' => 'Victim',
            'last_name' => 'Customer',
            '_version' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $response = $this->actingAs($this->attackerOwner)->postJson('/api/v1/app/sync/push', [
            'setup' => true,
            'changes' => [
                [
                    'table_name' => 'customers',
                    'operation' => 'DELETE',
                    'record_id' => $customerId,
                    'payload' => ['id' => $customerId],
                ],
            ],
        ]);

        $response->assertStatus(200);
        $response->assertJsonCount(1, 'failed');
        $response->assertJsonPath('failed.0.reason', 'forbidden');

        $this->assertDatabaseHas('customers', ['id' => $customerId]);
        $this->assertNull(DB::table('customers')->where('id', $customerId)->value('deleted_at'));
    }

    public function test_insert_with_explicit_store_id_outside_callers_stores_is_rejected()
    {
        $response = $this->actingAs($this->attackerOwner)->postJson('/api/v1/app/sync/push', [
            'setup' => true,
            'changes' => [
                [
                    'table_name' => 'products',
                    'operation' => 'INSERT',
                    'record_id' => 'planted-product-1',
                    'payload' => [
                        'id' => 'planted-product-1',
                        'store_id' => $this->victimStore->id,
                        'name' => 'Planted Product',
                        'selling_price' => 1,
                        '_version' => 1,
                    ],
                ],
            ],
        ]);

        $response->assertStatus(200);
        $response->assertJsonCount(1, 'failed');
        $this->assertDatabaseMissing('products', ['id' => 'planted-product-1']);
    }

    public function test_owner_can_still_update_their_own_stores_product()
    {
        $productId = 'own-product-1';
        DB::table('products')->insert([
            'id' => $productId,
            'store_id' => $this->attackerStore->id,
            'user_id' => $this->attackerOwner->id,
            'name' => 'Own Product',
            'selling_price' => 500,
            '_version' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $response = $this->actingAs($this->attackerOwner)->postJson('/api/v1/app/sync/push', [
            'setup' => true,
            'changes' => [
                [
                    'table_name' => 'products',
                    'operation' => 'UPDATE',
                    'record_id' => $productId,
                    'payload' => [
                        'id' => $productId,
                        'selling_price' => 750,
                        '_version' => 1,
                    ],
                ],
            ],
        ]);

        $response->assertStatus(200);
        $response->assertJsonCount(0, 'failed');
        $this->assertDatabaseHas('products', [
            'id' => $productId,
            'selling_price' => 750,
        ]);
    }
}
