<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use App\Services\Admin\DeviceQueueReportService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Log;
use Tests\TestCase;

/**
 * Pins push/pull behaviour that the SyncController service extraction moved
 * and that no other test exercised. See laravel-server/AGENTS.md, "Where the
 * sync server code lives".
 */
class SyncControllerSeamCharacterizationTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private Store $store;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(\Database\Seeders\RolesAndPermissionsSeeder::class);

        $this->owner = User::create([
            'first_name' => 'Owner', 'last_name' => 'User',
            'email' => 'owner@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'admin',
        ]);

        $this->store = Store::create([
            'user_id' => $this->owner->id,
            'name' => 'Main Store',
            'store_slug' => 'main-store',
            'device_id' => 'WEB-MAIN',
        ]);

        \App\Models\SystemConfig::setVal('subscription_plans', [
            'tiers' => ['free' => ['features' => ['cloud_sync' => true], 'limits' => ['stores' => -1]]],
        ]);

        $this->withoutMiddleware();
    }

    private function push(User $user, array $changes, array $extra = [], array $headers = [])
    {
        return $this->actingAs($user)
            ->withHeaders($headers)
            ->postJson('/api/v1/app/sync/push', array_merge(['setup' => true, 'changes' => $changes], $extra));
    }

    public function test_a_push_records_the_devices_queue_state(): void
    {
        $this->push($this->owner, [], ['queue_state' => ['queue_depth' => 3]], ['X-Device-Id' => 'DRX-TILL-1'])
            ->assertStatus(200);

        $device = app(DeviceQueueReportService::class)->forStore($this->store->id)['devices'][0];

        $this->assertSame('DRX-TILL-1', $device['device_id']);
        $this->assertSame(3, $device['queue_depth']);
    }

    public function test_a_pushed_product_and_supplier_get_their_not_null_defaults(): void
    {
        $this->push($this->owner, [
            ['table_name' => 'products', 'operation' => 'INSERT', 'record_id' => 'prod-defaults',
                'payload' => ['id' => 'prod-defaults', 'name' => 'Defaulted', 'store_id' => $this->store->id]],
            ['table_name' => 'suppliers', 'operation' => 'INSERT', 'record_id' => 'sup-defaults',
                'payload' => ['id' => 'sup-defaults', 'name' => 'Defaulted Supplier', 'payment_terms' => 'null', 'store_id' => $this->store->id]],
        ])->assertStatus(200)->assertJsonCount(0, 'failed');

        $this->assertDatabaseHas('products', ['id' => 'prod-defaults', 'pack_size' => 1, 'unit_of_measure' => 'piece']);
        $this->assertDatabaseHas('suppliers', ['id' => 'sup-defaults', 'payment_terms' => 30]);
    }

    public function test_assigning_a_platform_role_to_another_user_is_refused_with_its_own_reason(): void
    {
        $staff = User::create([
            'first_name' => 'Staff', 'last_name' => 'Member',
            'username' => 'staff_member',
            'email' => 'staff@dumosrx.com',
            'store_id' => $this->store->id,
            'password' => bcrypt('pin1234'),
            'role' => 'sales_staff',
        ]);

        $response = $this->push($this->owner, [
            ['table_name' => 'users', 'operation' => 'UPDATE', 'record_id' => $staff->id,
                'payload' => ['id' => $staff->id, 'role' => 'super_admin']],
        ])->assertStatus(200);

        $this->assertSame('Sync push: users payload attempted to set a disallowed role', $response->json('failed.0.reason'));
        $this->assertDatabaseHas('users', ['id' => $staff->id, 'role' => 'sales_staff']);
    }

    public function test_a_refused_pull_store_is_logged_once_per_user_per_day(): void
    {
        Log::spy();

        foreach ([1, 2] as $attempt) {
            $this->actingAs($this->owner)
                ->withHeaders(['X-Store-Id' => 'not-my-store'])
                ->postJson('/api/v1/app/sync/pull', ['last_synced' => []])
                ->assertStatus(200)
                ->assertJsonPath('refused_store_id', 'not-my-store');
        }

        Log::shouldHaveReceived('warning')
            ->withArgs(fn ($message) => str_contains($message, 'A-254'))
            ->once();
    }
}
