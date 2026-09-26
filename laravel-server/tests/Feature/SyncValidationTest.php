<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Coverage for SyncController::validateSync() - the plan-gating logic shared
 * by push() and pull() (cloud_sync feature flag, sync-interval throttle,
 * store-count limit). Had zero dedicated test coverage before this file;
 * SyncEndpointTest.php/SyncSchemaDriftTest.php always pass `setup: true`
 * (push) or an empty last_synced (pull), which bypasses every one of these
 * checks via the isSetup escape hatch - none of them ever actually exercised
 * this method.
 */
class SyncValidationTest extends TestCase
{
    use RefreshDatabase;

    protected User $owner;
    protected Store $store;

    protected function setUp(): void
    {
        parent::setUp();

        \Illuminate\Support\Facades\Schema::disableForeignKeyConstraints();

        $this->owner = User::create([
            'first_name' => 'Owner', 'last_name' => 'User',
            'email' => 'validation-owner@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $this->store = Store::create([
            'user_id' => $this->owner->id,
            'name' => 'Validation Test Store',
            'store_slug' => 'validation-test-store',
            'device_id' => 'WEB-VALIDATION-TEST',
        ]);

        $this->withoutMiddleware();

        \Illuminate\Support\Facades\Schema::enableForeignKeyConstraints();
    }

    private function push(array $extra = [])
    {
        return $this->actingAs($this->owner)->postJson('/api/v1/app/sync/push', array_merge([
            // 'changes' => [] fails the endpoint's own 'required' validation
            // (Laravel's required rule rejects empty arrays) - a single
            // change against an unrecognized table is a safe no-op: it's
            // skipped by getModelForTable() before any payload processing
            // even runs, so it can't itself fail or trip any other check.
            'changes' => [
                ['table_name' => 'not_a_real_table', 'operation' => 'INSERT', 'record_id' => 'x', 'payload' => null],
            ],
        ], $extra));
    }

    private function pull(array $extra = [])
    {
        return $this->actingAs($this->owner)->postJson('/api/v1/app/sync/pull', array_merge([
            'last_synced' => ['products' => now()->toIso8601String()],
        ], $extra));
    }

    public function test_push_is_rejected_when_the_plan_disables_cloud_sync()
    {
        \App\Models\SystemConfig::setVal('subscription_plans', [
            'tiers' => [
                'free' => ['features' => ['cloud_sync' => false], 'limits' => ['stores' => -1]],
            ],
        ]);
        // Already synced once, so this isn't treated as first-time setup.
        $this->store->update(['last_sync_at' => now()->subDay()]);

        $response = $this->push();

        $response->assertStatus(403);
        $response->assertJson(['success' => false, 'code' => 'SYNC_DISABLED']);
    }

    public function test_a_first_time_setup_push_is_allowed_even_when_the_plan_disables_cloud_sync()
    {
        \App\Models\SystemConfig::setVal('subscription_plans', [
            'tiers' => [
                'free' => ['features' => ['cloud_sync' => false], 'limits' => ['stores' => -1]],
            ],
        ]);
        // last_sync_at is still null (never synced before) - the isSetup
        // escape hatch must let a brand-new device complete its very first
        // sync even on a plan that otherwise disables cloud sync entirely.

        $response = $this->push(['setup' => true]);

        $response->assertStatus(200);
    }

    public function test_push_is_throttled_before_the_plans_sync_interval_has_elapsed()
    {
        \App\Models\SystemConfig::setVal('subscription_plans', [
            'tiers' => [
                'free' => [
                    'features' => ['cloud_sync' => true],
                    'limits' => ['stores' => -1, 'sync_interval' => 60],
                ],
            ],
        ]);
        $this->store->update(['last_sync_at' => now()->subMinutes(5)]);

        $response = $this->push();

        $response->assertStatus(429);
        $response->assertJson(['success' => false, 'code' => 'SYNC_THROTTLED']);
    }

    public function test_the_manual_flag_bypasses_the_sync_interval_throttle()
    {
        \App\Models\SystemConfig::setVal('subscription_plans', [
            'tiers' => [
                'free' => [
                    'features' => ['cloud_sync' => true],
                    'limits' => ['stores' => -1, 'sync_interval' => 60],
                ],
            ],
        ]);
        $this->store->update(['last_sync_at' => now()->subMinutes(5)]);

        $response = $this->push(['manual' => true]);

        $response->assertStatus(200);
    }

    public function test_push_is_allowed_once_the_sync_interval_has_fully_elapsed()
    {
        \App\Models\SystemConfig::setVal('subscription_plans', [
            'tiers' => [
                'free' => [
                    'features' => ['cloud_sync' => true],
                    'limits' => ['stores' => -1, 'sync_interval' => 60],
                ],
            ],
        ]);
        $this->store->update(['last_sync_at' => now()->subMinutes(61)]);

        $response = $this->push();

        $response->assertStatus(200);
    }

    public function test_sync_is_rejected_for_a_store_beyond_the_plans_store_limit()
    {
        \App\Models\SystemConfig::setVal('subscription_plans', [
            'tiers' => [
                'free' => ['features' => ['cloud_sync' => true], 'limits' => ['stores' => 1]],
            ],
        ]);
        // A second store owned by the same user, created after the first -
        // the plan's limit=1 means only the earliest-created store stays
        // allowed to sync.
        $secondStore = Store::create([
            'user_id' => $this->owner->id,
            'name' => 'Second Store Over Limit',
            'store_slug' => 'second-store-over-limit',
            'device_id' => 'WEB-SECOND-OVER-LIMIT',
        ]);
        $staff = User::create([
            'first_name' => 'Second', 'last_name' => 'Store Staff',
            'email' => 'second-store-staff@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'sales_staff',
            'store_id' => $secondStore->id,
        ]);

        $response = $this->actingAs($staff)->postJson('/api/v1/app/sync/push', ['changes' => []]);

        $response->assertStatus(403);
        $response->assertJson(['success' => false, 'code' => 'STORE_LIMIT_EXCEEDED']);
    }

    public function test_pull_is_rejected_when_the_plan_disables_cloud_sync_and_it_is_not_a_first_sync()
    {
        \App\Models\SystemConfig::setVal('subscription_plans', [
            'tiers' => [
                'free' => ['features' => ['cloud_sync' => false], 'limits' => ['stores' => -1]],
            ],
        ]);
        $this->store->update(['last_sync_at' => now()->subDay()]);

        // A non-empty last_synced means this isn't the isSetup escape hatch.
        $response = $this->pull();

        $response->assertStatus(403);
        $response->assertJson(['success' => false, 'code' => 'SYNC_DISABLED']);
    }

    /**
     * Regression test for a real gap caught in review: unlike push's
     * `setup` flag (corroborated against store.last_sync_at, see push()'s
     * own isSetup computation), pull's isSetup used to be inferred purely
     * from "last_synced is empty" with no equivalent check — wrongly
     * assumed un-spoofable on the theory that only a device's genuine
     * first-ever sync would ever send one. Any device can trivially
     * reproduce an empty last_synced by clearing its own local sync-cursor
     * state (a real, shipped recovery feature - forceFullResync() - and
     * just as easy without it), which would have been a repeatable,
     * unlimited bypass of both the cloud_sync gate and the interval
     * throttle for any store, on any plan, at any time.
     */
    public function test_pull_with_empty_last_synced_is_still_gated_once_the_store_has_already_synced_before()
    {
        \App\Models\SystemConfig::setVal('subscription_plans', [
            'tiers' => [
                'free' => ['features' => ['cloud_sync' => false], 'limits' => ['stores' => -1]],
            ],
        ]);
        $this->store->update(['last_sync_at' => now()->subDay()]);

        // Empty last_synced - exactly what a device sends right after
        // clearing its local sync cursor (e.g. forceFullResync()) - must
        // NOT be honored as a genuine first-ever sync once the STORE
        // itself has already synced before.
        $response = $this->pull(['last_synced' => []]);

        $response->assertStatus(403);
        $response->assertJson(['success' => false, 'code' => 'SYNC_DISABLED']);
    }

    /**
     * Regression test for the subscription-status pull bug: the client's
     * privileged syncSubscriptionStatus() call sends `?setup=1` with a
     * `last_synced: { stores: "" }` body specifically to bypass the
     * cloud_sync gate for this one call, on exactly the tiers (free/
     * lapsed/suspended) that need their tier corrected — but the server
     * used to compute isSetup purely from whether last_synced was empty,
     * ignoring the `setup` param entirely, so this call was always rejected
     * with SYNC_DISABLED on those same tiers.
     */
    public function test_pull_setup_override_bypasses_gate_for_the_stores_only_subscription_status_pull()
    {
        \App\Models\SystemConfig::setVal('subscription_plans', [
            'tiers' => [
                'free' => ['features' => ['cloud_sync' => false], 'limits' => ['stores' => -1]],
            ],
        ]);
        $this->store->update(['last_sync_at' => now()->subDay()]);

        $response = $this->actingAs($this->owner)
            ->postJson('/api/v1/app/sync/pull?setup=1', ['last_synced' => ['stores' => '']]);

        $response->assertStatus(200);
        // The override must ALSO scope pull()'s own table fetching down to
        // just `stores` — otherwise the gate override would double as a
        // full initial sync of every table for an account whose plan
        // explicitly disables cloud sync.
        $response->assertJsonStructure(['changes' => ['stores']]);
        $response->assertJsonMissingPath('changes.products');
        $response->assertJsonMissingPath('changes.customers');
    }

    /**
     * The `setup` override above must NOT become a general escape hatch: a
     * request naming any other table (even alongside `stores`) is a real
     * sync, not this one narrow privileged call, and must still be gated
     * normally.
     */
    public function test_pull_setup_param_does_not_bypass_gate_for_a_normal_multi_table_pull()
    {
        \App\Models\SystemConfig::setVal('subscription_plans', [
            'tiers' => [
                'free' => ['features' => ['cloud_sync' => false], 'limits' => ['stores' => -1]],
            ],
        ]);
        $this->store->update(['last_sync_at' => now()->subDay()]);

        $response = $this->actingAs($this->owner)
            ->postJson('/api/v1/app/sync/pull?setup=1', [
                'last_synced' => ['stores' => '', 'products' => now()->toIso8601String()],
            ]);

        $response->assertStatus(403);
        $response->assertJson(['success' => false, 'code' => 'SYNC_DISABLED']);
    }

    public function test_a_super_admin_bypasses_all_sync_gating()
    {
        \App\Models\SystemConfig::setVal('subscription_plans', [
            'tiers' => [
                'free' => ['features' => ['cloud_sync' => false], 'limits' => ['stores' => 0]],
            ],
        ]);

        $superAdmin = User::create([
            'first_name' => 'Super', 'last_name' => 'Admin',
            'email' => 'super-validation@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'super_admin',
        ]);

        $response = $this->actingAs($superAdmin)->postJson('/api/v1/app/sync/push', [
            'changes' => [
                ['table_name' => 'not_a_real_table', 'operation' => 'INSERT', 'record_id' => 'x', 'payload' => null],
            ],
        ]);

        $response->assertStatus(200);
    }

    /**
     * Regression: `setup` used to be trusted as-is on every push, with no
     * server-side corroboration that this was genuinely a device's first
     * sync — a free-tier account could append `setup=1` to every request
     * forever and permanently skip both the cloud_sync feature gate and the
     * interval throttle. It's now only honored while the store has never
     * actually completed a sync (last_sync_at null); once a real sync has
     * landed, claiming `setup=1` again must fall through to normal gating.
     */
    public function test_setup_flag_no_longer_bypasses_gating_once_a_real_sync_has_happened()
    {
        \App\Models\SystemConfig::setVal('subscription_plans', [
            'tiers' => [
                'free' => ['features' => ['cloud_sync' => false], 'limits' => ['stores' => -1]],
            ],
        ]);
        $this->store->update(['last_sync_at' => now()->subDay()]);

        $response = $this->push(['setup' => true]);

        $response->assertStatus(403);
        $response->assertJson(['success' => false, 'code' => 'SYNC_DISABLED']);
    }

    /**
     * Regression: the store-limit check resolved the store to validate via
     * `$user->store_id ?? Store::where('user_id', ...)->value('id')`,
     * ignoring the X-Store-Id header that push()/pull() actually use to
     * pick which store gets written. A multi-store owner over their plan's
     * limit could send X-Store-Id for a disallowed store; this check would
     * validate their (allowed) default store instead and let the request
     * through, while push()/pull() went on to write the disallowed store.
     */
    public function test_store_limit_check_validates_the_store_requested_via_x_store_id_header()
    {
        \App\Models\SystemConfig::setVal('subscription_plans', [
            'tiers' => [
                'free' => ['features' => ['cloud_sync' => true], 'limits' => ['stores' => 1]],
            ],
        ]);
        // Owner's earliest-created store ($this->store) stays allowed under
        // limit=1; this second store does not.
        $secondStore = Store::create([
            'user_id' => $this->owner->id,
            'name' => 'Second Store Via Header',
            'store_slug' => 'second-store-via-header',
            'device_id' => 'WEB-SECOND-VIA-HEADER',
        ]);

        $response = $this->actingAs($this->owner)
            ->withHeaders(['X-Store-Id' => $secondStore->id])
            ->postJson('/api/v1/app/sync/push', [
                'changes' => [
                    ['table_name' => 'not_a_real_table', 'operation' => 'INSERT', 'record_id' => 'x', 'payload' => null],
                ],
            ]);

        $response->assertStatus(403);
        $response->assertJson(['success' => false, 'code' => 'STORE_LIMIT_EXCEEDED']);
    }

    /**
     * Regression: the interval-throttle check resolved "the store being
     * synced" as `Store::where('user_id', $owner->id)->first() ??
     * Store::where('id', $user->store_id)->first()` -- an arbitrary
     * "first" store for a multi-store owner (whose own `store_id` is
     * null), not the store named by X-Store-Id / actually written to by
     * push(). A multi-store owner whose store A synced recently could get
     * store B's push wrongly 429'd against store A's last_sync_at, even
     * though store B itself had never synced.
     */
    public function test_sync_interval_throttle_is_scoped_to_the_store_requested_via_x_store_id_header()
    {
        \App\Models\SystemConfig::setVal('subscription_plans', [
            'tiers' => [
                'free' => ['features' => ['cloud_sync' => true], 'limits' => ['stores' => -1, 'sync_interval' => 60]],
            ],
        ]);

        // Store A (the owner's earliest-created store) synced a minute ago
        // -- well within the 60-minute interval.
        $this->store->update(['last_sync_at' => now()->subMinute()]);

        // Store B has never synced.
        $storeB = Store::create([
            'user_id' => $this->owner->id,
            'name' => 'Store B',
            'store_slug' => 'store-b-interval-test',
            'device_id' => 'WEB-STORE-B-INTERVAL',
        ]);

        $response = $this->actingAs($this->owner)
            ->withHeaders(['X-Store-Id' => $storeB->id])
            ->postJson('/api/v1/app/sync/push', [
                'changes' => [
                    ['table_name' => 'not_a_real_table', 'operation' => 'INSERT', 'record_id' => 'x', 'payload' => null],
                ],
            ]);

        $response->assertStatus(200);
    }

    /**
     * Regression: touchStoreLastSyncAt() had the exact same "arbitrary
     * first store" bug as the throttle check above -- a push to store B
     * was stamping store A's last_sync_at instead, which inverted the web
     * dashboard's per-store online/offline status for every multi-store
     * account.
     */
    public function test_push_stamps_last_sync_at_on_the_store_requested_via_x_store_id_header_only()
    {
        \App\Models\SystemConfig::setVal('subscription_plans', [
            'tiers' => [
                'free' => ['features' => ['cloud_sync' => true], 'limits' => ['stores' => -1, 'sync_interval' => 0]],
            ],
        ]);

        $this->store->update(['last_sync_at' => null]);
        $storeB = Store::create([
            'user_id' => $this->owner->id,
            'name' => 'Store B',
            'store_slug' => 'store-b-stamp-test',
            'device_id' => 'WEB-STORE-B-STAMP',
        ]);

        $response = $this->actingAs($this->owner)
            ->withHeaders(['X-Store-Id' => $storeB->id])
            ->postJson('/api/v1/app/sync/push', [
                'changes' => [
                    ['table_name' => 'not_a_real_table', 'operation' => 'INSERT', 'record_id' => 'x', 'payload' => null],
                ],
            ]);

        $response->assertStatus(200);
        $this->assertNotNull($storeB->fresh()->last_sync_at);
        $this->assertNull($this->store->fresh()->last_sync_at);
    }
}
