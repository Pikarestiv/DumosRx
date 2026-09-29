<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PermissionGroupSyncTest extends TestCase
{
    use RefreshDatabase;

    protected User $user;
    protected Store $store;

    protected function setUp(): void
    {
        parent::setUp();

        \Illuminate\Support\Facades\Schema::disableForeignKeyConstraints();

        $this->seed(\Database\Seeders\RolesAndPermissionsSeeder::class);

        $this->user = User::create([
            'first_name' => 'Admin',
            'last_name' => 'User',
            'email' => 'admin-pgsync@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'admin',
        ]);

        $this->store = Store::create([
            'user_id' => $this->user->id,
            'name' => 'Test Store PG Sync',
            'email' => 'store-pgsync@dumosrx.com',
            'phone' => '1234567890',
            'address' => '123 Test St',
            'store_slug' => 'test-store-pgsync',
            'device_id' => 'WEB-TEST-PGSYNC',
        ]);

        $this->user->update(['store_id' => $this->store->id]);

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

    public function test_a_permission_groups_insert_push_creates_the_row_and_a_pull_returns_it(): void
    {
        $groupId = (string) \Illuminate\Support\Str::uuid();

        $response = $this->actingAs($this->user)->postJson('/api/v1/app/sync/push', [
            'setup' => true,
            'changes' => [
                [
                    'table_name' => 'permission_groups',
                    'operation' => 'INSERT',
                    'record_id' => $groupId,
                    'payload' => [
                        'id' => $groupId,
                        'store_id' => $this->store->id,
                        'name' => 'Supervisor',
                        'based_on_role' => 'manager',
                        'is_default' => false,
                        'permissions' => ['process_sales'],
                        '_synced' => 0,
                    ],
                ],
            ],
        ]);

        $response->assertStatus(200);
        $this->assertDatabaseHas('permission_groups', ['id' => $groupId, 'name' => 'Supervisor']);

        $pullResponse = $this->actingAs($this->user)->postJson('/api/v1/app/sync/pull', [
            'last_synced' => [],
        ]);

        $pullResponse->assertStatus(200);
        $this->assertContains($groupId, collect($pullResponse->json('changes.permission_groups'))->pluck('id'));
    }
}
