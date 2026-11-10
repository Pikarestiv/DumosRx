<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class SyncPushPurgedDeleteTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private Store $store;

    protected function setUp(): void
    {
        parent::setUp();

        $this->owner = User::create([
            'first_name' => 'Purge',
            'last_name' => 'Owner',
            'email' => 'purge-owner@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'admin',
        ]);
        $this->store = Store::create([
            'user_id' => $this->owner->id,
            'name' => 'Purge Store',
            'slug' => 'purge-store',
            'device_id' => 'WEB-PURGE',
            'currency' => 'NGN',
        ]);
        $this->owner->update(['store_id' => $this->store->id]);

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

    public function test_push_delete_for_nonexistent_row_returns_purged_ids(): void
    {
        $nonExistentId = 'cat-does-not-exist';

        $response = $this->actingAs($this->owner)
            ->withHeader('X-Store-Id', $this->store->id)
            ->postJson('/api/v1/app/sync/push', [
                'changes' => [
                    [
                        'table_name' => 'categories',
                        'operation' => 'DELETE',
                        'record_id' => $nonExistentId,
                        'payload' => ['id' => $nonExistentId],
                    ],
                ],
            ]);

        $response->assertStatus(200);
        $response->assertJson([
            'success' => true,
            'purged_ids' => [
                'categories' => [$nonExistentId],
            ],
        ]);
    }

    public function test_push_delete_for_existing_row_is_not_in_purged_ids(): void
    {
        $existingId = 'cat-exists-1';
        DB::table('categories')->insert([
            'id' => $existingId,
            'store_id' => $this->store->id,
            'name' => 'Existing Category',
            '_version' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $response = $this->actingAs($this->owner)
            ->withHeader('X-Store-Id', $this->store->id)
            ->postJson('/api/v1/app/sync/push', [
                'changes' => [
                    [
                        'table_name' => 'categories',
                        'operation' => 'DELETE',
                        'record_id' => $existingId,
                        'payload' => ['id' => $existingId],
                    ],
                ],
            ]);

        $response->assertStatus(200);
        $purged = $response->json('purged_ids');
        $this->assertArrayNotHasKey('categories', $purged);

        $row = DB::table('categories')->where('id', $existingId)->first();
        $this->assertNotNull($row->deleted_at);
    }
}

