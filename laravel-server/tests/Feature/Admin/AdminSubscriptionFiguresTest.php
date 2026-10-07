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

class AdminSubscriptionFiguresTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        SystemConfig::setVal('subscription_plans', ['grace_period_days' => 3]);
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
            'start_date' => now()->subDays(5),
            'end_date' => now()->addMonth(),
            'license_key' => 'LIC-'.uniqid(),
        ], $attributes));
    }

    private function pay(Subscription $subscription, string $status): void
    {
        PaymentTransaction::create([
            'subscription_id' => $subscription->id,
            'provider' => 'paystack',
            'provider_reference' => 'ref-'.uniqid(),
            'amount' => 10000,
            'currency' => 'NGN',
            'status' => $status,
        ]);
    }

    /**
     * Phase 1's rule applied here: an empty denominator must not become 0%
     * (reads as "the trial is failing") or 100% (reads as "it is perfect").
     */
    public function test_trial_conversion_is_null_when_no_trials_started_in_the_window(): void
    {
        $figures = $this->service()->figures(30);

        $this->assertNull($figures['trial_conversion_rate']);
        $this->assertSame(0, $figures['trials_started']);
    }

    public function test_trial_conversion_counts_trial_owners_who_later_paid(): void
    {
        $converted = $this->owner();
        $this->subscribe($converted, ['is_trial' => true, 'start_date' => now()->subDays(10), 'end_date' => now()->subDays(3)]);
        $this->subscribe($converted, ['is_trial' => false]);

        foreach ([1, 2] as $ignored) {
            $owner = $this->owner();
            $this->subscribe($owner, ['is_trial' => true, 'start_date' => now()->subDays(10), 'end_date' => now()->addDays(2)]);
        }

        $figures = $this->service()->figures(30);

        $this->assertSame(3, $figures['trials_started']);
        $this->assertSame('33.3%', $figures['trial_conversion_rate']);
    }

    public function test_payment_mix_counts_every_status(): void
    {
        $subscription = $this->subscribe($this->owner());

        foreach (['success', 'failed', 'abandoned', 'pending'] as $status) {
            $this->pay($subscription, $status);
        }

        $mix = $this->service()->figures(30)['payment_mix'];

        $this->assertSame(1, $mix['success']);
        $this->assertSame(1, $mix['failed']);
        $this->assertSame(1, $mix['abandoned']);
        $this->assertSame(1, $mix['pending']);
    }

    public function test_bucket_counts_match_the_worklists(): void
    {
        $this->subscribe($this->owner(), ['end_date' => now()->addDays(2)]);
        $this->subscribe($this->owner(), ['end_date' => now()->addDays(2), 'is_trial' => true]);
        $this->subscribe($this->owner(), ['end_date' => now()->subDays(30)]);
        $this->pay($this->subscribe($this->owner()), 'failed');

        $counts = $this->service()->figures(7)['bucket_counts'];

        $this->assertSame(1, $counts['expiring']);
        $this->assertSame(1, $counts['trials']);
        $this->assertSame(1, $counts['lapsed']);
        $this->assertSame(1, $counts['payments']);

        $this->assertSame(
            $this->service()->expiringSoon(7, 1)['meta']['total'],
            $counts['expiring'],
            'the tab count must agree with the list it labels'
        );
    }

    public function test_it_reports_lapsed_and_recovered_for_the_period(): void
    {
        $lapsedOwner = $this->owner();
        $this->subscribe($lapsedOwner, ['end_date' => now()->subDays(10)]);

        $recovered = $this->owner();
        $this->subscribe($recovered, ['end_date' => now()->subDays(20), 'start_date' => now()->subDays(50)]);
        $this->subscribe($recovered, ['end_date' => now()->addMonth()]);

        $figures = $this->service()->figures(30);

        $this->assertSame(1, $figures['lapsed_in_period']);
        $this->assertSame(1, $figures['recovered_in_period']);
    }
}
