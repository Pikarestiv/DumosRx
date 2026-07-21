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
}
