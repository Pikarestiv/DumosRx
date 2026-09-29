<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Coverage for the plan-tier sync-interval throttle once the client stopped
 * labelling every background sync as `manual=1` (see docs/FIXED_BUGS.md,
 * "A-5"). Two things are asserted here that SyncValidationTest does not:
 *
 * 1. The throttle really applies to a background (no `manual` flag) request
 *    - the shape every automatic sync now has.
 * 2. One push RUN can span many batch requests. The first batch stamps
 *    `last_sync_at`; every later batch of the same run arrives seconds
 *    later and must not be rejected with SYNC_THROTTLED just because zero
 *    minutes have passed. The client sends one `X-Sync-Run-Id` per sync()
 *    call for exactly this, and the server only honours it for a bounded
 *    window so a pinned run id can't become a permanent bypass.
 */
class SyncRunThrottleTest extends TestCase
{
    use RefreshDatabase;

    protected User $owner;
    protected Store $store;

    protected function setUp(): void
    {
        parent::setUp();

        \Illuminate\Support\Facades\Schema::disableForeignKeyConstraints();

        $this->owner = User::create([
            'first_name' => 'Run', 'last_name' => 'Owner',
            'email' => 'run-throttle-owner@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $this->store = Store::create([
            'user_id' => $this->owner->id,
            'name' => 'Run Throttle Store',
            'store_slug' => 'run-throttle-store',
            'device_id' => 'WEB-RUN-THROTTLE',
        ]);

        $this->withoutMiddleware();

        \Illuminate\Support\Facades\Schema::enableForeignKeyConstraints();

        \App\Models\SystemConfig::setVal('subscription_plans', [
            'tiers' => [
                'free' => [
                    'features' => ['cloud_sync' => true],
                    'limits' => ['stores' => -1, 'sync_interval' => 60],
                ],
            ],
        ]);
    }

    private function push(array $headers = [])
    {
        return $this->actingAs($this->owner)
            ->withHeaders($headers)
            ->postJson('/api/v1/app/sync/push', [
                // See SyncValidationTest::push() - an unrecognized table is
                // the safe no-op payload that still satisfies the endpoint's
                // own `changes` required-array validation.
                'changes' => [
                    ['table_name' => 'not_a_real_table', 'operation' => 'INSERT', 'record_id' => 'x', 'payload' => null],
                ],
            ]);
    }

    public function test_a_background_push_with_no_manual_flag_is_throttled_inside_the_interval()
    {
        $this->store->update(['last_sync_at' => now()->subMinutes(5)]);

        $response = $this->push(['X-Sync-Run-Id' => 'run-background-1']);

        $response->assertStatus(429);
        $response->assertJson(['success' => false, 'code' => 'SYNC_THROTTLED']);
    }

    public function test_later_batches_of_the_same_push_run_are_not_throttled_by_their_own_first_batch()
    {
        $this->store->update(['last_sync_at' => now()->subMinutes(61)]);

        // Batch 1: the interval has elapsed, so this one is allowed - and it
        // stamps last_sync_at on its way out.
        $this->push(['X-Sync-Run-Id' => 'run-multi-batch'])->assertStatus(200);
        $this->assertNotNull($this->store->fresh()->last_sync_at);

        // Batch 2 of the SAME run, a second later: minutesSinceLastSync is 0,
        // but this is the same run, not a new sync.
        $this->push(['X-Sync-Run-Id' => 'run-multi-batch'])->assertStatus(200);
        $this->push(['X-Sync-Run-Id' => 'run-multi-batch'])->assertStatus(200);
    }

    public function test_a_new_run_immediately_after_a_completed_one_is_still_throttled()
    {
        $this->store->update(['last_sync_at' => now()->subMinutes(61)]);

        $this->push(['X-Sync-Run-Id' => 'run-one'])->assertStatus(200);

        $response = $this->push(['X-Sync-Run-Id' => 'run-two']);

        $response->assertStatus(429);
        $response->assertJson(['code' => 'SYNC_THROTTLED']);
    }

    public function test_a_run_id_held_open_past_the_run_window_stops_exempting_anything()
    {
        $this->store->update(['last_sync_at' => now()->subMinutes(61)]);

        $this->push(['X-Sync-Run-Id' => 'run-pinned'])->assertStatus(200);

        // Same run id, but the run itself started longer ago than any real
        // push run can last - a pinned token must not become a standing
        // bypass of the plan's interval.
        // forceFill, not update(): these two columns are deliberately kept
        // out of $fillable so no client sync payload can ever set them.
        $store = $this->store->fresh();
        $store->forceFill(['last_sync_run_started_at' => now()->subMinutes(30)])->save();

        $response = $this->push(['X-Sync-Run-Id' => 'run-pinned']);

        $response->assertStatus(429);
        $response->assertJson(['code' => 'SYNC_THROTTLED']);
    }

    public function test_a_push_with_no_run_id_at_all_still_behaves_exactly_as_before()
    {
        $this->store->update(['last_sync_at' => now()->subMinutes(61)]);

        $this->push()->assertStatus(200);
        $this->push()->assertStatus(429);
    }
}
