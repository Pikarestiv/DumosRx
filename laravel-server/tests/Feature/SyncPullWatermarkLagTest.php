<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * A-282. The pull stamped its watermark with a bare `now()`, taken before its
 * own SELECTs ran, so a pull starting inside another device's open push
 * transaction saw nothing and then stamped past the rows that push was about
 * to commit. Rationale in laravel-server/AGENTS.md, "The pull watermark lags".
 */
class SyncPullWatermarkLagTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private Store $store;

    protected function setUp(): void
    {
        parent::setUp();

        Schema::disableForeignKeyConstraints();

        $this->owner = User::create([
            'first_name' => 'Watermark',
            'last_name' => 'Owner',
            'email' => 'watermark@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'admin',
        ]);
        $this->store = Store::create([
            'user_id' => $this->owner->id,
            'name' => 'Watermark Store',
            'slug' => 'watermark-store',
            'device_id' => 'WEB-WATERMARK',
            'currency' => 'NGN',
        ]);
        $this->owner->update(['store_id' => $this->store->id]);

        \App\Models\SystemConfig::setVal('subscription_plans', [
            'tiers' => [
                'free' => [
                    'features' => ['cloud_sync' => true],
                    'limits' => ['stores' => -1],
                ],
            ],
        ]);

        $this->withoutMiddleware();
    }

    private function pull(array $lastSynced = [])
    {
        return $this->actingAs($this->owner)->postJson('/api/v1/app/sync/pull', [
            'setup' => true,
            'last_synced' => $lastSynced,
        ]);
    }

    private function seedCategory(string $id, string $syncedAt): void
    {
        DB::table('categories')->insert([
            'id' => $id,
            'store_id' => $this->store->id,
            'name' => 'Cosmetics-'.$id,
            '_version' => 1,
            '_synced_at' => $syncedAt,
            'created_at' => now()->subDays(5),
            'updated_at' => now()->subDays(5),
        ]);
    }

    public function test_the_returned_watermark_lags_far_enough_to_cover_an_in_flight_push()
    {
        $response = $this->pull();
        $response->assertStatus(200);

        $stamped = \Carbon\Carbon::parse($response->json('server_timestamp'));

        $this->assertGreaterThanOrEqual(
            \App\Http\Controllers\Api\App\SyncController::PULL_WATERMARK_LAG_SECONDS,
            $stamped->diffInSeconds(now()),
            'The pull watermark must be older than the longest push that could still be open.',
        );
    }

    /**
     * $secondsBeforeUnlagged is measured from the instant an unlagged pull
     * would have stamped, which is the watermark plus the lag — so 0 is the
     * second-precision hole and 5 is a push that was already open.
     */
    private function assertOfferedAfter(string $id, int $secondsBeforeUnlagged, string $watermark, string $because): void
    {
        $unlagged = \Carbon\Carbon::parse($watermark)
            ->addSeconds(\App\Http\Controllers\Api\App\SyncController::PULL_WATERMARK_LAG_SECONDS);

        $this->seedCategory($id, $unlagged->subSeconds($secondsBeforeUnlagged)->format('Y-m-d H:i:s'));

        $next = $this->pull(['categories' => $watermark]);
        $next->assertStatus(200);

        $this->assertNotNull(
            collect($next->json('changes.categories'))->firstWhere('id', $id),
            $because,
        );
    }

    /**
     * `_synced_at` is a second-precision `timestamp` and the cursor is a
     * strict `>`, so a row stamped in the very second the pull chose as its
     * watermark is excluded — and never matches again.
     */
    public function test_a_row_stamped_in_the_watermarks_own_second_is_still_offered()
    {
        $watermark = $this->pull()->json('server_timestamp');

        $this->assertOfferedAfter(
            'cat-same-second',
            0,
            $watermark,
            'A row stamped in the watermark\'s own second must not be excluded for ever.',
        );
    }

    /**
     * The transaction case: a push that began before this pull stamps its rows
     * with its own `now()` and commits them afterwards, so the pull cannot see
     * them although their `_synced_at` is already behind its watermark.
     */
    public function test_a_row_committed_after_the_pull_but_stamped_before_it_is_still_offered()
    {
        $watermark = $this->pull()->json('server_timestamp');

        $this->assertOfferedAfter(
            'cat-in-flight',
            5,
            $watermark,
            'A row an open push committed after this pull ran must still reach this device.',
        );
    }

    public function test_a_row_older_than_the_lag_is_not_re_offered_for_ever()
    {
        $this->seedCategory('cat-settled', now()->subHour()->toDateTimeString());

        $watermark = $this->pull()->json('server_timestamp');

        $this->assertNull(
            collect($this->pull(['categories' => $watermark])->json('changes.categories'))
                ->firstWhere('id', 'cat-settled'),
            'The lag is a trailing window, not a disabled cursor.',
        );
    }
}
