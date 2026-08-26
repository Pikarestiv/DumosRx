<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DashboardStatsTest extends TestCase
{
    use RefreshDatabase;

    protected User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::create([
            'first_name' => 'Store',
            'last_name' => 'Owner',
            'email' => 'owner@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
            \App\Http\Middleware\CheckPermission::class,
            \App\Http\Middleware\CheckSubscription::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);
    }

    public function test_stats_requires_authentication(): void
    {
        $response = $this->getJson('/api/v1/dashboard/stats');
        $response->assertStatus(401);
    }

    public function test_stats_returns_shape_for_authenticated_user_with_no_stores(): void
    {
        $token = $this->user->createToken('test')->plainTextToken;

        $response = $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson('/api/v1/dashboard/stats');

        $response->assertStatus(200);
        $response->assertJsonStructure([
            'stats' => ['total_sales' => ['value', 'growth'], 'inventory_value' => ['value'], 'customers' => ['value', 'growth'], 'stores_count', 'last_sync', 'cloud_storage' => ['used_gb', 'limit_gb', 'percentage']],
            'stores',
        ]);
        $response->assertJson(['stats' => ['stores_count' => 0]]);
    }

    public function test_stats_includes_a_slim_store_row_without_heavy_nested_data(): void
    {
        $store = Store::create([
            'user_id' => $this->user->id,
            'name' => 'Main Branch',
            'store_type' => 'pharmacy',
            'device_id' => 'test-device-'.uniqid(),
        ]);
        $token = $this->user->createToken('test')->plainTextToken;

        $response = $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson('/api/v1/dashboard/stats');

        $response->assertStatus(200);
        $response->assertJsonCount(1, 'stores');
        $response->assertJsonPath('stores.0.id', $store->id);
        $response->assertJsonPath('stores.0.name', 'Main Branch');
        $response->assertJsonMissingPath('stores.0.recent_transactions');
        $response->assertJsonMissingPath('stores.0.recent_activities');
    }
}
