<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\SyncFailure;
use App\Models\SyncHealthDaily;
use App\Models\SystemConfig;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * PG-18. The Phase 2 tally only counted pushes that reached the recording
 * hook, which sits after the outer commit. Two exits never got there:
 * `validateSync()` refusing outright, and the outer catch returning 500.
 *
 * A store whose plan lost `cloud_sync`, or whose every push dies on an
 * error, therefore contributed ZERO rows — so the platform success rate read
 * 100% while that store synced nothing. These are pushes that reached the
 * server and were lost there, which is precisely what an operator checking a
 * sync metric is looking for.
 */
class SyncPushRefusedAttemptIsRecordedTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private Store $store;

    protected function setUp(): void
    {
        parent::setUp();

        $this->owner = User::create([
            'first_name' => 'Owner', 'last_name' => 'Test',
            'email' => 'owner-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'), 'role' => 'store_owner',
        ]);

        $this->store = Store::create([
            'user_id' => $this->owner->id,
            'name' => 'Refusal Store',
            'device_id' => 'DESKTOP-REFUSED',
            'currency' => 'NGN',
        ]);

        $this->withoutMiddleware();
    }

    private function planWithThrottle(int $intervalMinutes): void
    {
        SystemConfig::setVal('subscription_plans', [
            'tiers' => [
                'free' => [
                    'features' => ['cloud_sync' => true],
                    'limits' => ['stores' => -1, 'sync_interval' => $intervalMinutes],
                ],
            ],
        ]);
    }

    /**
     * A-178. Throttling is the server working as designed — "come back
     * shortly", not "these rows were rejected". A device paging a backlog
     * through a plan throttle booked every row of every refused batch as a
     * refusal, which is how a healthy store read `271 accepted · 1450
     * refused`. The attempt still counts (PG-18) and the reason is still
     * recorded for the operator; it just no longer poisons the success rate.
     */
    public function test_a_throttled_push_does_not_count_its_rows_as_refusals(): void
    {
        $this->planWithThrottle(30);
        $this->store->forceFill([
            'last_sync_at' => now()->subMinutes(2),
            'last_sync_run_id' => null,
            'last_sync_run_started_at' => null,
        ])->save();

        $this->pushRows(40)->assertStatus(429);

        $tally = SyncHealthDaily::where('store_id', $this->store->id)->first();

        $this->assertNotNull($tally, 'the attempt itself must still count (PG-18)');
        $this->assertSame(1, (int) $tally->pushes);
        $this->assertSame(0, (int) $tally->changes_accepted);
        $this->assertSame(
            0,
            (int) $tally->changes_refused,
            'a deferred push rejected nothing, so it must not inflate changes_refused',
        );

        $failure = SyncFailure::where('store_id', $this->store->id)->first();
        $this->assertNotNull($failure, 'the operator must still see that it was throttled');
        $this->assertSame('sync_throttled', $failure->reason);
    }

    /** A server error really is a failure and must keep counting as one. */
    public function test_a_server_error_still_counts_as_a_refusal(): void
    {
        $recorder = app(\App\Services\Sync\SyncFailureRecorder::class);
        $recorder->recordRejectedPush($this->store->id, $this->owner->id, 'server_error', 7);

        $tally = SyncHealthDaily::where('store_id', $this->store->id)->first();
        $this->assertSame(7, (int) $tally->changes_refused);
    }

    private function pushRows(int $count): \Illuminate\Testing\TestResponse
    {
        $changes = [];
        for ($i = 0; $i < $count; $i++) {
            $changes[] = [
                'table_name' => 'customers',
                'record_id' => (string) \Illuminate\Support\Str::uuid(),
                'operation' => 'INSERT',
                'payload' => ['name' => 'Someone', 'store_id' => $this->store->id],
            ];
        }

        return $this->actingAs($this->owner)
            ->withHeader('X-Store-Id', $this->store->id)
            ->withHeader('X-Device-Id', 'DESKTOP-REFUSED')
            ->postJson('/api/v1/app/sync/push', ['changes' => $changes]);
    }

    private function planWithCloudSync(bool $enabled): void
    {
        SystemConfig::setVal('subscription_plans', [
            'tiers' => [
                'free' => [
                    'features' => ['cloud_sync' => $enabled],
                    'limits' => ['stores' => -1],
                ],
            ],
        ]);
    }

    private function push(): \Illuminate\Testing\TestResponse
    {
        return $this->actingAs($this->owner)
            ->withHeader('X-Store-Id', $this->store->id)
            ->withHeader('X-Device-Id', 'DESKTOP-REFUSED')
            ->postJson('/api/v1/app/sync/push', [
                'changes' => [[
                    'table_name' => 'customers',
                    'record_id' => (string) \Illuminate\Support\Str::uuid(),
                    'operation' => 'INSERT',
                    'payload' => ['name' => 'Someone', 'store_id' => $this->store->id],
                ]],
            ]);
    }

    public function test_a_plan_refusal_is_counted_rather_than_vanishing(): void
    {
        $this->planWithCloudSync(false);

        $this->push()->assertStatus(403);

        $tally = SyncHealthDaily::where('store_id', $this->store->id)->first();

        $this->assertNotNull($tally, 'a refused push must still count as an attempt');
        $this->assertSame(1, $tally->pushes);
        $this->assertSame(0, $tally->changes_accepted);
        $this->assertGreaterThan(0, $tally->changes_refused);
    }

    public function test_the_refusal_reason_is_recorded_for_the_store(): void
    {
        $this->planWithCloudSync(false);

        $this->push()->assertStatus(403);

        $failure = SyncFailure::where('store_id', $this->store->id)->first();

        $this->assertNotNull($failure, 'the operator needs to see WHY the store syncs nothing');
        $this->assertSame('sync_disabled', $failure->reason);
    }

    /** A push that reaches the hook must still tally exactly once, not twice. */
    public function test_a_normal_push_is_not_double_counted(): void
    {
        $this->planWithCloudSync(true);

        $this->push()->assertOk();

        $tally = SyncHealthDaily::where('store_id', $this->store->id)->first();

        // The point is that a reaching-the-hook push is counted exactly
        // once, not that this particular fixture row was accepted.
        $this->assertNotNull($tally);
        $this->assertSame(1, (int) $tally->pushes);
    }

    /**
     * The case the \Throwable widening was for. An \Error inside the
     * per-change block leaves the outer transaction open, so a single
     * rollBack() unwinds only the savepoint and the recording below is
     * written into a transaction that is never committed — recording
     * nothing, which is the bug PG-18 described.
     */
    public function test_a_push_that_dies_outright_still_records_the_attempt(): void
    {
        $this->planWithCloudSync(true);

        \Illuminate\Support\Facades\Event::listen('eloquent.creating: '.\App\Models\Customer::class, function () {
            throw new \TypeError('simulated fatal inside the change loop');
        });

        $entryLevel = \Illuminate\Support\Facades\DB::transactionLevel();

        $this->push()->assertStatus(500);

        $this->assertSame(
            $entryLevel,
            \Illuminate\Support\Facades\DB::transactionLevel(),
            'the push must unwind its own transactions and no more'
        );

        $tally = SyncHealthDaily::where('store_id', $this->store->id)->first();
        $this->assertNotNull($tally, 'a push that died must still count as an attempt');
        $this->assertSame(1, (int) $tally->pushes);
    }
}
