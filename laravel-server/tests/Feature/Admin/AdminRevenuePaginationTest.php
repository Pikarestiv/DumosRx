<?php

namespace Tests\Feature\Admin;

use App\Models\PaymentTransaction;
use App\Models\Subscription;
use App\Models\User;
use App\Services\Admin\AdminRevenueService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * PG-12: getOverview() called ->get() on every matching row and sliced 20 out
 * in PHP. Phase 2 added AdminSummaryService as a second caller, so this runs on
 * every admin Overview load.
 */
class AdminRevenuePaginationTest extends TestCase
{
    use RefreshDatabase;

    private function service(): AdminRevenueService
    {
        return app(AdminRevenueService::class);
    }

    private function transaction(string $plan = 'premium', string $currency = 'NGN'): PaymentTransaction
    {
        $user = User::create([
            'first_name' => 'Owner',
            'last_name' => 'Test',
            'email' => 'owner-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $subscription = Subscription::create([
            'user_id' => $user->id,
            'plan_name' => $plan,
            'status' => 'active',
            'is_trial' => false,
            'start_date' => now()->subMonth(),
            'end_date' => now()->addMonth(),
            'license_key' => 'LIC-'.uniqid(),
        ]);

        return PaymentTransaction::create([
            'subscription_id' => $subscription->id,
            'provider' => 'paystack',
            'provider_reference' => 'ref-'.uniqid(),
            'amount' => 10000,
            'currency' => $currency,
            'status' => 'success',
            'metadata' => ['plan_name' => $plan],
        ]);
    }

    public function test_it_does_not_load_every_transaction_to_render_one_page(): void
    {
        for ($i = 0; $i < 60; $i++) {
            $this->transaction();
        }

        $unboundedSelects = [];
        DB::listen(function ($query) use (&$unboundedSelects) {
            $sql = strtolower($query->sql);

            // An aggregate returns one row per group, so it is bounded by
            // cardinality rather than by transaction count.
            $isRowFetch = str_contains($sql, 'from "payment_transactions"')
                && ! str_contains($sql, 'count(')
                && ! str_contains($sql, 'sum(')
                && ! str_contains($sql, 'group by');

            if ($isRowFetch && ! str_contains($sql, 'limit')) {
                $unboundedSelects[] = $query->sql;
            }
        });

        $overview = $this->service()->getOverview();

        $this->assertCount(20, $overview['transactions']['data']);
        $this->assertSame(60, $overview['transactions']['meta']['total']);
        $this->assertSame(
            [],
            $unboundedSelects,
            'every row fetch must carry a LIMIT; an unbounded select is the PG-12 full-table load'
        );
    }

    public function test_a_plan_filter_still_returns_the_right_rows(): void
    {
        $this->transaction('premium');
        $this->transaction('premium');
        $this->transaction('basic');

        $overview = $this->service()->getOverview(1, null, null, 'premium');

        $this->assertSame(2, $overview['transactions']['meta']['total']);
    }

    public function test_the_currency_breakdown_survives_the_rewrite(): void
    {
        $this->transaction('premium', 'NGN');
        $this->transaction('premium', 'NGN');
        $this->transaction('premium', 'GHS');

        $overview = $this->service()->getOverview();

        $this->assertSame(['NGN' => 20000.0, 'GHS' => 10000.0], $overview['totals_by_currency']);
    }

    /**
     * An orphaned transaction has no authoritative plan to filter on, so it
     * keeps its metadata plan for display and drops out of a plan= filter.
     */
    public function test_a_transaction_whose_subscription_is_gone_still_renders_a_plan(): void
    {
        $txn = $this->transaction('premium');
        $txn->forceFill(['subscription_id' => null])->save();

        $overview = $this->service()->getOverview();

        $this->assertSame(1, $overview['transactions']['meta']['total']);
        $this->assertSame('premium', strtolower($overview['transactions']['data'][0]['plan']));

        $filtered = $this->service()->getOverview(1, null, null, 'premium');
        $this->assertSame(0, $filtered['transactions']['meta']['total']);
    }
}
