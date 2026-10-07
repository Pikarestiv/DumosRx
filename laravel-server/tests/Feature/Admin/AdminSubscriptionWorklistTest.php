<?php

namespace Tests\Feature\Admin;

use App\Models\PaymentTransaction;
use App\Models\Store;
use App\Models\Subscription;
use App\Models\SystemConfig;
use App\Models\User;
use App\Services\Admin\AdminSubscriptionLifecycleService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminSubscriptionWorklistTest extends TestCase
{
    use RefreshDatabase;

    private const GRACE_DAYS = 3;

    protected function setUp(): void
    {
        parent::setUp();

        SystemConfig::setVal('subscription_plans', ['grace_period_days' => self::GRACE_DAYS]);
    }

    private function service(): AdminSubscriptionLifecycleService
    {
        return app(AdminSubscriptionLifecycleService::class);
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

    private function subscribe(User $owner, array $attributes = []): Subscription
    {
        return Subscription::create(array_merge([
            'user_id' => $owner->id,
            'plan_name' => 'premium',
            'status' => 'active',
            'is_trial' => false,
            'start_date' => now()->subMonth(),
            'end_date' => now()->addMonth(),
            'license_key' => 'LIC-'.uniqid(),
        ], $attributes));
    }

    private function pay(Subscription $subscription, string $status): PaymentTransaction
    {
        return PaymentTransaction::create([
            'subscription_id' => $subscription->id,
            'provider' => 'paystack',
            'provider_reference' => 'ref-'.uniqid(),
            'amount' => 10000,
            'currency' => 'NGN',
            'status' => $status,
        ]);
    }

    public function test_expiring_soon_lists_an_owner_whose_plan_ends_inside_the_window(): void
    {
        $owner = $this->owner();
        $this->subscribe($owner, ['end_date' => now()->addDays(3)]);

        $rows = $this->service()->expiringSoon(7, 1)['data'];

        $this->assertCount(1, $rows);
        $this->assertSame($owner->id, $rows[0]['user_id']);
    }

    public function test_expiring_soon_excludes_a_plan_ending_outside_the_window(): void
    {
        $this->subscribe($this->owner(), ['end_date' => now()->addDays(20)]);

        $this->assertCount(0, $this->service()->expiringSoon(7, 1)['data']);
    }

    public function test_expiring_soon_excludes_trials(): void
    {
        $this->subscribe($this->owner(), ['end_date' => now()->addDays(3), 'is_trial' => true]);

        $this->assertCount(0, $this->service()->expiringSoon(7, 1)['data']);
        $this->assertCount(1, $this->service()->trialsEnding(7, 1)['data']);
    }

    /** The row-vs-owner trap, at list level. */
    public function test_an_owner_appears_once_however_many_subscriptions_they_have_had(): void
    {
        $owner = $this->owner();
        $this->subscribe($owner, ['end_date' => now()->subYear(), 'start_date' => now()->subYears(2)]);
        $this->subscribe($owner, ['end_date' => now()->subMonths(6), 'start_date' => now()->subYear()]);
        $this->subscribe($owner, ['end_date' => now()->addDays(2)]);

        $this->assertCount(1, $this->service()->expiringSoon(7, 1)['data']);
    }

    /**
     * SubscriptionController::activateSubscriptionFromTransaction() creates a
     * new active subscription WITHOUT expiring the previous one, so an owner
     * who renews early holds two concurrently-live rows. Listing the old one
     * tells the operator to chase an account that paid this morning, and shows
     * a date that is not the account's real expiry.
     */
    public function test_expiring_soon_excludes_an_owner_who_already_renewed(): void
    {
        $owner = $this->owner();
        $original = $this->subscribe($owner, ['end_date' => now()->addDays(3)]);
        \Illuminate\Support\Facades\DB::table('subscriptions')->where('id', $original->id)
            ->update(['created_at' => now()->subMonth()]);

        $this->subscribe($owner, ['end_date' => now()->addMonth(), 'start_date' => now()]);

        $this->assertCount(0, $this->service()->expiringSoon(7, 1)['data']);
    }

    /**
     * An owner in the grace window has the shortest recovery runway of anyone
     * on the platform. They are correctly out of `lapsed`, so they must appear
     * in `expiring` rather than nowhere at all.
     */
    public function test_expiring_soon_includes_an_owner_inside_the_grace_window(): void
    {
        $owner = $this->owner();
        $this->subscribe($owner, ['end_date' => now()->subDay()]);

        $rows = $this->service()->expiringSoon(7, 1)['data'];

        $this->assertCount(1, $rows);
        $this->assertSame($owner->id, $rows[0]['user_id']);
        $this->assertSame('in_grace', $rows[0]['state']);
    }

    public function test_lapsed_excludes_an_owner_who_also_holds_a_live_plan(): void
    {
        $owner = $this->owner();
        $this->subscribe($owner, ['end_date' => now()->subYear()]);
        $this->subscribe($owner);

        $this->assertCount(0, $this->service()->lapsed(1)['data']);
    }

    public function test_lapsed_excludes_an_owner_inside_the_grace_window(): void
    {
        $this->subscribe($this->owner(), ['end_date' => now()->subDay()]);

        $this->assertCount(0, $this->service()->lapsed(1)['data']);
    }

    public function test_lapsed_lists_an_owner_past_grace_most_recent_first(): void
    {
        $older = $this->owner();
        $this->subscribe($older, ['end_date' => now()->subDays(60)]);
        $recent = $this->owner();
        $this->subscribe($recent, ['end_date' => now()->subDays(10)]);

        $rows = $this->service()->lapsed(1)['data'];

        $this->assertSame([$recent->id, $older->id], array_column($rows, 'user_id'));
    }

    public function test_payments_needing_attention_lists_failed_and_abandoned_only(): void
    {
        $failedOwner = $this->owner();
        $this->pay($this->subscribe($failedOwner), 'failed');

        $abandonedOwner = $this->owner();
        $this->pay($this->subscribe($abandonedOwner), 'abandoned');

        $okOwner = $this->owner();
        $this->pay($this->subscribe($okOwner), 'success');

        $pendingOwner = $this->owner();
        $this->pay($this->subscribe($pendingOwner), 'pending');

        $rows = $this->service()->paymentsNeedingAttention(30, 1)['data'];
        $ids = array_column($rows, 'user_id');

        $this->assertCount(2, $rows);
        $this->assertContains($failedOwner->id, $ids);
        $this->assertContains($abandonedOwner->id, $ids);
        $this->assertNotContains($okOwner->id, $ids);
        $this->assertNotContains($pendingOwner->id, $ids);
    }

    public function test_payments_needing_attention_counts_attempts_per_owner(): void
    {
        $owner = $this->owner();
        $subscription = $this->subscribe($owner);
        $this->pay($subscription, 'failed');
        $this->pay($subscription, 'failed');
        $this->pay($subscription, 'abandoned');

        $rows = $this->service()->paymentsNeedingAttention(30, 1)['data'];

        $this->assertCount(1, $rows);
        $this->assertSame(3, $rows[0]['attempts']);
    }

    public function test_every_worklist_paginates_at_fifty(): void
    {
        for ($i = 0; $i < 60; $i++) {
            $this->subscribe($this->owner(), ['end_date' => now()->addDays(2)]);
        }

        $result = $this->service()->expiringSoon(7, 1);

        $this->assertCount(50, $result['data']);
        $this->assertSame(50, $result['meta']['per_page']);
        $this->assertSame(60, $result['meta']['total']);
    }

    public function test_rows_carry_the_owner_and_store_a_worklist_needs(): void
    {
        $owner = $this->owner();
        $this->subscribe($owner, ['end_date' => now()->addDays(2)]);

        $row = $this->service()->expiringSoon(7, 1)['data'][0];

        foreach (['user_id', 'owner_name', 'email', 'store_name', 'store_id', 'plan', 'end_date'] as $key) {
            $this->assertArrayHasKey($key, $row, "worklist row is missing {$key}");
        }

        $this->assertSame($owner->email, $row['email']);
    }

    /**
     * Found in review. subscriptionState() returns `in_grace` for any past
     * end_date, trial or not. trialsEnding() accepted only `trialing`, and
     * expiringSoon()'s candidates are `is_trial = false`, so a trial that
     * ended yesterday but is still inside the grace window appeared in
     * neither bucket — the exact "nowhere at all" graceFloor() exists to
     * prevent.
     */
    public function test_a_trial_inside_the_grace_window_still_appears_in_trials_ending(): void
    {
        $owner = $this->owner();
        $this->subscribe($owner, ['is_trial' => true, 'end_date' => now()->subDay()]);

        $rows = $this->service()->trialsEnding(7, 1)['data'];

        $this->assertCount(1, $rows, 'a trial inside grace must not fall out of every worklist');
        $this->assertSame($owner->id, $rows[0]['user_id']);
        $this->assertSame('in_grace', $rows[0]['state']);
    }
}
