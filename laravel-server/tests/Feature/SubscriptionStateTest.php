<?php

namespace Tests\Feature;

use App\Models\Subscription;
use App\Models\SystemConfig;
use App\Models\User;
use App\Services\SubscriptionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SubscriptionStateTest extends TestCase
{
    use RefreshDatabase;

    private const GRACE_DAYS = 3;

    protected function setUp(): void
    {
        parent::setUp();

        SystemConfig::setVal('subscription_plans', ['grace_period_days' => self::GRACE_DAYS]);
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

    private function state(User $owner): string
    {
        return app(SubscriptionService::class)->subscriptionState($owner);
    }

    public function test_an_owner_on_a_live_paid_plan_is_active(): void
    {
        $owner = $this->owner();
        $this->subscribe($owner);

        $this->assertSame('active', $this->state($owner));
    }

    public function test_an_owner_on_a_live_trial_is_trialing(): void
    {
        $owner = $this->owner();
        $this->subscribe($owner, ['is_trial' => true]);

        $this->assertSame('trialing', $this->state($owner));
    }

    public function test_an_owner_who_has_never_subscribed_is_none(): void
    {
        $this->assertSame('none', $this->state($this->owner()));
    }

    public function test_an_owner_past_end_date_and_grace_is_lapsed(): void
    {
        $owner = $this->owner();
        $this->subscribe($owner, ['end_date' => now()->subDays(self::GRACE_DAYS + 1)]);

        $this->assertSame('lapsed', $this->state($owner));
    }

    /**
     * resolveEffectiveSubscription() still returns this row and the application
     * still serves the account. Reporting it as lapsed would put a perfectly
     * healthy customer on the retention worklist.
     */
    public function test_an_owner_inside_the_grace_window_is_in_grace_not_lapsed(): void
    {
        $owner = $this->owner();
        $this->subscribe($owner, ['end_date' => now()->subDay()]);

        $this->assertSame('in_grace', $this->state($owner));
        $this->assertNotNull(
            app(SubscriptionService::class)->resolveEffectiveSubscription($owner),
            'the admin state must agree with what the application itself believes'
        );
    }

    /** The row-vs-owner trap: history must not make a paying customer look lapsed. */
    public function test_an_owner_with_expired_history_and_a_live_plan_is_active(): void
    {
        $owner = $this->owner();
        $this->subscribe($owner, ['end_date' => now()->subYear(), 'start_date' => now()->subYears(2)]);
        $this->subscribe($owner, ['end_date' => now()->subMonths(6), 'start_date' => now()->subYear()]);
        $this->subscribe($owner);

        $this->assertSame('active', $this->state($owner));
    }

    public function test_lapsed_and_none_are_distinguished(): void
    {
        $lapsed = $this->owner();
        $this->subscribe($lapsed, ['end_date' => now()->subYear()]);

        $this->assertSame('lapsed', $this->state($lapsed));
        $this->assertSame('none', $this->state($this->owner()));
    }
}
