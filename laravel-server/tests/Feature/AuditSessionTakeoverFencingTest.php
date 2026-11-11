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
}
