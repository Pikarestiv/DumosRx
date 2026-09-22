<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\Subscription;
use App\Models\SystemConfig;
use App\Models\User;
use App\Services\SubscriptionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Regression coverage for the SubscriptionService grace-period fix:
 * hasFeature() already had a grace-period fallback (an expired subscription
 * still counts if end_date is within `grace_period_days`), but
 * checkLimit()/enforceStaffLimits() dropped straight to 'free' the moment
 * end_date passed, disagreeing with hasFeature() about which tier the
 * account is actually on during a lapsed-but-still-in-grace renewal.
 * enforceStaffLimits() in particular is called on every sync request
 * (validateSync()), so it was actively deactivating staff and sending
 * suspension notifications for accounts merely mid-renewal.
 */
class SubscriptionGracePeriodTest extends TestCase
{
    use RefreshDatabase;

    protected User $owner;
    protected Store $store;
    protected SubscriptionService $service;

    protected function setUp(): void
    {
        parent::setUp();

        $this->service = app(SubscriptionService::class);

        $this->owner = User::create([
            'first_name' => 'Owner', 'last_name' => 'User',
            'email' => 'grace-owner@dumosrx.com', 'password' => bcrypt('password'), 'role' => 'store_owner',
        ]);
        $this->store = Store::create([
            'user_id' => $this->owner->id, 'name' => 'Grace Store', 'store_slug' => 'grace-store',
            'device_id' => 'WEB-GRACE',
        ]);

        SystemConfig::setVal('subscription_plans', [
            'grace_period_days' => 3,
            'tiers' => [
                'free' => ['features' => ['cloud_sync' => false], 'limits' => ['staff' => 1, 'stores' => 1]],
                'pro' => ['features' => ['cloud_sync' => true], 'limits' => ['staff' => 10, 'stores' => 3]],
            ],
        ]);
    }

    private function createLapsedProSubscription(int $daysExpiredAgo): Subscription
    {
        return Subscription::create([
            'user_id' => $this->owner->id,
            'plan_name' => 'pro',
            'start_date' => now()->subMonth(),
            'end_date' => now()->subDays($daysExpiredAgo),
            'status' => 'active',
            'license_key' => 'DRX-' . strtoupper(Str::random(8)),
        ]);
    }

    private function createStaff(int $count, bool $active = true): void
    {
        for ($i = 0; $i < $count; $i++) {
            User::create([
                'first_name' => 'Staff', 'last_name' => (string) $i,
                'email' => "grace-staff-{$i}-" . Str::random(4) . '@dumosrx.com',
                'password' => bcrypt('password'),
                'role' => 'sales_staff',
                'store_id' => $this->store->id,
                'is_active' => $active,
            ]);
        }
    }

    public function test_check_limit_honors_the_grace_period_like_has_feature_does()
    {
        // Expired 1 day ago, well within the 3-day grace period.
        $this->createLapsedProSubscription(1);
        $this->createStaff(5); // Within pro's limit (10), over free's (1).

        $this->assertTrue($this->service->hasFeature($this->owner, 'cloud_sync'));
        $this->assertTrue($this->service->checkLimit($this->owner, 'staff'));
    }

    public function test_check_limit_drops_to_free_once_the_grace_period_has_elapsed()
    {
        // Expired 10 days ago, well past the 3-day grace period.
        $this->createLapsedProSubscription(10);
        $this->createStaff(5); // Over free's limit (1).

        $this->assertFalse($this->service->hasFeature($this->owner, 'cloud_sync'));
        $this->assertFalse($this->service->checkLimit($this->owner, 'staff'));
    }

    public function test_enforce_staff_limits_does_not_suspend_staff_during_the_grace_period()
    {
        $this->createLapsedProSubscription(1);
        $this->createStaff(5); // Within pro's limit (10).

        $this->service->enforceStaffLimits($this->owner);

        $this->assertEquals(5, User::where('store_id', $this->store->id)->where('is_active', true)->count());
        $this->assertDatabaseMissing('notifications', ['user_id' => $this->owner->id, 'title' => 'Staff Accounts Suspended']);
    }

    public function test_enforce_staff_limits_still_suspends_once_the_grace_period_has_elapsed()
    {
        $this->createLapsedProSubscription(10);
        $this->createStaff(5); // Over free's limit (1) once grace has elapsed.

        $this->service->enforceStaffLimits($this->owner);

        $this->assertEquals(1, User::where('store_id', $this->store->id)->where('is_active', true)->count());
        $this->assertDatabaseHas('notifications', ['user_id' => $this->owner->id, 'title' => 'Staff Accounts Suspended']);
    }

    public function test_check_limit_staff_count_excludes_deactivated_staff()
    {
        $this->createLapsedProSubscription(10); // Effective plan: free (limit 1).
        $this->createStaff(1, active: true);
        $this->createStaff(5, active: false);

        // Only the 1 active staff member counts against free's limit of 1,
        // so the account is exactly at (not over) the quota.
        $this->assertFalse($this->service->checkLimit($this->owner, 'staff'));

        // Deactivate the one active staffer -- now 0 active, under the
        // limit of 1, so a reactivation/new hire should be allowed again.
        User::where('store_id', $this->store->id)->where('is_active', true)->update(['is_active' => false]);
        $this->assertTrue($this->service->checkLimit($this->owner, 'staff'));
    }

    /**
     * Regression test for Fix E.1: hasFeature() used to return `false` for
     * ANY feature key genuinely absent from SystemConfig (as opposed to
     * present-but-false), while StoreSummaryController separately fell back
     * to in_array($plan, ['pro','enterprise']) for the daily_summary_email
     * flag specifically - so a deployment whose SystemConfig predates this
     * flag key had the manual /dashboard/send-summary endpoint still work
     * while the nightly SendEndOfDaySummaries cron silently emailed nobody.
     * hasFeature() must now agree with that same pro/enterprise fallback
     * when the key is absent.
     */
    public function test_has_feature_falls_back_to_pro_enterprise_for_daily_summary_email_when_flag_key_is_absent()
    {
        // Deliberately omit 'daily_summary_email' from the tiers config
        // entirely (as opposed to setting it to false) to reproduce a
        // deployment whose SystemConfig predates the flag.
        SystemConfig::setVal('subscription_plans', [
            'tiers' => [
                'free' => ['features' => ['cloud_sync' => false]],
                'pro' => ['features' => ['cloud_sync' => true]],
                'enterprise' => ['features' => ['cloud_sync' => true]],
            ],
        ]);

        $proSubscription = Subscription::create([
            'user_id' => $this->owner->id,
            'plan_name' => 'pro',
            'start_date' => now(),
            'end_date' => now()->addMonth(),
            'status' => 'active',
            'license_key' => 'DRX-' . strtoupper(Str::random(8)),
        ]);

        $this->assertTrue($this->service->hasFeature($this->owner, 'daily_summary_email'));

        // A genuinely-set `false` (not merely absent) must still be honored.
        SystemConfig::setVal('subscription_plans', [
            'tiers' => [
                'pro' => ['features' => ['daily_summary_email' => false]],
            ],
        ]);
        $this->assertFalse($this->service->hasFeature($this->owner, 'daily_summary_email'));
    }
}
