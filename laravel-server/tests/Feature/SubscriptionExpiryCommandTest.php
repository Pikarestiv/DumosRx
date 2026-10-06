<?php

namespace Tests\Feature;

use App\Models\Subscription;
use App\Models\SystemConfig;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Nothing transitioned a subscription out of 'active' when its end_date
 * passed, so every row an owner ever held stayed 'active' forever. Readers
 * that pair status with an end_date check were unaffected; anything counting
 * or grouping on status alone was not.
 */
class SubscriptionExpiryCommandTest extends TestCase
{
    use RefreshDatabase;

    private const GRACE_DAYS = 3;

    protected function setUp(): void
    {
        parent::setUp();

        SystemConfig::setVal('subscription_plans', ['grace_period_days' => self::GRACE_DAYS]);
    }

    private function subscribe(array $attributes = []): Subscription
    {
        $user = User::create([
            'first_name' => 'Owner',
            'last_name' => 'Test',
            'email' => 'owner-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        return Subscription::create(array_merge([
            'user_id' => $user->id,
            'plan_name' => 'premium',
            'status' => 'active',
            'is_trial' => false,
            'start_date' => now()->subMonths(2),
            'end_date' => now()->addMonth(),
            'license_key' => 'LIC-'.uniqid(),
        ], $attributes));
    }

    public function test_it_expires_a_subscription_past_its_end_date_and_grace_window(): void
    {
        $sub = $this->subscribe(['end_date' => now()->subDays(self::GRACE_DAYS + 1)]);

        $this->artisan('subscriptions:expire')->assertSuccessful();

        $this->assertSame('expired', $sub->fresh()->status);
    }

    /**
     * resolveEffectiveSubscription() finds the grace-period row with a
     * status='active' filter, so expiring a row inside grace would cut the
     * grace window short — which previously deactivated staff and sent
     * suspension notices to accounts merely mid-renewal.
     */
    public function test_it_leaves_a_subscription_inside_the_grace_window_active(): void
    {
        $sub = $this->subscribe(['end_date' => now()->subDay()]);

        $this->artisan('subscriptions:expire')->assertSuccessful();

        $this->assertSame('active', $sub->fresh()->status);
    }

    public function test_it_leaves_a_current_subscription_active(): void
    {
        $sub = $this->subscribe();

        $this->artisan('subscriptions:expire')->assertSuccessful();

        $this->assertSame('active', $sub->fresh()->status);
    }

    public function test_it_does_not_touch_rows_that_are_already_not_active(): void
    {
        $cancelled = $this->subscribe([
            'status' => 'cancelled',
            'end_date' => now()->subYear(),
        ]);

        $this->artisan('subscriptions:expire')->assertSuccessful();

        $this->assertSame('cancelled', $cancelled->fresh()->status);
    }

    public function test_it_is_idempotent(): void
    {
        $sub = $this->subscribe(['end_date' => now()->subDays(self::GRACE_DAYS + 1)]);

        $this->artisan('subscriptions:expire')->assertSuccessful();
        $firstUpdatedAt = $sub->fresh()->updated_at;

        $this->artisan('subscriptions:expire')->assertSuccessful();

        $this->assertSame('expired', $sub->fresh()->status);
        $this->assertEquals($firstUpdatedAt, $sub->fresh()->updated_at);
    }

    public function test_it_honours_a_configured_grace_period_longer_than_the_default(): void
    {
        SystemConfig::setVal('subscription_plans', ['grace_period_days' => 30]);
        $sub = $this->subscribe(['end_date' => now()->subDays(10)]);

        $this->artisan('subscriptions:expire')->assertSuccessful();

        $this->assertSame('active', $sub->fresh()->status);
    }
}
