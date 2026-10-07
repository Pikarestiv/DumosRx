<?php

namespace Tests\Feature\Admin;

use App\Models\ActivityLog;
use App\Models\PaymentTransaction;
use App\Models\Store;
use App\Models\Subscription;
use App\Models\SyncFailure;
use App\Models\SystemConfig;
use App\Models\User;
use App\Services\Admin\AdminActivityFeedService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class AdminActivityFeedTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        SystemConfig::setVal('subscription_plans', ['grace_period_days' => 3]);
    }

    private function service(): AdminActivityFeedService
    {
        return app(AdminActivityFeedService::class);
    }

    private function admin(string $role): User
    {
        return User::create([
            'first_name' => 'Platform',
            'last_name' => 'Tester',
            'email' => $role.'-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => $role,
        ]);
    }

    private function owner(): User
    {
        $owner = User::create([
            'first_name' => 'Owner',
            'last_name' => 'Test',
            'email' => 'owner-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        Store::create([
            'user_id' => $owner->id,
            'name' => 'Store '.uniqid(),
            'device_id' => 'DESKTOP-'.strtoupper(uniqid()),
            'currency' => 'NGN',
        ]);

        return $owner;
    }

    private function adminAction(User $actor, \DateTimeInterface $at): void
    {
        $log = ActivityLog::create([
            'user_id' => $actor->id,
            'action' => 'TEST_ACTION',
            'description' => 'did a thing as '.$actor->role,
        ]);

        DB::table('activity_logs')->where('id', $log->id)
            ->update(['created_at' => $at->format('Y-m-d H:i:s')]);
    }

    private function syncFailure(User $owner, \DateTimeInterface $at): void
    {
        $failure = SyncFailure::create([
            'store_id' => $owner->stores->first()->id,
            'user_id' => $owner->id,
            'table_name' => 'sales',
            'record_id' => (string) \Illuminate\Support\Str::uuid(),
            'operation' => 'insert',
            'reason' => 'schema_mismatch',
        ]);

        DB::table('sync_failures')->where('id', $failure->id)
            ->update(['created_at' => $at->format('Y-m-d H:i:s')]);
    }

    private function payment(User $owner, \DateTimeInterface $at): void
    {
        $subscription = Subscription::create([
            'user_id' => $owner->id,
            'plan_name' => 'premium',
            'status' => 'active',
            'is_trial' => false,
            'start_date' => now()->subMonth(),
            'end_date' => now()->addMonth(),
            'license_key' => 'LIC-'.uniqid(),
        ]);

        $txn = PaymentTransaction::create([
            'subscription_id' => $subscription->id,
            'provider' => 'paystack',
            'provider_reference' => 'ref-'.uniqid(),
            'amount' => 25000,
            'currency' => 'NGN',
            'status' => 'success',
        ]);

        DB::table('payment_transactions')->where('id', $txn->id)
            ->update(['created_at' => $at->format('Y-m-d H:i:s')]);
    }

    public function test_it_merges_every_source_into_one_stream_newest_first(): void
    {
        $viewer = $this->admin('super_admin');
        $owner = $this->owner();

        $this->adminAction($viewer, now()->subMinutes(30));
        $this->syncFailure($owner, now()->subMinutes(20));
        $this->payment($owner, now()->subMinutes(10));

        $result = $this->service()->feed($viewer, null, null, 50);
        $events = $result['events'];
        $types = array_column($events, 'type');

        foreach (['admin_action', 'sync_failure', 'payment'] as $expected) {
            $this->assertContains($expected, $types, "the feed must include {$expected} events");
        }

        $timestamps = array_column($events, 'at');
        $sorted = $timestamps;
        rsort($sorted);
        $this->assertSame($sorted, $timestamps, 'the stream must be newest first');

        $this->assertSame('payment', $types[0], 'the most recent event was the payment');
    }

    public function test_a_type_filter_returns_only_that_type(): void
    {
        $viewer = $this->admin('super_admin');
        $owner = $this->owner();

        $this->adminAction($viewer, now()->subMinutes(30));
        $this->syncFailure($owner, now()->subMinutes(20));

        $result = $this->service()->feed($viewer, 'sync_failure', null, 50);

        $this->assertCount(1, $result['events']);
        $this->assertSame('sync_failure', $result['events'][0]['type']);
    }

    /**
     * The whole reason the feed is cursor-paginated rather than offset-paginated:
     * "skip 20" means something different in every source, so a page boundary
     * would silently drop or repeat events.
     */
    public function test_the_cursor_paginates_with_no_duplicates_and_no_gaps(): void
    {
        $viewer = $this->admin('super_admin');
        $owner = $this->owner();

        for ($i = 1; $i <= 9; $i++) {
            $at = now()->subMinutes($i * 5);
            $i % 2 === 0 ? $this->adminAction($viewer, $at) : $this->syncFailure($owner, $at);
        }

        $firstPage = $this->service()->feed($viewer, null, null, 4);
        $this->assertCount(4, $firstPage['events']);
        $this->assertNotNull($firstPage['next_cursor']);

        $secondPage = $this->service()->feed($viewer, null, $firstPage['next_cursor'], 4);
        $thirdPage = $this->service()->feed($viewer, null, $secondPage['next_cursor'], 4);

        $seen = array_merge(
            array_column($firstPage['events'], 'id'),
            array_column($secondPage['events'], 'id'),
            array_column($thirdPage['events'], 'id'),
        );

        $this->assertCount(9, $seen, 'every event must appear exactly once across the three pages');
        $this->assertCount(9, array_unique($seen), 'no event may appear on two pages');
    }

    /**
     * Phases 3 and 4 both restricted revenue to super_admin, and
     * RegisteredStoreSummary already withholds money from platform_admin.
     * The feed must not be the hole in that.
     */
    public function test_a_platform_admin_never_receives_a_payment_event(): void
    {
        $viewer = $this->admin('platform_admin');
        $owner = $this->owner();

        $this->payment($owner, now()->subMinutes(10));
        $this->adminAction($viewer, now()->subMinutes(5));

        $result = $this->service()->feed($viewer, null, null, 50);

        $this->assertNotContains('payment', array_column($result['events'], 'type'));
        $this->assertNotContains('payment', $result['available_types']);
    }

    /** An empty list would imply "no payments happened", which is a different claim. */
    public function test_asking_for_an_unavailable_type_is_refused_not_silently_empty(): void
    {
        $this->expectException(\InvalidArgumentException::class);

        $this->service()->feed($this->admin('platform_admin'), 'payment', null, 50);
    }

    public function test_super_admin_sees_every_type_as_available(): void
    {
        $types = $this->service()->feed($this->admin('super_admin'), null, null, 50)['available_types'];

        $this->assertEqualsCanonicalizing(
            ['admin_action', 'sync_failure', 'subscription', 'payment'],
            $types
        );
    }

    public function test_the_limit_is_capped(): void
    {
        $viewer = $this->admin('super_admin');

        for ($i = 1; $i <= 60; $i++) {
            $this->adminAction($viewer, now()->subMinutes($i));
        }

        $this->assertCount(50, $this->service()->feed($viewer, null, null, 999)['events']);
    }

    /** A subscription whose end_date has not arrived has not ended. */
    public function test_a_future_end_date_is_not_an_event_that_happened(): void
    {
        $viewer = $this->admin('super_admin');
        $owner = $this->owner();

        Subscription::create([
            'user_id' => $owner->id,
            'plan_name' => 'premium',
            'status' => 'active',
            'is_trial' => false,
            'start_date' => now()->subDays(5),
            'end_date' => now()->addMonth(),
            'license_key' => 'LIC-'.uniqid(),
        ]);

        $events = $this->service()->feed($viewer, 'subscription', null, 50)['events'];
        $titles = array_column($events, 'title');

        $this->assertCount(1, $events, 'only the start has happened');
        $this->assertStringContainsStringIgnoringCase('started', $titles[0]);
    }

    public function test_a_past_end_date_is_reported_as_an_ended_event(): void
    {
        $viewer = $this->admin('super_admin');
        $owner = $this->owner();

        Subscription::create([
            'user_id' => $owner->id,
            'plan_name' => 'premium',
            'status' => 'active',
            'is_trial' => false,
            'start_date' => now()->subMonths(2),
            'end_date' => now()->subDays(5),
            'license_key' => 'LIC-'.uniqid(),
        ]);

        $events = $this->service()->feed($viewer, 'subscription', null, 50)['events'];

        $this->assertCount(2, $events);
        $this->assertStringContainsStringIgnoringCase('ended', $events[0]['title']);
    }

    public function test_an_unknown_type_is_rejected(): void
    {
        $this->expectException(\InvalidArgumentException::class);

        $this->service()->feed($this->admin('super_admin'), 'volcano', null, 50);
    }

    /**
     * Found in review. Each source is asked for at most `limit` rows, so
     * `count($events) > $limit` can never be true when a single source holds
     * the newest events — the feed reported "no more" after page 1. The
     * existing pagination test only passed because it alternated two sources,
     * making the merged set 2x limit.
     */
    public function test_a_single_source_stream_still_paginates(): void
    {
        $viewer = $this->admin('super_admin');

        for ($i = 1; $i <= 12; $i++) {
            $this->adminAction($viewer, now()->subMinutes($i));
        }

        $first = $this->service()->feed($viewer, 'admin_action', null, 5);

        $this->assertCount(5, $first['events']);
        $this->assertNotNull($first['next_cursor'], 'a filtered stream must still offer a next page');

        $second = $this->service()->feed($viewer, 'admin_action', $first['next_cursor'], 5);
        $this->assertCount(5, $second['events']);

        $ids = array_merge(array_column($first['events'], 'id'), array_column($second['events'], 'id'));
        $this->assertCount(10, array_unique($ids));
    }

    /**
     * Found in review. The cursor carried only the timestamp and the next
     * fetch was strictly `<`, so events sharing the boundary timestamp were
     * unreachable. activity_logs are second-granular and a bulk action writes
     * many rows in the same second.
     */
    public function test_events_sharing_the_boundary_timestamp_are_not_lost(): void
    {
        $viewer = $this->admin('super_admin');
        $sameMoment = now()->subMinutes(5);

        for ($i = 0; $i < 7; $i++) {
            $this->adminAction($viewer, $sameMoment);
        }

        $seen = [];
        $cursor = null;

        for ($page = 0; $page < 5; $page++) {
            $result = $this->service()->feed($viewer, 'admin_action', $cursor, 3);
            $seen = array_merge($seen, array_column($result['events'], 'id'));
            $cursor = $result['next_cursor'];
            if ($cursor === null) {
                break;
            }
        }

        $this->assertCount(7, array_unique($seen), 'every same-second event must be reachable exactly once');
    }

    /** The feed must not become the way around the activity-log tiering. */
    public function test_the_feed_hides_super_admin_actions_from_an_operator(): void
    {
        $superAdmin = $this->admin('super_admin');
        $operator = $this->admin('platform_admin');

        $this->adminAction($superAdmin, now()->subMinutes(5));
        $this->adminAction($operator, now()->subMinutes(4));

        $titles = array_column($this->service()->feed($operator, 'admin_action', null, 50)['events'], 'detail');

        $this->assertNotEmpty($titles);
        foreach ($titles as $detail) {
            $this->assertStringNotContainsString('super_admin', (string) $detail);
        }
    }

    public function test_the_feed_shows_super_admin_actions_to_a_super_admin(): void
    {
        $superAdmin = $this->admin('super_admin');
        $this->adminAction($superAdmin, now()->subMinutes(5));

        $details = array_column($this->service()->feed($superAdmin, 'admin_action', null, 50)['events'], 'detail');

        $this->assertTrue(
            collect($details)->contains(fn ($d) => str_contains((string) $d, 'super_admin')),
            'a super admin must still see their own and their peers\' actions'
        );
    }
}
