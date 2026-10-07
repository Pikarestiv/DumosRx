<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\SystemConfig;
use App\Models\User;
use App\Services\Sync\SyncFailureRecorder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * push() refuses changes from eight separate sites, all of which append to
 * one $failed array. Recording reads that array once, after the outer commit.
 * These cases drive real pushes so the single-hook design cannot silently
 * miss a path. See docs/superpowers/specs/2026-10-06-admin-panel-phase-2-sync-health-design.md.
 */
class SyncPushFailureRecordingTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private Store $storeA;

    private Store $storeB;

    private User $staff;

    protected function setUp(): void
    {
        parent::setUp();

        Schema::disableForeignKeyConstraints();

        $this->owner = User::create([
            'first_name' => 'Record',
            'last_name' => 'Owner',
            'email' => 'record-owner@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);
        $this->storeA = $this->makeStore($this->owner, 'Record Store A', 'record-store-a');
        $this->storeB = $this->makeStore($this->owner, 'Record Store B', 'record-store-b');
        $this->owner->update(['store_id' => $this->storeA->id]);

        $this->staff = User::create([
            'first_name' => 'Record',
            'last_name' => 'Staff',
            'email' => 'record-staff@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'staff',
            'store_id' => $this->storeA->id,
        ]);

        SystemConfig::setVal('subscription_plans', [
            'tiers' => [
                'free' => [
                    'features' => ['cloud_sync' => true],
                    'limits' => ['stores' => -1],
                ],
            ],
        ]);

        $this->withoutMiddleware();

        Schema::enableForeignKeyConstraints();
    }

    private function makeStore(User $owner, string $name, string $slug): Store
    {
        return Store::create([
            'user_id' => $owner->id,
            'name' => $name,
            'email' => "{$slug}@dumosrx.com",
            'phone' => '080'.substr(md5($slug), 0, 8),
            'address' => "1 {$name}",
            'slug' => $slug,
            'device_id' => strtoupper($slug),
        ]);
    }

    private function foreignStore(): Store
    {
        $foreignOwner = User::create([
            'first_name' => 'Other',
            'last_name' => 'Tenant',
            'email' => 'other-tenant@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);
        $store = $this->makeStore($foreignOwner, 'Other Tenant Store', 'other-tenant-store');
        $foreignOwner->update(['store_id' => $store->id]);

        return $store;
    }

    private function push(User $actor, string $table, string $recordId, array $payload, string $operation = 'INSERT')
    {
        return $this->actingAs($actor)->postJson('/api/v1/app/sync/push', [
            'setup' => true,
            'changes' => [
                [
                    'table_name' => $table,
                    'operation' => $operation,
                    'record_id' => $recordId,
                    'payload' => $payload,
                ],
            ],
        ]);
    }

    private function paymentPayload(string $recordId, string $storeId): array
    {
        return [
            'id' => $recordId,
            '_version' => 1,
            'customer_id' => 'record-customer-1',
            'amount' => 2500,
            'payment_method' => 'cash',
            'store_id' => $storeId,
        ];
    }

    public function test_a_permission_denied_refusal_is_recorded(): void
    {
        $recordId = 'payment-foreign-tenant';
        $foreign = $this->foreignStore();

        $response = $this->push($this->staff, 'customer_payments', $recordId, $this->paymentPayload($recordId, $foreign->id));

        $response->assertStatus(200);
        $this->assertSame('permission_denied', $response->json('failed.0.reason'));

        $this->assertDatabaseHas('sync_failures', [
            'record_id' => $recordId,
            'table_name' => 'customer_payments',
            'operation' => 'INSERT',
            'reason' => 'permission_denied',
            'store_id' => $this->storeA->id,
            'user_id' => $this->staff->id,
        ]);
    }

    public function test_a_forbidden_refusal_is_recorded(): void
    {
        $recordId = 'payment-owners-other-store';

        $response = $this->push($this->staff, 'customer_payments', $recordId, $this->paymentPayload($recordId, $this->storeB->id));

        $response->assertStatus(200);
        $this->assertSame('forbidden', $response->json('failed.0.reason'));

        $this->assertDatabaseHas('sync_failures', [
            'record_id' => $recordId,
            'reason' => 'forbidden',
            'operation' => 'INSERT',
        ]);
    }

    public function test_failures_attribute_to_the_store_named_by_the_header(): void
    {
        $recordId = 'payment-header-attribution';
        $foreign = $this->foreignStore();

        $this->actingAs($this->staff)
            ->withHeader('X-Store-Id', $this->storeA->id)
            ->postJson('/api/v1/app/sync/push', [
                'setup' => true,
                'changes' => [[
                    'table_name' => 'customer_payments',
                    'operation' => 'INSERT',
                    'record_id' => $recordId,
                    'payload' => $this->paymentPayload($recordId, $foreign->id),
                ]],
            ])->assertStatus(200);

        $this->assertDatabaseHas('sync_failures', [
            'record_id' => $recordId,
            'store_id' => $this->storeA->id,
        ]);
        $this->assertDatabaseMissing('sync_failures', [
            'record_id' => $recordId,
            'store_id' => $this->storeB->id,
        ]);
    }

    public function test_the_push_response_shape_is_unchanged(): void
    {
        $recordId = 'payment-shape-check';

        $this->push($this->owner, 'customer_payments', $recordId, $this->paymentPayload($recordId, $this->storeA->id))
            ->assertStatus(200)
            ->assertJsonStructure(['success', 'processed', 'failed', 'id_map', 'versions']);
    }

    public function test_a_recorder_failure_does_not_fail_the_push(): void
    {
        $this->app->instance(SyncFailureRecorder::class, new class extends SyncFailureRecorder
        {
            public function recordPushOutcome(array $failed, array $changes, ?string $storeId, ?string $userId, int $accepted): void
            {
                throw new \RuntimeException('telemetry is down');
            }
        });

        $recordId = 'payment-telemetry-down';

        $this->push($this->owner, 'customer_payments', $recordId, $this->paymentPayload($recordId, $this->storeA->id))
            ->assertStatus(200)
            ->assertJsonPath('success', true);
    }

    public function test_a_successful_push_increments_the_daily_tally(): void
    {
        $recordId = 'payment-tally';

        $this->push($this->owner, 'customer_payments', $recordId, $this->paymentPayload($recordId, $this->storeA->id))
            ->assertStatus(200);

        $this->assertDatabaseHas('sync_health_daily', [
            'store_id' => $this->storeA->id,
            'pushes' => 1,
        ]);
    }
}
