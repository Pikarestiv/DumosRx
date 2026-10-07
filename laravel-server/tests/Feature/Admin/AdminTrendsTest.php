<?php

namespace Tests\Feature\Admin;

use App\Models\PaymentTransaction;
use App\Models\Store;
use App\Models\Subscription;
use App\Models\SystemConfig;
use App\Models\User;
use App\Services\Admin\AdminTrendsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class AdminTrendsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        SystemConfig::setVal('subscription_plans', ['grace_period_days' => 3]);
    }

    private function service(): AdminTrendsService
    {
        return app(AdminTrendsService::class);
    }

    private function owner(): User
    {
        return User::create([
            'first_name' => 'Owner',
            'last_name' => 'Test',
            'email' => 'owner-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);
    }

    private function store(User $owner, array $attributes = []): Store
    {
        return Store::create(array_merge([
            'user_id' => $owner->id,
            'name' => 'Store '.uniqid(),
            'device_id' => 'DESKTOP-'.strtoupper(uniqid()),
            'currency' => 'NGN',
        ], $attributes));
    }

    private function subscribe(User $owner, array $attributes = []): Subscription
    {
        return Subscription::create(array_merge([
            'user_id' => $owner->id,
            'plan_name' => 'premium',
            'status' => 'active',
            'is_trial' => false,
            'start_date' => now(),
            'end_date' => now()->addMonth(),
            'license_key' => 'LIC-'.uniqid(),
        ], $attributes));
    }

    private function pay(Subscription $subscription, string $currency, float $amount, \DateTimeInterface $at): void
    {
        $txn = PaymentTransaction::create([
            'subscription_id' => $subscription->id,
            'provider' => 'paystack',
            'provider_reference' => 'ref-'.uniqid(),
            'amount' => $amount,
            'currency' => $currency,
            'status' => 'success',
        ]);

        DB::table('payment_transactions')->where('id', $txn->id)
            ->update(['created_at' => $at->format('Y-m-d H:i:s')]);
    }

    private function bucketFor(array $series, string $label): ?array
    {
        foreach ($series as $point) {
            if ($point['bucket'] === $label) {
                return $point;
            }
        }

        return null;
    }

    /**
     * A GROUP BY returns no row for an empty month, so the line would jump
     * straight from one month to the next as though the gap did not exist —
     * the chart lying about its own shape while every value in it is correct.
     */
    public function test_a_month_with_no_activity_is_zero_not_absent(): void
    {
        $owner = $this->owner();
        $this->pay($this->subscribe($owner), 'NGN', 5000, now()->subMonths(2)->startOfMonth()->addDays(3));

        $series = $this->service()->trends('6m')['cash_collected'];
        $lastMonth = now()->subMonth()->format('Y-m');

        $bucket = $this->bucketFor($series['points'], $lastMonth);

        $this->assertNotNull($bucket, "the empty month {$lastMonth} must be present, not omitted");
        $this->assertSame(0.0, $bucket['values']['NGN'] ?? 0.0);
    }

    public function test_the_window_covers_every_bucket_in_range(): void
    {
        $this->assertCount(6, $this->service()->trends('6m')['cash_collected']['points']);
        $this->assertCount(12, $this->service()->trends('12m')['cash_collected']['points']);
    }

    /** There is no exchange rate in this system, so there is no combined total. */
    public function test_currencies_are_reported_separately_and_never_summed(): void
    {
        $owner = $this->owner();
        $subscription = $this->subscribe($owner);
        $at = now()->subMonth()->startOfMonth()->addDays(2);

        $this->pay($subscription, 'NGN', 10000, $at);
        $this->pay($subscription, 'XAF', 3000, $at);

        $series = $this->service()->trends('6m')['cash_collected'];
        $bucket = $this->bucketFor($series['points'], now()->subMonth()->format('Y-m'));

        $this->assertSame(10000.0, $bucket['values']['NGN']);
        $this->assertSame(3000.0, $bucket['values']['XAF']);
        $this->assertArrayNotHasKey('total', $bucket);
        $this->assertEqualsCanonicalizing(['NGN', 'XAF'], $series['currencies']);
    }

    public function test_only_successful_payments_count_as_cash_collected(): void
    {
        $owner = $this->owner();
        $subscription = $this->subscribe($owner);
        $at = now()->subMonth()->startOfMonth()->addDays(2);

        $this->pay($subscription, 'NGN', 10000, $at);

        $failed = PaymentTransaction::create([
            'subscription_id' => $subscription->id,
            'provider' => 'paystack',
            'provider_reference' => 'ref-'.uniqid(),
            'amount' => 99999,
            'currency' => 'NGN',
            'status' => 'failed',
        ]);
        DB::table('payment_transactions')->where('id', $failed->id)
            ->update(['created_at' => $at->format('Y-m-d H:i:s')]);

        $bucket = $this->bucketFor(
            $this->service()->trends('6m')['cash_collected']['points'],
            now()->subMonth()->format('Y-m')
        );

        $this->assertSame(10000.0, $bucket['values']['NGN']);
    }

    /**
     * The Part 2 rule. A store that signed up in March and was deleted in
     * August still signed up in March; excluding soft-deleted stores would
     * make a past month shrink every time anyone deleted a store, so the
     * chart's history would change under the reader.
     */
    public function test_a_soft_deleted_store_still_counts_in_the_month_it_signed_up(): void
    {
        $owner = $this->owner();
        $store = $this->store($owner);
        $signedUp = now()->subMonth()->startOfMonth()->addDays(4);

        DB::table('stores')->where('id', $store->id)->update([
            'created_at' => $signedUp->format('Y-m-d H:i:s'),
            'deleted_at' => now()->format('Y-m-d H:i:s'),
        ]);

        $bucket = $this->bucketFor(
            $this->service()->trends('6m')['store_signups']['points'],
            now()->subMonth()->format('Y-m')
        );

        $this->assertSame(1, $bucket['values']['count']);
    }

    /** A demo store is not a signup. */
    public function test_demo_stores_are_excluded_from_signups(): void
    {
        $owner = $this->owner();
        $store = $this->store($owner, ['is_demo' => true]);
        $signedUp = now()->subMonth()->startOfMonth()->addDays(4);

        DB::table('stores')->where('id', $store->id)
            ->update(['created_at' => $signedUp->format('Y-m-d H:i:s')]);

        $bucket = $this->bucketFor(
            $this->service()->trends('6m')['store_signups']['points'],
            now()->subMonth()->format('Y-m')
        );

        $this->assertSame(0, $bucket['values']['count']);
    }

    /** Phase 3's row-vs-owner trap, applied to a time series. */
    public function test_new_paid_subscriptions_counts_owners_not_rows(): void
    {
        $owner = $this->owner();
        $this->store($owner);
        $at = now()->subMonth()->startOfMonth()->addDays(2);

        foreach ([1, 2, 3] as $ignored) {
            $this->subscribe($owner, ['start_date' => $at, 'end_date' => $at->copy()->addMonth()]);
        }

        $bucket = $this->bucketFor(
            $this->service()->trends('6m')['new_paid_subscriptions']['points'],
            now()->subMonth()->format('Y-m')
        );

        $this->assertSame(1, $bucket['values']['count'], 'three renewals by one owner is one customer');
    }

    public function test_trials_are_not_counted_as_paid_subscriptions(): void
    {
        $owner = $this->owner();
        $at = now()->subMonth()->startOfMonth()->addDays(2);

        $this->subscribe($owner, ['is_trial' => true, 'start_date' => $at, 'end_date' => $at->copy()->addDays(7)]);

        $label = now()->subMonth()->format('Y-m');
        $trends = $this->service()->trends('6m');

        $this->assertSame(0, $this->bucketFor($trends['new_paid_subscriptions']['points'], $label)['values']['count']);
        $this->assertSame(1, $this->bucketFor($trends['trial_starts']['points'], $label)['values']['count']);
    }

    public function test_the_daily_window_buckets_by_day(): void
    {
        $points = $this->service()->trends('30d')['cash_collected']['points'];

        $this->assertCount(30, $points);
        $this->assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2}$/', $points[0]['bucket']);
    }

    /**
     * Churn is the one series resolved in PHP (grace cannot be expressed in
     * SQL), so it is the one that can quietly scale with the store count.
     * The memo is what keeps it from costing a resolution per candidate row.
     */
    public function test_churn_resolves_each_owner_once_however_many_subscriptions_they_lapsed(): void
    {
        for ($i = 0; $i < 40; $i++) {
            $owner = $this->owner();
            $this->store($owner);

            foreach ([1, 2, 3] as $n) {
                $this->subscribe($owner, [
                    'start_date' => now()->subMonths($n + 1),
                    'end_date' => now()->subMonths($n),
                ]);
            }
        }

        DB::enableQueryLog();
        $this->service()->trends('6m');
        $queries = count(DB::getQueryLog());
        DB::disableQueryLog();

        $this->assertLessThan(
            200,
            $queries,
            "40 owners with 3 lapsed subscriptions each cost {$queries} queries; each owner must resolve once per request"
        );
    }

    public function test_an_unknown_window_is_rejected(): void
    {
        $this->expectException(\InvalidArgumentException::class);

        $this->service()->trends('all-time');
    }
}
