<?php

namespace Tests\Feature;

use App\Http\Controllers\Api\Web\SubscriptionController;
use App\Models\PaymentTransaction;
use App\Models\SystemConfig;
use App\Models\User;
use App\Services\Payment\PaymentService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * A-79: referral credits applied to a paid checkout were recorded in the
 * transaction's metadata at initiation but only deducted at activation, with
 * no reservation in between. A second credit-funded checkout consuming the
 * balance first made the activation-time deductCredits() throw, rolling back
 * the whole activation (including the status -> 'success' transition) and
 * leaving a paid subscription that no code path could ever activate, with the
 * Paystack webhook retrying and 500ing forever.
 */
class SubscriptionCreditReservationTest extends TestCase
{
    use RefreshDatabase;

    protected User $user;

    protected function setUp(): void
    {
        parent::setUp();

        SystemConfig::setVal('subscription_plans', [
            'tiers' => [
                'free' => ['price_monthly' => 0, 'price_yearly' => 0],
                'pro' => ['price_monthly' => 8000, 'price_yearly' => 80000],
            ],
        ]);

        $this->user = User::create([
            'first_name' => 'Credit', 'last_name' => 'User',
            'email' => 'credit-user@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
            'referral_credits' => 5000,
        ]);

        $this->withoutMiddleware();
    }

    private function initiatePaidCheckoutWithCredits(string $reference): PaymentTransaction
    {
        $this->mock(PaymentService::class, function ($mock) use ($reference) {
            $mock->shouldReceive('initializeTransaction')
                ->once()
                ->andReturn([
                    'provider' => 'paystack',
                    'reference' => $reference,
                    'checkout_url' => 'https://paystack.test/' . $reference,
                ]);
        });

        $this->actingAs($this->user)->postJson('/api/v1/subscription/pay', [
            'amount' => 8000,
            'plan_name' => 'pro',
            'interval' => 'monthly',
            'use_credits' => true,
        ])->assertStatus(200);

        return PaymentTransaction::where('provider_reference', $reference)->firstOrFail();
    }

    public function test_initiating_a_paid_checkout_with_credits_reserves_them_immediately()
    {
        $txn = $this->initiatePaidCheckoutWithCredits('REF-RESERVE');

        $this->assertSame(5000.0, (float) $txn->metadata['credits_applied']);
        $this->assertTrue($txn->metadata['credits_reserved']);
        $this->assertSame(0.0, (float) $this->user->fresh()->referral_credits);
        $this->assertDatabaseHas('referral_credit_transactions', [
            'user_id' => $this->user->id,
            'type' => 'spent',
            'amount' => 5000,
        ]);
    }

    /**
     * The exact race from the report: two checkouts initiated against the
     * same balance, the second one activating. With credits reserved at
     * initiation the second checkout can only apply what is actually left,
     * so activation can never be blocked by a bookkeeping shortfall.
     */
    public function test_two_concurrent_credit_funded_checkouts_both_activate()
    {
        $first = $this->initiatePaidCheckoutWithCredits('REF-A');
        $second = $this->initiatePaidCheckoutWithCredits('REF-B');

        $this->assertSame(5000.0, (float) $first->metadata['credits_applied']);
        $this->assertSame(0.0, (float) $second->metadata['credits_applied']);
        $this->assertSame(8000.0, (float) $second->amount);

        $controller = app(SubscriptionController::class);

        $secondResult = $controller->activateSubscriptionFromTransaction($second->fresh());
        $this->assertFalse($secondResult['already']);
        $this->assertNotNull($secondResult['subscription']);
        $this->assertSame('success', $second->fresh()->status);

        $firstResult = $controller->activateSubscriptionFromTransaction($first->fresh());
        $this->assertFalse($firstResult['already']);
        $this->assertSame('success', $first->fresh()->status);

        $this->assertSame(0.0, (float) $this->user->fresh()->referral_credits);
        $this->assertDatabaseCount('referral_credit_transactions', 1);
    }

    public function test_activation_does_not_deduct_reserved_credits_a_second_time()
    {
        $txn = $this->initiatePaidCheckoutWithCredits('REF-ONCE');

        app(SubscriptionController::class)->activateSubscriptionFromTransaction($txn->fresh());

        $this->assertSame(0.0, (float) $this->user->fresh()->referral_credits);
        $this->assertDatabaseCount('referral_credit_transactions', 1);
    }

    /**
     * A transaction created before reservation existed carries
     * credits_applied with no credits_reserved flag. Activation must still
     * deduct what it can and never throw, so a legacy pending transaction
     * can't be stranded by a balance that has since moved.
     */
    public function test_a_legacy_unreserved_transaction_activates_even_when_the_balance_has_moved()
    {
        $txn = PaymentTransaction::create([
            'provider' => 'paystack',
            'provider_reference' => 'REF-LEGACY',
            'amount' => 3000,
            'currency' => 'NGN',
            'status' => 'pending',
            'metadata' => [
                'plan_name' => 'pro',
                'user_id' => $this->user->id,
                'interval' => 'monthly',
                'credits_applied' => 5000,
            ],
        ]);

        $this->user->forceFill(['referral_credits' => 1000])->save();

        $result = app(SubscriptionController::class)->activateSubscriptionFromTransaction($txn);

        $this->assertFalse($result['already']);
        $this->assertNotNull($result['subscription']);
        $this->assertSame('success', $txn->fresh()->status);
        $this->assertSame(0.0, (float) $this->user->fresh()->referral_credits);
    }

    public function test_a_failed_verification_releases_the_reserved_credits()
    {
        $this->initiatePaidCheckoutWithCredits('REF-FAIL');

        $this->mock(PaymentService::class, function ($mock) {
            $mock->shouldReceive('verifyTransaction')
                ->once()
                ->andReturn(['success' => false, 'amount' => 0, 'currency' => 'NGN', 'data' => []]);
        });

        $this->actingAs($this->user)->postJson('/api/v1/subscription/verify', [
            'reference' => 'REF-FAIL',
        ])->assertStatus(400);

        $this->assertSame('failed', PaymentTransaction::where('provider_reference', 'REF-FAIL')->value('status'));
        $this->assertSame(5000.0, (float) $this->user->fresh()->referral_credits);
    }

    public function test_releasing_reserved_credits_is_idempotent()
    {
        $txn = $this->initiatePaidCheckoutWithCredits('REF-IDEMPOTENT');
        $controller = app(SubscriptionController::class);

        $controller->failTransaction($txn->fresh());
        $controller->failTransaction($txn->fresh());

        $this->assertSame(5000.0, (float) $this->user->fresh()->referral_credits);
    }

    public function test_a_fully_credit_covered_checkout_still_activates_directly()
    {
        $this->user->forceFill(['referral_credits' => 20000])->save();

        $this->actingAs($this->user)->postJson('/api/v1/subscription/pay', [
            'amount' => 8000,
            'plan_name' => 'pro',
            'interval' => 'monthly',
            'use_credits' => true,
        ])->assertStatus(200)->assertJsonPath('payment_url', null);

        $this->assertSame(12000.0, (float) $this->user->fresh()->referral_credits);
        $this->assertDatabaseHas('subscriptions', ['user_id' => $this->user->id, 'plan_name' => 'pro']);
    }
}
