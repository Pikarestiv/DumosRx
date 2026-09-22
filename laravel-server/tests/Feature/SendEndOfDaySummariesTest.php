<?php

namespace Tests\Feature;

use App\Mail\EndOfDaySummaryMail;
use App\Models\Store;
use App\Models\Subscription;
use App\Models\SystemConfig;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Regression coverage for the nightly summary job ignoring subscription
 * expiry and hardcoding the pro/enterprise tier list instead of checking
 * the daily_summary_email feature flag via SubscriptionService (the same
 * gate StoreSummaryController::sendSummary() uses).
 */
class SendEndOfDaySummariesTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        SystemConfig::setVal('subscription_plans', [
            'grace_period_days' => 3,
            'tiers' => [
                'pro' => [
                    'features' => ['daily_summary_email' => true],
                ],
                'enterprise' => [
                    'features' => ['daily_summary_email' => false],
                ],
            ],
        ]);
    }

    protected function makeOwnerWithSubscription(array $subscriptionOverrides = []): User
    {
        $owner = User::create([
            'first_name' => 'Owner', 'last_name' => 'User',
            'email' => 'eod-' . Str::random(8) . '@dumosrx.com',
            'password' => bcrypt('password'), 'role' => 'store_owner',
        ]);

        Store::create([
            'user_id' => $owner->id, 'name' => 'EOD Store',
            'store_slug' => 'eod-store-' . Str::random(8),
            'device_id' => 'WEB-EOD-' . Str::random(8),
        ]);

        Subscription::create(array_merge([
            'user_id' => $owner->id,
            'plan_name' => 'pro',
            'start_date' => now()->subMonth(),
            'end_date' => now()->addMonth(),
            'status' => 'active',
            'license_key' => 'DRX-' . strtoupper(Str::random(8)),
        ], $subscriptionOverrides));

        return $owner;
    }

    public function test_an_active_pro_subscription_still_receives_the_email()
    {
        Mail::fake();

        $owner = $this->makeOwnerWithSubscription();

        $this->artisan('summary:end-of-day')->assertExitCode(0);

        Mail::assertSent(EndOfDaySummaryMail::class, function ($mail) use ($owner) {
            return $mail->user->id === $owner->id;
        });
    }

    public function test_an_expired_pro_subscription_past_grace_no_longer_receives_the_email()
    {
        Mail::fake();

        $owner = $this->makeOwnerWithSubscription([
            'start_date' => now()->subMonths(2),
            'end_date' => now()->subDays(10), // well past the 3-day grace period
        ]);

        $this->artisan('summary:end-of-day')->assertExitCode(0);

        Mail::assertNotSent(EndOfDaySummaryMail::class, function ($mail) use ($owner) {
            return $mail->user->id === $owner->id;
        });
    }

    public function test_a_feature_flag_disabled_tier_is_excluded_even_though_hardcoded_logic_would_include_it()
    {
        Mail::fake();

        // Enterprise is in the old hardcoded ['pro', 'enterprise'] list, but
        // the feature flag for it is explicitly disabled here.
        $owner = $this->makeOwnerWithSubscription(['plan_name' => 'enterprise']);

        $this->artisan('summary:end-of-day')->assertExitCode(0);

        Mail::assertNotSent(EndOfDaySummaryMail::class, function ($mail) use ($owner) {
            return $mail->user->id === $owner->id;
        });
    }

    public function test_one_failed_send_does_not_abort_the_run_for_other_recipients()
    {
        $owner1 = $this->makeOwnerWithSubscription();
        $owner2 = $this->makeOwnerWithSubscription();

        $sentTo = [];

        Mail::shouldReceive('to')
            ->andReturnUsing(function ($address) use ($owner1, &$sentTo) {
                $pending = \Mockery::mock(\Illuminate\Mail\PendingMail::class);
                if ($address === $owner1->email) {
                    $pending->shouldReceive('send')->andThrow(new \Exception('SMTP failure'));
                } else {
                    $pending->shouldReceive('send')->andReturnUsing(function () use ($address, &$sentTo) {
                        $sentTo[] = $address;
                    });
                }
                return $pending;
            });

        $this->artisan('summary:end-of-day')->assertExitCode(0);

        $this->assertContains($owner2->email, $sentTo);
    }
}
