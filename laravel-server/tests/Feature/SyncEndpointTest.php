<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class SyncEndpointTest extends TestCase
{
    use RefreshDatabase;

    protected User $user;
    protected Store $store;

    protected function setUp(): void
    {
        parent::setUp();

        \Illuminate\Support\Facades\Schema::disableForeignKeyConstraints();

        $this->user = User::create([
            'first_name' => 'Admin',
            'last_name' => 'User',
            'email' => 'admin@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'admin',
        ]);

        $this->store = Store::create([
            'user_id' => $this->user->id,
            'name' => 'Test Store',
            'email' => 'store@dumosrx.com',
            'phone' => '1234567890',
            'address' => '123 Test St',
            'slug' => 'test-store',
            'device_id' => 'WEB-TEST',
        ]);

        $this->user->update(['store_id' => $this->store->id]);
        
        \App\Models\SystemConfig::setVal('subscription_plans', [
            'tiers' => [
                'free' => [
                    'features' => ['cloud_sync' => true],
                    'limits' => ['stores' => -1]
                ]
            ]
        ]);

        $this->withoutMiddleware();

        \Illuminate\Support\Facades\Schema::enableForeignKeyConstraints();
    }

    public function test_push_sync_handles_inserts()
    {
        $payload = [
            'setup' => true,
            'changes' => [
                [
                    'table_name' => 'products',
                    'operation' => 'INSERT',
                    'record_id' => 'prod_123',
                    'payload' => [
                        'id' => 'prod_123',
                        'name' => 'Paracetamol',
                        'is_active' => true,
                    ]
                ]
            ]
        ];

        $response = $this->actingAs($this->user)->postJson('/api/v1/app/sync/push', $payload);

        if ($response->status() !== 200) {
            dump($response->json());
        }
        $response->assertStatus(200);
        $response->assertJson(['success' => true]);

        $this->assertDatabaseHas('products', [
            'id' => 'prod_123',
            'name' => 'Paracetamol',
            'user_id' => $this->user->id,
        ]);
    }

    public function test_push_sync_handles_updates()
    {
        // First create a product
        $productId = 'prod_456';
        DB::table('products')->insert([
            'id' => $productId,
            'user_id' => $this->user->id,
            'name' => 'Aspirin',
            '_version' => 1,
            'created_at' => now(),
            'updated_at' => now()
        ]);

        $payload = [
            'setup' => true,
            'changes' => [
                [
                    'table_name' => 'products',
                    'operation' => 'UPDATE',
                    'record_id' => $productId,
                    'payload' => [
                        'id' => $productId,
                        'name' => 'Aspirin Forte', // Changed
                        '_version' => 2,
                    ]
                ]
            ]
        ];

        $response = $this->actingAs($this->user)->postJson('/api/v1/app/sync/push', $payload);

        $response->assertStatus(200);
        $response->assertJson(['success' => true]);

        $this->assertDatabaseHas('products', [
            'id' => $productId,
            'name' => 'Aspirin Forte',
            'user_id' => $this->user->id,
        ]);

        // Assert _version was incremented
        $product = DB::table('products')->where('id', $productId)->first();
        $this->assertGreaterThan(1, $product->_version);
    }

    public function test_push_sync_handles_conflict_resolution()
    {
        // Double edit scenario: Online has newer data than incoming offline sync
        $productId = 'prod_conflict';
        DB::table('products')->insert([
            'id' => $productId,
            'user_id' => $this->user->id,
            'name' => 'Online Newer Aspirin',
            '_version' => 3,
            'created_at' => now()->subDays(2),
            'updated_at' => now() // Just updated online
        ]);

        $payload = [
            'setup' => true,
            'changes' => [
                [
                    'table_name' => 'products',
                    'operation' => 'UPDATE',
                    'record_id' => $productId,
                    'payload' => [
                        'id' => $productId,
                        'name' => 'Offline Older Aspirin',
                        '_version' => 2,
                        'updated_at' => now()->subDay()->toDateTimeString() // Older update timestamp
                    ]
                ]
            ]
        ];

        $response = $this->actingAs($this->user)->postJson('/api/v1/app/sync/push', $payload);

        $response->assertStatus(200);

        // Assert the online name was NOT overwritten by the older offline sync
        $this->assertDatabaseHas('products', [
            'id' => $productId,
            'name' => 'Online Newer Aspirin',
        ]);
    }

    public function test_push_sync_handles_soft_deletes()
    {
        $productId = 'prod_delete_me';
        DB::table('products')->insert([
            'id' => $productId,
            'user_id' => $this->user->id,
            'name' => 'To Be Deleted',
            '_version' => 1,
            'created_at' => now(),
            'updated_at' => now()
        ]);

        $payload = [
            'setup' => true,
            'changes' => [
                [
                    'table_name' => 'products',
                    'operation' => 'UPDATE',
                    'record_id' => $productId,
                    'payload' => [
                        'id' => $productId,
                        'name' => 'To Be Deleted',
                        '_deleted' => 1, // Soft delete flag
                        'updated_at' => now()->toDateTimeString()
                    ]
                ]
            ]
        ];

        $response = $this->actingAs($this->user)->postJson('/api/v1/app/sync/push', $payload);
        $response->assertStatus(200);

        // Assert the record exists but is soft deleted (deleted_at is not null)
        $product = \App\Models\Product::withTrashed()->find($productId);
        $this->assertNotNull($product->deleted_at);
    }

    public function test_push_sync_reconciles_inventory_deductions()
    {
        DB::table('products')->insert([
            'id' => 'prod_123',
            'user_id' => $this->user->id,
            'name' => 'Paracetamol',
            '_version' => 1,
            'created_at' => now(),
            'updated_at' => now()
        ]);

        // Start with 100 on the server
        $batchId = 'batch_123';
        DB::table('stock_batches')->insert([
            'id' => $batchId,
            'user_id' => $this->user->id,
            'product_id' => 'prod_123',
            'quantity' => 80, // Someone sold 20 online!
            'cost_price' => 50.00,
            'expiry_date' => now()->addYear()->toDateString(),
            'batch_number' => 'B001',
            '_version' => 2,
            'created_at' => now()->subDay(),
            'updated_at' => now()
        ]);

        // The offline device started with 100. It sold 10 offline, so it sends 90.
        // It should NOT overwrite the 80 to 90. It should reconcile it: 
        // Delta = 90 (client) - 100 (client's assumed previous stock) = -10.
        // Or if the backend correctly processes it, it should result in 70 (80 online - 10 offline).
        
        $payload = [
            'setup' => true,
            'changes' => [
                [
                    'table_name' => 'stock_movements',
                    'operation' => 'INSERT',
                    'record_id' => 'mov_123',
                    'payload' => [
                        'id' => 'mov_123',
                        'stock_batch_id' => $batchId,
                        'product_id' => 'prod_123',
                        'movement_type' => 'sale',
                        'quantity' => -10, // The delta!
                        'performed_by' => $this->user->id,
                        'created_at' => now()->toDateTimeString(),
                        'updated_at' => now()->toDateTimeString()
                    ]
                ],
                [
                    'table_name' => 'stock_batches',
                    'operation' => 'UPDATE',
                    'record_id' => $batchId,
                    'payload' => [
                        'id' => $batchId,
                        'quantity' => 90, // Offline device sold 10 from 100
                        '_version' => 1, // Client thinks it's still version 1 before this edit
                        'updated_at' => now()->toDateTimeString()
                    ]
                ]
            ]
        ];

        $response = $this->actingAs($this->user)->postJson('/api/v1/app/sync/push', $payload);
        $response->assertStatus(200);

        // Assert the stock was correctly reconciled to 70
        $this->assertDatabaseHas('stock_batches', [
            'id' => $batchId,
            'quantity' => 70, // 80 - 10 = 70
        ]);
    }
}
