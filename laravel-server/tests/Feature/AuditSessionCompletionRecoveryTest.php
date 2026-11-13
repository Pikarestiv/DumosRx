<?php

namespace Tests\Feature;

use App\Models\AuditSession;
use App\Models\Product;
use App\Models\StockAudit;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class AuditSessionCompletionRecoveryTest extends TestCase
{
    use RefreshDatabase;

    protected User $owner;

    protected Store $store;

    protected Product $product;

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
            'email' => 'recovery-owner@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $this->store = Store::create([
            'id' => (string) Str::uuid(),
            'user_id' => $this->owner->id,
            'name' => 'Recovery Pharmacy',
            'store_slug' => 'recovery-pharmacy',
            'device_id' => 'DRX-RECOVERY',
            'currency' => 'NGN',
        ]);

        $this->product = Product::create([
            'id' => (string) Str::uuid(),
            'store_id' => $this->store->id,
            'name' => 'Paracetamol 500mg',
            'selling_price' => 100,
        ]);
    }

    private function api(string $till = 'TILL-01')
    {
        return $this->actingAs($this->owner)->withHeaders([
            'X-Store-Id' => $this->store->id,
            'X-Device-Id' => $till,
        ]);
    }

    private function startCountedSession(): string
    {
        return $this->api()->postJson('/api/v1/app/audit-sessions', [
            'items' => [[
                'product_id' => $this->product->id,
                'system_quantity' => 20,
                'counted_quantity' => 15,
                'counted' => true,
                'counted_at' => '2026-11-10T09:05:00Z',
            ]],
        ])->assertStatus(201)->json('session.id');
    }

    private function complete(string $sessionId, ?string $auditId)
    {
        return $this->api()->postJson("/api/v1/app/audit-sessions/{$sessionId}/complete", [
            'till_id' => 'TILL-01',
            'lease_version' => 1,
            'submitted_stock_audit_id' => $auditId,
        ]);
    }

    private function syncStockAudit(string $id): void
    {
        StockAudit::create([
            'id' => $id,
            'store_id' => $this->store->id,
            'product_id' => $this->product->id,
            'expected_quantity' => 20,
            'actual_quantity' => 15,
            'difference' => -5,
            'user_id' => $this->owner->id,
            'status' => 'reconciled',
        ]);
    }

    public function test_a_retried_complete_is_accepted_instead_of_conflicting(): void
    {
        $sessionId = $this->startCountedSession();
        $auditId = (string) Str::uuid();

        $this->complete($sessionId, $auditId)->assertOk();
        $retry = $this->complete($sessionId, $auditId);

        $retry->assertOk();
        $retry->assertJsonPath('session.status', AuditSession::STATUS_COMPLETION_PENDING_SYNC);
        $retry->assertJsonPath('session.submitted_stock_audit_id', $auditId);
    }

    public function test_a_retried_complete_after_the_audit_synced_settles_the_session(): void
    {
        $sessionId = $this->startCountedSession();
        $auditId = (string) Str::uuid();
        $this->complete($sessionId, $auditId)->assertOk();
        StockAudit::withoutEvents(fn () => $this->syncStockAudit($auditId));

        $this->complete($sessionId, $auditId)
            ->assertOk()
            ->assertJsonPath('session.status', AuditSession::STATUS_COMPLETED);
    }

    public function test_a_complete_naming_a_different_audit_still_conflicts(): void
    {
        $sessionId = $this->startCountedSession();
        $this->complete($sessionId, (string) Str::uuid())->assertOk();

        $this->complete($sessionId, (string) Str::uuid())->assertStatus(409);
    }

    public function test_a_session_awaiting_sync_is_returned_without_its_counted_items(): void
    {
        $sessionId = $this->startCountedSession();
        $this->complete($sessionId, (string) Str::uuid())->assertOk();

        $res = $this->api('TILL-02')->getJson('/api/v1/app/audit-sessions/active?include_items=1');

        $res->assertOk();
        $res->assertJsonPath('session.id', $sessionId);
        $res->assertJsonPath('session.status', AuditSession::STATUS_COMPLETION_PENDING_SYNC);
        $res->assertJsonPath('session.items', []);
    }

    public function test_an_in_progress_session_still_returns_its_items_for_takeover(): void
    {
        $this->startCountedSession();

        $res = $this->api('TILL-02')->getJson('/api/v1/app/audit-sessions/active?include_items=1');

        $res->assertJsonPath('session.items.0.counted_quantity', '15.00');
    }

    public function test_a_pending_session_whose_audit_already_synced_is_settled_on_read(): void
    {
        $sessionId = $this->startCountedSession();
        $auditId = (string) Str::uuid();
        $this->complete($sessionId, $auditId)->assertOk();
        StockAudit::withoutEvents(fn () => $this->syncStockAudit($auditId));

        $this->api('TILL-02')->getJson('/api/v1/app/audit-sessions/active')->assertJsonPath('session', null);
        $this->assertDatabaseHas('audit_sessions', ['id' => $sessionId, 'status' => AuditSession::STATUS_COMPLETED]);
    }

    public function test_a_pending_session_that_never_confirms_stops_blocking_new_counts(): void
    {
        $sessionId = $this->startCountedSession();
        $this->complete($sessionId, (string) Str::uuid())->assertOk();
        AuditSession::whereKey($sessionId)->update(['last_synced_at' => now()->subHours(25)]);

        $this->api('TILL-02')->postJson('/api/v1/app/audit-sessions', ['items' => []])->assertStatus(201);
        $this->assertDatabaseHas('audit_sessions', ['id' => $sessionId, 'status' => AuditSession::STATUS_COMPLETED]);
    }

    public function test_a_recent_pending_session_still_blocks_a_new_start(): void
    {
        $sessionId = $this->startCountedSession();
        $this->complete($sessionId, (string) Str::uuid())->assertOk();

        $this->api('TILL-02')->postJson('/api/v1/app/audit-sessions', ['items' => []])->assertStatus(409);
    }
}
