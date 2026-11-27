<?php

namespace Tests\Feature;

use App\Exceptions\AuditSessionConflictException;
use App\Models\AuditSession;
use App\Models\AuditSessionItem;
use App\Models\Product;
use App\Models\Store;
use App\Models\User;
use App\Services\Audit\AuditSessionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class AuditSessionSyncItemsLockingTest extends TestCase
{
    use RefreshDatabase;

    private AuditSessionService $service;

    private User $owner;

    private Store $store;

    protected function setUp(): void
    {
        parent::setUp();

        $this->service = app(AuditSessionService::class);
        $this->owner = User::create([
            'id' => (string) Str::uuid(),
            'first_name' => 'Lock',
            'last_name' => 'Tester',
            'email' => 'audit-lock@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);
        $this->store = Store::create([
            'id' => (string) Str::uuid(),
            'user_id' => $this->owner->id,
            'name' => 'Lock Pharmacy',
            'store_slug' => 'lock-pharmacy',
            'device_id' => 'DRX-LOCK-STORE',
            'currency' => 'NGN',
        ]);
    }

    private function product(): string
    {
        return Product::create([
            'id' => (string) Str::uuid(),
            'store_id' => $this->store->id,
            'name' => 'Product '.Str::random(6),
            'selling_price' => 100,
        ])->id;
    }

    private function startOnTill(string $tillId): AuditSession
    {
        return $this->service->startSession($this->store->id, $this->owner->id, $tillId, null, null, null, []);
    }

    private function counted(string $productId): array
    {
        return ['product_id' => $productId, 'system_quantity' => 5, 'counted_quantity' => 4, 'counted' => true];
    }

    public function test_the_session_row_is_read_for_locking_before_any_item_is_written(): void
    {
        $session = $this->startOnTill('TILL-01');
        DB::enableQueryLog();

        $this->service->syncBatchItems($session, 'TILL-01', 1, [$this->counted($this->product())]);

        $queries = collect(DB::getQueryLog())->pluck('query')->values();
        DB::disableQueryLog();
        $lockAt = $queries->search(fn ($q) => str_starts_with($q, 'select') && str_contains($q, 'from "audit_sessions" where "audit_sessions"."id" = ?'));
        $insertAt = $queries->search(fn ($q) => str_starts_with($q, 'insert into "audit_session_items"'));
        $this->assertNotFalse($lockAt, 'The sync never read the session row inside its transaction.');
        $this->assertNotFalse($insertAt);
        $this->assertLessThan($insertAt, $lockAt, 'Items were written before the session row was locked.');
    }

    public function test_a_lease_taken_over_after_the_session_was_read_rejects_the_sync(): void
    {
        $readBeforeTakeover = $this->startOnTill('TILL-01');
        $this->service->takeoverSession(AuditSession::findOrFail($readBeforeTakeover->id), $this->owner->id, 'TILL-02', null);

        try {
            $this->service->syncBatchItems($readBeforeTakeover, 'TILL-01', 1, [$this->counted($this->product())]);
            $this->fail('A superseded till wrote items to a session another till had taken over.');
        } catch (AuditSessionConflictException $e) {
            $this->assertSame('Lease has been superseded or expired on this device.', $e->getMessage());
            $this->assertSame('TILL-02', $e->getSession()->active_till_id);
            $this->assertSame(2, $e->getSession()->lease_version);
        }

        $this->assertSame(0, AuditSessionItem::where('audit_session_id', $readBeforeTakeover->id)->count());
        $this->assertSame(0, AuditSession::findOrFail($readBeforeTakeover->id)->counted_items_count);
    }

    public function test_a_session_abandoned_after_it_was_read_rejects_the_sync(): void
    {
        $readBeforeAbandon = $this->startOnTill('TILL-01');
        AuditSession::whereKey($readBeforeAbandon->id)->update(['status' => AuditSession::STATUS_ABANDONED]);

        try {
            $this->service->syncBatchItems($readBeforeAbandon, 'TILL-01', 1, [$this->counted($this->product())]);
            $this->fail('Items were synced into an abandoned session.');
        } catch (AuditSessionConflictException $e) {
            $this->assertSame('Cannot sync items to an inactive audit session.', $e->getMessage());
            $this->assertSame(AuditSession::STATUS_ABANDONED, $e->getSession()->status);
        }

        $this->assertSame(0, AuditSessionItem::where('audit_session_id', $readBeforeAbandon->id)->count());
    }

    public function test_items_are_written_in_product_id_order_whatever_order_the_client_sent(): void
    {
        $session = $this->startOnTill('TILL-01');
        $ids = [$this->product(), $this->product(), $this->product(), $this->product()];
        $sorted = $ids;
        sort($sorted);
        $sent = array_reverse($sorted);
        DB::enableQueryLog();

        $this->service->syncBatchItems($session, 'TILL-01', 1, array_map(fn ($id) => $this->counted($id), $sent));

        $insert = collect(DB::getQueryLog())->first(fn ($q) => str_starts_with($q['query'], 'insert into "audit_session_items"'));
        DB::disableQueryLog();
        $written = array_values(array_filter($insert['bindings'], fn ($b) => in_array($b, $ids, true)));
        $this->assertSame($sorted, $written);
    }

    private function assertConflict(callable $write, string $message): AuditSession
    {
        try {
            $write();
        } catch (AuditSessionConflictException $e) {
            $this->assertSame($message, $e->getMessage());

            return $e->getSession();
        }
        $this->fail('A write on a stale copy of the session was accepted.');
    }

    public function test_a_heartbeat_from_a_till_taken_over_after_the_read_is_rejected(): void
    {
        $readBeforeTakeover = $this->startOnTill('TILL-01');
        $this->service->takeoverSession(AuditSession::findOrFail($readBeforeTakeover->id), $this->owner->id, 'TILL-02', null);
        $leaseAfterTakeover = AuditSession::findOrFail($readBeforeTakeover->id)->lease_expires_at;
        $this->travel(2)->minutes();

        $fresh = $this->assertConflict(
            fn () => $this->service->heartbeat($readBeforeTakeover, 'TILL-01', 1, $this->owner->id),
            'Lease has been superseded or expired on this device.'
        );

        $this->assertSame(2, $fresh->lease_version);
        $this->assertEquals($leaseAfterTakeover, AuditSession::findOrFail($readBeforeTakeover->id)->lease_expires_at);
    }

    public function test_a_heartbeat_on_a_session_abandoned_after_the_read_is_rejected(): void
    {
        $readBeforeAbandon = $this->startOnTill('TILL-01');
        AuditSession::whereKey($readBeforeAbandon->id)->update(['status' => AuditSession::STATUS_ABANDONED, 'lease_expires_at' => null]);

        $this->assertConflict(
            fn () => $this->service->heartbeat($readBeforeAbandon, 'TILL-01', 1),
            'Cannot heartbeat an inactive audit session.'
        );

        $this->assertNull(AuditSession::findOrFail($readBeforeAbandon->id)->lease_expires_at);
    }

    public function test_a_complete_from_a_till_taken_over_after_the_read_is_rejected(): void
    {
        $readBeforeTakeover = $this->startOnTill('TILL-01');
        $this->service->takeoverSession(AuditSession::findOrFail($readBeforeTakeover->id), $this->owner->id, 'TILL-02', null);

        $fresh = $this->assertConflict(
            fn () => $this->service->completeSession($readBeforeTakeover, 'TILL-01', 1, (string) Str::uuid()),
            'Lease has been superseded or expired on this device.'
        );

        $this->assertSame('TILL-02', $fresh->active_till_id);
        $this->assertSame(AuditSession::STATUS_IN_PROGRESS, AuditSession::findOrFail($readBeforeTakeover->id)->status);
    }

    public function test_a_complete_on_a_session_abandoned_after_the_read_is_rejected(): void
    {
        $readBeforeAbandon = $this->startOnTill('TILL-01');
        AuditSession::whereKey($readBeforeAbandon->id)->update(['status' => AuditSession::STATUS_ABANDONED]);

        $this->assertConflict(
            fn () => $this->service->completeSession($readBeforeAbandon, 'TILL-01', 1, (string) Str::uuid()),
            'Cannot complete an audit session that is not in progress.'
        );

        $this->assertSame(AuditSession::STATUS_ABANDONED, AuditSession::findOrFail($readBeforeAbandon->id)->status);
    }

    public function test_a_heartbeat_and_complete_from_the_lease_holder_still_succeed(): void
    {
        $session = $this->startOnTill('TILL-01');
        $this->travel(2)->minutes();

        $beat = $this->service->heartbeat($session, 'TILL-01', 1, $this->owner->id);
        $done = $this->service->completeSession($session, 'TILL-01', 1);

        $this->assertTrue($beat->lease_expires_at->gt(now()->addSeconds(AuditSessionService::LEASE_DURATION_SECONDS - 5)));
        $this->assertSame(AuditSession::STATUS_COMPLETED, $done->status);
        $this->assertSame(AuditSession::STATUS_COMPLETED, AuditSession::findOrFail($session->id)->status);
    }

    public function test_a_sync_from_the_lease_holder_still_returns_the_fresh_counts(): void
    {
        $session = $this->startOnTill('TILL-01');
        $items = [$this->counted($this->product()), ['product_id' => $this->product(), 'system_quantity' => 3, 'counted' => false]];

        $updated = $this->service->syncBatchItems($session, 'TILL-01', 1, $items);

        $this->assertSame(2, $updated->total_items_count);
        $this->assertSame(1, $updated->counted_items_count);
        $this->assertSame(1, AuditSession::findOrFail($session->id)->counted_items_count);
    }
}
