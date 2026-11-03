<?php

namespace Tests\Feature;

use App\Models\AuditSession;
use App\Models\AuditSessionItem;
use App\Models\Product;
use App\Models\StockAudit;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class AuditSessionTest extends TestCase
{
    use RefreshDatabase;

    protected User $owner;
    protected Store $store;
    protected Product $productA;
    protected Product $productB;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
            \App\Http\Middleware\CheckPermission::class,
            \App\Http\Middleware\CheckSubscription::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);

        $this->owner = User::create([
            'id' => (string) Str::uuid(),
            'first_name' => 'Audit',
            'last_name' => 'Owner',
            'email' => 'audit-owner@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $this->store = Store::create([
            'id' => (string) Str::uuid(),
            'user_id' => $this->owner->id,
            'name' => 'Audit Pharmacy',
            'store_slug' => 'audit-pharmacy',
            'device_id' => 'DRX-TEST-STORE',
            'currency' => 'NGN',
        ]);

        $this->productA = Product::create([
            'id' => (string) Str::uuid(),
            'store_id' => $this->store->id,
            'name' => 'Paracetamol 500mg',
            'selling_price' => 100,
        ]);

        $this->productB = Product::create([
            'id' => (string) Str::uuid(),
            'store_id' => $this->store->id,
            'name' => 'Amoxicillin 250mg',
            'selling_price' => 500,
        ]);
    }

    public function test_user_can_start_audit_session_with_items(): void
    {
        $payload = [
            'name' => 'Q4 Shelf Count',
            'notes' => 'Starting shelf count',
            'items' => [
                [
                    'product_id' => $this->productA->id,
                    'system_quantity' => 50,
                    'cost_price' => 70,
                    'selling_price' => 100,
                    'counted' => false,
                ],
                [
                    'product_id' => $this->productB->id,
                    'system_quantity' => 20,
                    'cost_price' => 350,
                    'selling_price' => 500,
                    'counted' => false,
                ],
            ],
        ];

        $response = $this->actingAs($this->owner)
            ->withHeaders([
                'X-Store-Id' => $this->store->id,
                'X-Device-Id' => 'TILL-01',
                'X-Device-Label' => 'Till 1 Counter',
            ])
            ->postJson('/api/v1/app/audit-sessions', $payload);

        $response->assertStatus(201);
        $response->assertJsonPath('success', true);
        $response->assertJsonPath('session.status', AuditSession::STATUS_IN_PROGRESS);
        $response->assertJsonPath('session.active_till_id', 'TILL-01');
        $response->assertJsonPath('session.lease_version', 1);
        $response->assertJsonPath('session.total_items_count', 2);
        $response->assertJsonPath('session.counted_items_count', 0);

        $sessionId = $response->json('session.id');
        $this->assertDatabaseHas('audit_sessions', [
            'id' => $sessionId,
            'store_id' => $this->store->id,
            'active_till_id' => 'TILL-01',
            'lease_version' => 1,
        ]);

        $this->assertDatabaseCount('audit_session_items', 2);
    }

    public function test_concurrent_start_from_another_till_is_rejected_with_conflict(): void
    {
        $this->actingAs($this->owner)
            ->withHeaders([
                'X-Store-Id' => $this->store->id,
                'X-Device-Id' => 'TILL-01',
            ])
            ->postJson('/api/v1/app/audit-sessions', ['items' => []])
            ->assertStatus(201);

        $response = $this->actingAs($this->owner)
            ->withHeaders([
                'X-Store-Id' => $this->store->id,
                'X-Device-Id' => 'TILL-02',
            ])
            ->postJson('/api/v1/app/audit-sessions', ['items' => []]);

        $response->assertStatus(409);
        $response->assertJsonPath('conflict', true);
    }

    public function test_heartbeat_and_fencing_token_validation(): void
    {
        $startRes = $this->actingAs($this->owner)
            ->withHeaders([
                'X-Store-Id' => $this->store->id,
                'X-Device-Id' => 'TILL-01',
            ])
            ->postJson('/api/v1/app/audit-sessions', ['items' => []]);

        $sessionId = $startRes->json('session.id');

        $hbRes = $this->actingAs($this->owner)
            ->withHeaders(['X-Store-Id' => $this->store->id])
            ->postJson("/api/v1/app/audit-sessions/{$sessionId}/heartbeat", [
                'till_id' => 'TILL-01',
                'lease_version' => 1,
            ]);

        $hbRes->assertStatus(200);
        $hbRes->assertJsonPath('success', true);

        $staleHb = $this->actingAs($this->owner)
            ->withHeaders(['X-Store-Id' => $this->store->id])
            ->postJson("/api/v1/app/audit-sessions/{$sessionId}/heartbeat", [
                'till_id' => 'TILL-01',
                'lease_version' => 99,
            ]);

        $staleHb->assertStatus(409);
    }

    public function test_sync_items_and_takeover_fencing_invalidation(): void
    {
        $startRes = $this->actingAs($this->owner)
            ->withHeaders([
                'X-Store-Id' => $this->store->id,
                'X-Device-Id' => 'TILL-01',
            ])
            ->postJson('/api/v1/app/audit-sessions', [
                'items' => [
                    ['product_id' => $this->productA->id, 'system_quantity' => 10, 'counted' => false],
                ],
            ]);

        $sessionId = $startRes->json('session.id');

        $syncRes = $this->actingAs($this->owner)
            ->withHeaders(['X-Store-Id' => $this->store->id])
            ->postJson("/api/v1/app/audit-sessions/{$sessionId}/sync-items", [
                'till_id' => 'TILL-01',
                'lease_version' => 1,
                'items' => [
                    [
                        'product_id' => $this->productA->id,
                        'system_quantity' => 10,
                        'counted_quantity' => 12,
                        'counted' => true,
                        'counted_at' => now()->toIso8601String(),
                    ],
                ],
            ]);

        $syncRes->assertStatus(200);
        $syncRes->assertJsonPath('counted_items_count', 1);

        $takeoverRes = $this->actingAs($this->owner)
            ->withHeaders(['X-Store-Id' => $this->store->id])
            ->postJson("/api/v1/app/audit-sessions/{$sessionId}/takeover", [
                'till_id' => 'TILL-02',
                'till_name' => 'Till 2 Back Office',
                'reason' => 'Till 1 battery died',
            ]);

        $takeoverRes->assertStatus(200);
        $takeoverRes->assertJsonPath('session.lease_version', 2);
        $takeoverRes->assertJsonPath('session.active_till_id', 'TILL-02');

        $staleSync = $this->actingAs($this->owner)
            ->withHeaders(['X-Store-Id' => $this->store->id])
            ->postJson("/api/v1/app/audit-sessions/{$sessionId}/sync-items", [
                'till_id' => 'TILL-01',
                'lease_version' => 1,
                'items' => [
                    ['product_id' => $this->productA->id, 'counted_quantity' => 15, 'counted' => true],
                ],
            ]);

        $staleSync->assertStatus(409);
    }

    public function test_complete_and_sync_engine_confirmation_lifecycle(): void
    {
        $startRes = $this->actingAs($this->owner)
            ->withHeaders([
                'X-Store-Id' => $this->store->id,
                'X-Device-Id' => 'TILL-01',
            ])
            ->postJson('/api/v1/app/audit-sessions', ['items' => []]);

        $sessionId = $startRes->json('session.id');
        $submittedAuditId = (string) Str::uuid();

        $compRes = $this->actingAs($this->owner)
            ->withHeaders(['X-Store-Id' => $this->store->id])
            ->postJson("/api/v1/app/audit-sessions/{$sessionId}/complete", [
                'till_id' => 'TILL-01',
                'lease_version' => 1,
                'submitted_stock_audit_id' => $submittedAuditId,
            ]);

        $compRes->assertStatus(200);
        $compRes->assertJsonPath('session.status', AuditSession::STATUS_COMPLETION_PENDING_SYNC);

        StockAudit::create([
            'id' => $submittedAuditId,
            'store_id' => $this->store->id,
            'product_id' => $this->productA->id,
            'expected_quantity' => 10,
            'actual_quantity' => 12,
            'difference' => 2,
            'user_id' => $this->owner->id,
            'status' => 'reconciled',
        ]);

        $this->assertDatabaseHas('audit_sessions', [
            'id' => $sessionId,
            'status' => AuditSession::STATUS_COMPLETED,
        ]);
    }

    public function test_abandon_session(): void
    {
        $startRes = $this->actingAs($this->owner)
            ->withHeaders([
                'X-Store-Id' => $this->store->id,
                'X-Device-Id' => 'TILL-01',
            ])
            ->postJson('/api/v1/app/audit-sessions', ['items' => []]);

        $sessionId = $startRes->json('session.id');

        $abandonRes = $this->actingAs($this->owner)
            ->withHeaders(['X-Store-Id' => $this->store->id])
            ->postJson("/api/v1/app/audit-sessions/{$sessionId}/abandon", [
                'reason' => 'Audit cancelled by manager',
            ]);

        $abandonRes->assertStatus(200);
        $abandonRes->assertJsonPath('session.status', AuditSession::STATUS_ABANDONED);
        $this->assertDatabaseHas('audit_sessions', [
            'id' => $sessionId,
            'status' => AuditSession::STATUS_ABANDONED,
            'lease_expires_at' => null,
        ]);
    }
}
