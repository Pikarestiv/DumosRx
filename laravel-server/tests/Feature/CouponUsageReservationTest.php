<?php

namespace Tests\Feature;

use App\Http\Controllers\Api\Web\SubscriptionController;
use App\Models\Coupon;
use App\Models\CouponUsage;
use App\Models\PaymentTransaction;
use App\Models\Subscription;
use App\Models\SystemConfig;
use App\Models\User;
use App\Services\Payment\PaymentService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * A-80: coupon usage rows were only written at activation, so every
 * concurrent checkout validated against a stale zero-usage count and a
 * `max_uses: 1` coupon could be redeemed without limit. The discount is now
 * reserved — a usage row written under a lock on the coupon — at the moment it
 * is granted, and released if the checkout never completes.
 */
class CouponUsageReservationTest extends TestCase
{
    use RefreshDatabase;

    protected User $firstUser;

    protected User $secondUser;

    protected function setUp(): void
    {
        parent::setUp();

        SystemConfig::setVal('subscription_plans', [
            'tiers' => [
                'free' => ['price_monthly' => 0, 'price_yearly' => 0],
                'pro' => ['price_monthly' => 10000, 'price_yearly' => 100000],
            ],
        ]);

        $this->firstUser = User::create([
            'first_name' => 'First', 'last_name' => 'Redeemer',
            'email' => 'coupon-first@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $this->secondUser = User::create([
            'first_name' => 'Second', 'last_name' => 'Redeemer',
            'email' => 'coupon-second@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $this->withoutMiddleware();
    }

    private function coupon(array $overrides = []): Coupon
    {
        return Coupon::create(array_merge([
            'code' => 'LAUNCH50',
            'type' => 'discount_percent',
            'value' => 50,
            'max_uses' => 1,
            'max_uses_per_user' => 1,
            'is_active' => true,
        ], $overrides));
    }

    private function fakeProvider(string $reference): void
    {
        $this->mock(PaymentService::class, function ($mock) use ($reference) {
            $mock->shouldReceive('initializeTransaction')->andReturn([
                'provider' => 'paystack',
                'reference' => $reference,
                'checkout_url' => 'https://paystack.test/'.$reference,
            ]);
        });
    }

    private function initiate(User $user, string $code = 'LAUNCH50')
    {
        return $this->actingAs($user)->postJson('/api/v1/subscription/pay', [
            'amount' => 10000,
            'plan_name' => 'pro',
            'interval' => 'monthly',
            'coupon_code' => $code,
        ]);
    }

    #[Test]
    public function initiating_a_discounted_checkout_records_the_usage_immediately()
    {
        $coupon = $this->coupon();
        $this->fakeProvider('REF-COUPON-1');

        $this->initiate($this->firstUser)->assertStatus(200);

        $this->assertSame(1, CouponUsage::where('coupon_id', $coupon->id)->count());
        $txn = PaymentTransaction::where('provider_reference', 'REF-COUPON-1')->firstOrFail();
        $this->assertEquals(5000, (float) $txn->amount);
        $this->assertNotNull($txn->metadata['coupon_usage_id']);
    }

    #[Test]
    public function a_single_use_coupon_cannot_be_discounted_twice_before_either_checkout_completes()
    {
        $this->coupon();

        $this->mock(PaymentService::class, function ($mock) {
            $mock->shouldReceive('initializeTransaction')->andReturnUsing(fn () => [
                'provider' => 'paystack',
                'reference' => 'REF-COUPON-'.uniqid(),
                'checkout_url' => 'https://paystack.test/',
            ]);
        });

        $this->initiate($this->firstUser)->assertStatus(200);
        $this->initiate($this->secondUser)->assertStatus(200);

        $amounts = PaymentTransaction::orderBy('created_at')->pluck('amount')->map(fn ($a) => (float) $a)->all();

        $this->assertEqualsWithDelta(5000, $amounts[0], 0.01);
        $this->assertEqualsWithDelta(10000, $amounts[1], 0.01);
    }

    #[Test]
    public function a_fully_discounting_coupon_self_activates_only_once()
    {
        $this->coupon(['value' => 100, 'max_uses' => 1]);

        $this->actingAs($this->firstUser)->postJson('/api/v1/subscription/pay', [
            'amount' => 10000, 'plan_name' => 'pro', 'interval' => 'monthly', 'coupon_code' => 'LAUNCH50',
        ])->assertStatus(200);

        $this->fakeProvider('REF-COUPON-3');

        $this->actingAs($this->firstUser)->postJson('/api/v1/subscription/pay', [
            'amount' => 10000, 'plan_name' => 'pro', 'interval' => 'monthly', 'coupon_code' => 'LAUNCH50',
        ])->assertStatus(200);

        $this->assertSame(1, Subscription::where('user_id', $this->firstUser->id)->count());
        $this->assertSame(1, CouponUsage::count());
    }

    #[Test]
    public function the_self_activated_usage_row_is_linked_to_the_subscription_it_paid_for()
    {
        $this->coupon(['value' => 100]);

        $this->actingAs($this->firstUser)->postJson('/api/v1/subscription/pay', [
            'amount' => 10000, 'plan_name' => 'pro', 'interval' => 'monthly', 'coupon_code' => 'LAUNCH50',
        ])->assertStatus(200);

        $sub = Subscription::where('user_id', $this->firstUser->id)->firstOrFail();

        $this->assertSame($sub->id, CouponUsage::firstOrFail()->subscription_id);
    }

    #[Test]
    public function a_reservation_is_released_when_the_provider_call_fails()
    {
        $this->coupon();

        $this->mock(PaymentService::class, function ($mock) {
            $mock->shouldReceive('initializeTransaction')->andThrow(new \Exception('Paystack Error'));
        });

        $this->initiate($this->firstUser)->assertStatus(500);

        $this->assertSame(0, CouponUsage::count());
    }

    #[Test]
    public function a_reservation_is_released_when_the_transaction_is_marked_failed()
    {
        $this->coupon();
        $this->fakeProvider('REF-COUPON-4');

        $this->initiate($this->firstUser)->assertStatus(200);
        $this->assertSame(1, CouponUsage::count());

        $txn = PaymentTransaction::where('provider_reference', 'REF-COUPON-4')->firstOrFail();
        app(SubscriptionController::class)->failTransaction($txn);

        $this->assertSame(0, CouponUsage::count());
        $this->assertSame('failed', $txn->fresh()->status);
    }

    #[Test]
    public function activating_a_paid_discounted_transaction_does_not_double_count_the_usage()
    {
        $coupon = $this->coupon();
        $this->fakeProvider('REF-COUPON-5');

        $this->initiate($this->firstUser)->assertStatus(200);

        $txn = PaymentTransaction::where('provider_reference', 'REF-COUPON-5')->firstOrFail();
        $result = app(SubscriptionController::class)->activateSubscriptionFromTransaction($txn);

        $this->assertSame(1, CouponUsage::where('coupon_id', $coupon->id)->count());
        $this->assertSame($result['subscription']->id, CouponUsage::firstOrFail()->subscription_id);
    }

    #[Test]
    public function a_legacy_transaction_with_no_reservation_still_records_its_usage_at_activation()
    {
        $coupon = $this->coupon();

        $txn = PaymentTransaction::create([
            'provider' => 'paystack',
            'provider_reference' => 'REF-LEGACY-1',
            'amount' => 5000,
            'currency' => 'NGN',
            'status' => 'pending',
            'metadata' => [
                'plan_name' => 'pro',
                'user_id' => $this->firstUser->id,
                'coupon_code' => 'LAUNCH50',
                'interval' => 'monthly',
            ],
        ]);

        app(SubscriptionController::class)->activateSubscriptionFromTransaction($txn);

        $this->assertSame(1, CouponUsage::where('coupon_id', $coupon->id)->count());
    }
}
