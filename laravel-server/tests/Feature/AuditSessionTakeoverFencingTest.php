<?php

namespace Tests\Feature;

use App\Models\AuditSession;
use App\Models\Product;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class AuditSessionTakeoverFencingTest extends TestCase
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
            'first_name' => 'Fencing',
            'last_name' => 'Tester',
            'email' => 'fencing@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $this->store = Store::create([
            'id' => (string) Str::uuid(),
            'user_id' => $this->owner->id,
            'name' => 'Fencing Pharmacy',
            'store_slug' => 'fencing-pharmacy',
            'device_id' => 'DRX-FENCE-STORE',
            'currency' => 'NGN',
        ]);

        $this->product = Product::create([
            'id' => (string) Str::uuid(),
            'store_id' => $this->store->id,
            'name' => 'Ibuprofen 400mg',
            'selling_price' => 200,
        ]);
    }

    public function test_takeover_invalidates_stale_heartbeat_and_stale_complete(): void
    {
        $startRes = $this->actingAs($this->owner)
            ->withHeaders([
                'X-Store-Id' => $this->store->id,
                'X-Device-Id' => 'TILL-01',
            ])
            ->postJson('/api/v1/app/audit-sessions', [
                'items' => [
                    ['product_id' => $this->product->id, 'system_quantity' => 20, 'counted' => false],
                ],
            ]);

        $sessionId = $startRes->json('session.id');

        $takeoverRes = $this->actingAs($this->owner)
            ->withHeaders(['X-Store-Id' => $this->store->id])
            ->postJson("/api/v1/app/audit-sessions/{$sessionId}/takeover", [
                'till_id' => 'TILL-02',
                'till_name' => 'Till 2 Second Register',
                'reason' => 'Till 1 battery flat',
            ]);

        $takeoverRes->assertStatus(200);
        $takeoverRes->assertJsonPath('session.lease_version', 2);
        $takeoverRes->assertJsonPath('session.active_till_id', 'TILL-02');

        $staleHeartbeat = $this->actingAs($this->owner)
            ->withHeaders(['X-Store-Id' => $this->store->id])
            ->postJson("/api/v1/app/audit-sessions/{$sessionId}/heartbeat", [
                'till_id' => 'TILL-01',
                'lease_version' => 1,
            ]);

        $staleHeartbeat->assertStatus(409);
        $staleHeartbeat->assertJsonPath('message', 'Lease has been superseded or expired on this device.');

        $staleComplete = $this->actingAs($this->owner)
            ->withHeaders(['X-Store-Id' => $this->store->id])
            ->postJson("/api/v1/app/audit-sessions/{$sessionId}/complete", [
                'till_id' => 'TILL-01',
                'lease_version' => 1,
                'submitted_stock_audit_id' => (string) Str::uuid(),
            ]);

        $staleComplete->assertStatus(409);

        $validComplete = $this->actingAs($this->owner)
            ->withHeaders(['X-Store-Id' => $this->store->id])
            ->postJson("/api/v1/app/audit-sessions/{$sessionId}/complete", [
                'till_id' => 'TILL-02',
                'lease_version' => 2,
                'submitted_stock_audit_id' => (string) Str::uuid(),
            ]);

        $validComplete->assertStatus(200);
        $validComplete->assertJsonPath('session.status', AuditSession::STATUS_COMPLETION_PENDING_SYNC);
    }

    public function test_cannot_takeover_inactive_session(): void
    {
        $startRes = $this->actingAs($this->owner)
            ->withHeaders([
                'X-Store-Id' => $this->store->id,
                'X-Device-Id' => 'TILL-01',
            ])
            ->postJson('/api/v1/app/audit-sessions', ['items' => []]);

        $sessionId = $startRes->json('session.id');

        $this->actingAs($this->owner)
            ->withHeaders(['X-Store-Id' => $this->store->id])
            ->postJson("/api/v1/app/audit-sessions/{$sessionId}/abandon", ['reason' => 'Abandoned']);

        $takeoverRes = $this->actingAs($this->owner)
            ->withHeaders(['X-Store-Id' => $this->store->id])
            ->postJson("/api/v1/app/audit-sessions/{$sessionId}/takeover", [
                'till_id' => 'TILL-02',
                'reason' => 'Attempt takeover of abandoned',
            ]);

        $takeoverRes->assertStatus(409);
        $takeoverRes->assertJsonPath('message', 'Cannot take over an audit session that is not in progress.');
    }

    private function startSessionOnTill(string $tillId): string
    {
        return $this->actingAs($this->owner)
            ->withHeaders(['X-Store-Id' => $this->store->id, 'X-Device-Id' => $tillId])
            ->postJson('/api/v1/app/audit-sessions', [
                'items' => [['product_id' => $this->product->id, 'system_quantity' => 20, 'counted' => false]],
            ])
            ->json('session.id');
    }

    public function test_stale_abandon_after_takeover_is_rejected_and_session_stays_in_progress(): void
    {
        $sessionId = $this->startSessionOnTill('TILL-01');

        $this->actingAs($this->owner)
            ->withHeaders(['X-Store-Id' => $this->store->id])
            ->postJson("/api/v1/app/audit-sessions/{$sessionId}/takeover", ['till_id' => 'TILL-02'])
            ->assertStatus(200);

        $staleAbandon = $this->actingAs($this->owner)
            ->withHeaders(['X-Store-Id' => $this->store->id, 'X-Device-Id' => 'TILL-01'])
            ->postJson("/api/v1/app/audit-sessions/{$sessionId}/abandon", [
                'till_id' => 'TILL-01',
                'lease_version' => 1,
                'reason' => 'Start over',
            ]);

        $staleAbandon->assertStatus(409);
        $this->assertSame(AuditSession::STATUS_IN_PROGRESS, AuditSession::find($sessionId)->status);
        $this->assertSame('TILL-02', AuditSession::find($sessionId)->active_till_id);
    }

    public function test_abandon_from_a_different_till_with_the_current_lease_version_is_rejected(): void
    {
        $sessionId = $this->startSessionOnTill('TILL-01');

        $this->actingAs($this->owner)
            ->withHeaders(['X-Store-Id' => $this->store->id])
            ->postJson("/api/v1/app/audit-sessions/{$sessionId}/abandon", [
                'till_id' => 'TILL-03',
                'lease_version' => 1,
            ])
            ->assertStatus(409);

        $this->assertSame(AuditSession::STATUS_IN_PROGRESS, AuditSession::find($sessionId)->status);
    }

    public function test_abandon_from_the_lease_holder_succeeds(): void
    {
        $sessionId = $this->startSessionOnTill('TILL-01');

        $this->actingAs($this->owner)
            ->withHeaders(['X-Store-Id' => $this->store->id])
            ->postJson("/api/v1/app/audit-sessions/{$sessionId}/abandon", [
                'till_id' => 'TILL-01',
                'lease_version' => 1,
            ])
            ->assertStatus(200)
            ->assertJsonPath('session.status', AuditSession::STATUS_ABANDONED);
    }

    public function test_abandon_without_lease_fields_from_an_older_client_still_succeeds(): void
    {
        $sessionId = $this->startSessionOnTill('TILL-01');

        $this->actingAs($this->owner)
            ->withHeaders(['X-Store-Id' => $this->store->id, 'X-Device-Id' => 'TILL-09'])
            ->postJson("/api/v1/app/audit-sessions/{$sessionId}/abandon", ['reason' => 'Start over'])
            ->assertStatus(200)
            ->assertJsonPath('session.status', AuditSession::STATUS_ABANDONED);
    }

    public function test_store_id_header_selects_the_sessions_store_for_a_multi_store_owner(): void
    {
        $sessionId = $this->startSessionOnTill('TILL-01');
        $otherStore = Store::create([
            'id' => (string) Str::uuid(),
            'user_id' => $this->owner->id,
            'name' => 'Second Branch',
            'store_slug' => 'second-branch',
            'device_id' => 'DRX-FENCE-STORE-2',
            'currency' => 'NGN',
        ]);
        $completeBody = ['till_id' => 'TILL-01', 'lease_version' => 1, 'submitted_stock_audit_id' => (string) Str::uuid()];

        $this->actingAs($this->owner)
            ->withHeaders(['X-Store-Id' => $otherStore->id])
            ->postJson("/api/v1/app/audit-sessions/{$sessionId}/complete", $completeBody)
            ->assertStatus(403);

        $this->actingAs($this->owner)
            ->withHeaders(['X-Store-Id' => $this->store->id])
            ->postJson("/api/v1/app/audit-sessions/{$sessionId}/complete", $completeBody)
            ->assertStatus(200)
            ->assertJsonPath('session.status', AuditSession::STATUS_COMPLETION_PENDING_SYNC);
    }
}
