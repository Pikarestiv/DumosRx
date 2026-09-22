<?php

namespace Tests\Feature\Admin;

use App\Models\SystemConfig;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Server-side coverage for the three money-handling holes the superadmin
 * panel review turned up, each of which the client was the only defence
 * against:
 *
 *  - SystemConfigController::update stored `subscription_plans` with no
 *    schema check at all, so a cleared price field (`Number("") === 0`) or a
 *    typed `-1` published a free/negative paid tier.
 *  - CouponController validated `value` as `min:0` with no ceiling, so a
 *    500%-off percentage coupon was accepted.
 *  - ReferralController validated `amount` as plain `numeric`; a negative
 *    amount slipped past `if ($user->referral_credits < $amount)` (always
 *    false when $amount is negative), so a "spent" adjustment of -5000
 *    *credited* the wallet.
 */
class AdminMoneyValidationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);
    }

    private function superAdmin(): User
    {
        return User::create([
            'first_name' => 'Super',
            'last_name' => 'Admin',
            'email' => 'super-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'super_admin',
        ]);
    }

    private function storeOwner(): User
    {
        return User::create([
            'first_name' => 'Store',
            'last_name' => 'Owner',
            'email' => 'owner-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);
    }

    /** @return array<string, mixed> */
    private function plansPayload(float $starterMonthly = 3000, float $starterYearly = 30000): array
    {
        $tier = fn (float $monthly, float $yearly, bool $active = true) => [
            'price_monthly' => $monthly,
            'price_yearly' => $yearly,
            'active' => $active,
            'limits' => ['staff' => 3, 'stores' => 1, 'sync_interval' => 30],
            'features' => ['cloud_sync' => true, 'web_dashboard' => true],
        ];

        return [
            'trial_days' => 14,
            'tiers' => [
                'free' => $tier(0, 0),
                'starter' => $tier($starterMonthly, $starterYearly),
                'pro' => $tier(8000, 80000),
                'enterprise' => $tier(15000, 150000),
            ],
        ];
    }

    // ---------------------------------------------------------- plan pricing

    public function test_valid_plan_pricing_is_still_accepted(): void
    {
        $response = $this->actingAs($this->superAdmin())
            ->putJson('/api/v1/admin/system-configs/subscription_plans', [
                'value' => $this->plansPayload(),
            ]);

        $response->assertOk();
        $this->assertEquals(3000, SystemConfig::getVal('subscription_plans')['tiers']['starter']['price_monthly']);
    }

    public function test_negative_plan_price_is_rejected(): void
    {
        $response = $this->actingAs($this->superAdmin())
            ->putJson('/api/v1/admin/system-configs/subscription_plans', [
                'value' => $this->plansPayload(-1, 30000),
            ]);

        $response->assertStatus(422);
        $this->assertNull(SystemConfig::getVal('subscription_plans'));
    }

    public function test_zero_price_on_an_active_paid_tier_is_rejected(): void
    {
        $response = $this->actingAs($this->superAdmin())
            ->putJson('/api/v1/admin/system-configs/subscription_plans', [
                'value' => $this->plansPayload(0, 0),
            ]);

        $response->assertStatus(422);
        $this->assertNull(SystemConfig::getVal('subscription_plans'));
    }

    public function test_absurdly_large_plan_price_is_rejected(): void
    {
        $response = $this->actingAs($this->superAdmin())
            ->putJson('/api/v1/admin/system-configs/subscription_plans', [
                'value' => $this->plansPayload(3000, 999999999999),
            ]);

        $response->assertStatus(422);
    }

    public function test_zero_price_on_the_free_tier_is_still_allowed(): void
    {
        $payload = $this->plansPayload();
        $this->assertSame(0.0, (float) $payload['tiers']['free']['price_monthly']);

        $response = $this->actingAs($this->superAdmin())
            ->putJson('/api/v1/admin/system-configs/subscription_plans', ['value' => $payload]);

        $response->assertOk();
    }

    public function test_other_config_keys_remain_free_form(): void
    {
        $response = $this->actingAs($this->superAdmin())
            ->putJson('/api/v1/admin/system-configs/smartsupp_key', ['value' => 'abc123']);

        $response->assertOk();
    }

    // --------------------------------------------------------------- coupons

    public function test_percentage_coupon_above_100_is_rejected(): void
    {
        $response = $this->actingAs($this->superAdmin())
            ->postJson('/api/v1/admin/coupons', [
                'code' => 'TOOMUCH'.uniqid(),
                'type' => 'discount_percent',
                'value' => 500,
            ]);

        $response->assertStatus(422);
    }

    public function test_percentage_coupon_at_100_is_accepted(): void
    {
        $response = $this->actingAs($this->superAdmin())
            ->postJson('/api/v1/admin/coupons', [
                'code' => 'FULL'.uniqid(),
                'type' => 'discount_percent',
                'value' => 100,
            ]);

        $response->assertCreated();
    }

    /** The 100 ceiling must apply to percentages only - a naira amount of
     * 500 is odd for a coupon but legal, since it isn't a percentage. */
    public function test_non_percentage_coupon_above_100_is_still_accepted(): void
    {
        $response = $this->actingAs($this->superAdmin())
            ->postJson('/api/v1/admin/coupons', [
                'code' => 'BIGAMOUNT'.uniqid(),
                'type' => 'discount_amount',
                'value' => 500,
            ]);

        $response->assertCreated();
    }

    // ------------------------------------------------------ referral credits

    public function test_negative_spent_adjustment_is_rejected_instead_of_crediting(): void
    {
        $owner = $this->storeOwner();
        $before = (float) $owner->referral_credits;

        $response = $this->actingAs($this->superAdmin())
            ->postJson('/api/v1/admin/referrals/adjust-credits', [
                'user_id' => $owner->id,
                'amount' => -5000,
                'type' => 'spent',
                'description' => 'attempted negative deduction',
            ]);

        $response->assertStatus(422);
        $this->assertSame($before, (float) $owner->fresh()->referral_credits);
    }

    public function test_negative_earned_adjustment_is_rejected(): void
    {
        $owner = $this->storeOwner();

        $response = $this->actingAs($this->superAdmin())
            ->postJson('/api/v1/admin/referrals/adjust-credits', [
                'user_id' => $owner->id,
                'amount' => -5000,
                'type' => 'earned',
                'description' => 'attempted negative award',
            ]);

        $response->assertStatus(422);
        $this->assertSame(0.0, (float) $owner->fresh()->referral_credits);
    }

    public function test_zero_adjustment_is_rejected(): void
    {
        $owner = $this->storeOwner();

        $response = $this->actingAs($this->superAdmin())
            ->postJson('/api/v1/admin/referrals/adjust-credits', [
                'user_id' => $owner->id,
                'amount' => 0,
                'type' => 'admin_adjustment',
                'description' => 'no-op',
            ]);

        $response->assertStatus(422);
    }

    public function test_positive_earned_then_spent_still_works(): void
    {
        $owner = $this->storeOwner();

        $this->actingAs($this->superAdmin())
            ->postJson('/api/v1/admin/referrals/adjust-credits', [
                'user_id' => $owner->id,
                'amount' => 5000,
                'type' => 'earned',
                'description' => 'goodwill award',
            ])->assertOk();

        $this->assertSame(5000.0, (float) $owner->fresh()->referral_credits);

        $this->actingAs($this->superAdmin())
            ->postJson('/api/v1/admin/referrals/adjust-credits', [
                'user_id' => $owner->id,
                'amount' => 2000,
                'type' => 'spent',
                'description' => 'redeemed against invoice',
            ])->assertOk();

        $this->assertSame(3000.0, (float) $owner->fresh()->referral_credits);
    }

    public function test_spending_more_than_the_balance_is_still_refused(): void
    {
        $owner = $this->storeOwner();

        $response = $this->actingAs($this->superAdmin())
            ->postJson('/api/v1/admin/referrals/adjust-credits', [
                'user_id' => $owner->id,
                'amount' => 100,
                'type' => 'spent',
                'description' => 'over-spend',
            ]);

        $response->assertStatus(400);
        $this->assertSame(0.0, (float) $owner->fresh()->referral_credits);
    }

    // ---------------------------------------------------------- pagination

    public function test_referral_transactions_respond_with_a_data_meta_envelope(): void
    {
        $response = $this->actingAs($this->superAdmin())
            ->getJson('/api/v1/admin/referrals/transactions');

        $response->assertOk();
        $response->assertJsonStructure([
            'data',
            'meta' => ['current_page', 'last_page', 'total', 'per_page'],
        ]);
    }

    public function test_referral_relationships_respond_with_a_data_meta_envelope(): void
    {
        $response = $this->actingAs($this->superAdmin())
            ->getJson('/api/v1/admin/referrals');

        $response->assertOk();
        $response->assertJsonStructure([
            'data',
            'meta' => ['current_page', 'last_page', 'total', 'per_page'],
        ]);
    }
}
