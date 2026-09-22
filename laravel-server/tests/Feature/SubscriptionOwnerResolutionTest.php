<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\Subscription;
use App\Models\SystemConfig;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Regression coverage for two related bugs where a subscription lookup
 * queried the caller's own user_id directly instead of resolving to the
 * subscription OWNER first (SubscriptionService::getSubscriptionOwner()):
 * a staff member has no subscriptions of their own, so both endpoints
 * always returned 'inactive'/free-plan behavior for staff regardless of
 * the store's real plan.
 */
class SubscriptionOwnerResolutionTest extends TestCase
{
    use RefreshDatabase;

    protected User $owner;
    protected User $staff;
    protected Store $store;

    protected function setUp(): void
    {
        parent::setUp();

        $this->owner = User::create([
            'first_name' => 'Owner', 'last_name' => 'User',
            'email' => 'sub-owner@dumosrx.com', 'password' => bcrypt('password'), 'role' => 'store_owner',
        ]);
        $this->store = Store::create([
            'user_id' => $this->owner->id, 'name' => 'Sub Store', 'store_slug' => 'sub-owner-store',
            'device_id' => 'WEB-SUB-OWNER',
        ]);
        $this->staff = User::create([
            'first_name' => 'Staff', 'last_name' => 'User',
            'email' => 'sub-staff@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'sales_staff', 'store_id' => $this->store->id,
        ]);

        Subscription::create([
            'user_id' => $this->owner->id,
            'plan_name' => 'pro',
            'start_date' => now()->subDay(),
            'end_date' => now()->addMonth(),
            'status' => 'active',
            'license_key' => 'DRX-' . strtoupper(Str::random(8)),
        ]);

        SystemConfig::setVal('subscription_plans', [
            'tiers' => [
                'pro' => [
                    'features' => ['cloud_sync' => true, 'daily_summary_email' => true],
                    'limits' => ['staff' => 10],
                ],
            ],
        ]);

        $this->withoutMiddleware();
    }

    public function test_subscription_status_resolves_a_staff_members_store_owner()
    {
        $response = $this->actingAs($this->staff)->getJson('/api/v1/subscription/status');

        $response->assertStatus(200);
        $response->assertJson(['status' => 'active', 'plan' => 'pro']);
    }

    public function test_send_summary_resolves_a_staff_members_store_owner()
    {
        \Illuminate\Support\Facades\Mail::fake();

        $response = $this->actingAs($this->staff)->postJson('/api/v1/dashboard/send-summary');

        $response->assertStatus(200);
        \Illuminate\Support\Facades\Mail::assertSent(\App\Mail\EndOfDaySummaryMail::class);
    }

    /**
     * Regression test for Fix E.2: status() ran its own raw `status =
     * 'active' AND end_date > now()` query instead of
     * SubscriptionService::resolveEffectiveSubscription(), so it reported
     * 'inactive' during the grace-period window even while
     * hasFeature()/checkLimit() elsewhere in the app still granted
     * paid-tier access for the very same account.
     */
    public function test_subscription_status_is_grace_period_aware()
    {
        // The setUp() subscription is genuinely active; add a second,
        // lapsed-but-within-grace one for a different owner so the two
        // scenarios can't interfere via a shared `latest()` pick.
        $graceOwner = User::create([
            'first_name' => 'Grace', 'last_name' => 'Owner',
            'email' => 'grace-status-owner@dumosrx.com', 'password' => bcrypt('password'), 'role' => 'store_owner',
        ]);
        Subscription::create([
            'user_id' => $graceOwner->id,
            'plan_name' => 'pro',
            'start_date' => now()->subMonth(),
            'end_date' => now()->subDay(), // Expired yesterday.
            'status' => 'active',
            'license_key' => 'DRX-' . strtoupper(Str::random(8)),
        ]);
        SystemConfig::setVal('subscription_plans', [
            'grace_period_days' => 3,
            'tiers' => [
                'pro' => [
                    'features' => ['cloud_sync' => true, 'daily_summary_email' => true],
                    'limits' => ['staff' => 10],
                ],
            ],
        ]);

        $response = $this->actingAs($graceOwner)->getJson('/api/v1/subscription/status');

        $response->assertStatus(200);
        $response->assertJson(['status' => 'active', 'plan' => 'pro']);
    }
}
