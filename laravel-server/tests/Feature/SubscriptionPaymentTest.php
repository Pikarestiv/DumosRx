<?php

namespace Tests\Feature;

use App\Models\PaymentTransaction;
use App\Models\Subscription;
use App\Models\SystemConfig;
use App\Models\User;
use App\Services\Payment\PaymentService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Regression coverage for two SubscriptionController bugs:
 * - initiatePayment() trusted the client-supplied `amount`/`plan_name`
 *   outright instead of re-deriving the price from the configured tiers,
 *   so a forged `amount: 0` self-activated any plan for free.
 * - verifyPayment() read-then-wrote a PaymentTransaction's status with no
 *   locking, so two concurrent calls for the same reference could both
 *   create a Subscription and both award referral credit.
 */
class SubscriptionPaymentTest extends TestCase
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
                'enterprise' => ['price_monthly' => 15000, 'price_yearly' => 150000],
            ],
        ]);

        $this->user = User::create([
            'first_name' => 'Owner', 'last_name' => 'User',
            'email' => 'subscriber@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $this->withoutMiddleware();
    }

    public function test_a_forged_zero_amount_does_not_self_activate_a_paid_plan()
    {
        // The server re-derives the real price (₦150,000/yr) from the tier
        // config, so this must fall through to the real payment-session
        // branch, never the "activated directly" one -- asserted here via
        // initializeTransaction receiving the true price, not the forged 0.
        $this->mock(PaymentService::class, function ($mock) {
            $mock->shouldReceive('initializeTransaction')
                ->once()
                ->withArgs(fn ($amount) => $amount === 150000.0)
                ->andReturn(['provider' => 'paystack', 'reference' => 'REF-ENT', 'checkout_url' => 'https://paystack.test/pay']);
        });

        $response = $this->actingAs($this->user)->postJson('/api/v1/subscription/pay', [
            'amount' => 0,
            'plan_name' => 'enterprise',
            'interval' => 'yearly',
        ]);

        $response->assertStatus(200);
        $response->assertJsonPath('payment_url', 'https://paystack.test/pay');
        $this->assertDatabaseMissing('subscriptions', ['user_id' => $this->user->id, 'plan_name' => 'enterprise']);
    }

    public function test_a_forged_amount_below_the_real_price_still_creates_a_correctly_priced_transaction()
    {
        $this->mock(PaymentService::class, function ($mock) {
            $mock->shouldReceive('initializeTransaction')
                ->once()
                ->withArgs(fn ($amount) => $amount === 15000.0)
                ->andReturn(['provider' => 'paystack', 'reference' => 'REF-1', 'checkout_url' => 'https://paystack.test/pay']);
        });

        $response = $this->actingAs($this->user)->postJson('/api/v1/subscription/pay', [
            'amount' => 1, // forged
            'plan_name' => 'enterprise',
            'interval' => 'monthly',
        ]);

        $response->assertStatus(200);
        $this->assertDatabaseHas('payment_transactions', ['provider_reference' => 'REF-1', 'amount' => 15000]);
    }

    public function test_an_invalid_plan_name_is_rejected_instead_of_activated()
    {
        $response = $this->actingAs($this->user)->postJson('/api/v1/subscription/pay', [
            'amount' => 0,
            'plan_name' => 'not-a-real-plan',
            'interval' => 'monthly',
        ]);

        $response->assertStatus(422);
        $this->assertDatabaseCount('subscriptions', 0);
    }

    public function test_the_free_tiers_genuinely_zero_price_still_activates_directly()
    {
        $response = $this->actingAs($this->user)->postJson('/api/v1/subscription/pay', [
            'amount' => 999999, // forged high, must still be ignored in favor of the real (0) price
            'plan_name' => 'free',
            'interval' => 'monthly',
        ]);

        $response->assertStatus(200);
        $response->assertJson(['success' => true, 'payment_url' => null]);
        $this->assertDatabaseHas('subscriptions', ['user_id' => $this->user->id, 'plan_name' => 'free', 'status' => 'active']);
    }

    public function test_verifying_an_already_successful_transaction_does_not_create_a_second_subscription()
    {
        $txn = PaymentTransaction::create([
            'provider' => 'paystack',
            'provider_reference' => 'REF-ALREADY-DONE',
            'amount' => 8000,
            'currency' => 'NGN',
            'status' => 'success',
            'metadata' => ['plan_name' => 'pro', 'user_id' => $this->user->id, 'interval' => 'monthly'],
        ]);
        Subscription::create([
            'user_id' => $this->user->id, 'plan_name' => 'pro',
            'start_date' => now(), 'end_date' => now()->addMonth(),
            'status' => 'active', 'license_key' => 'DRX-EXISTING',
        ]);
        $txn->update(['subscription_id' => Subscription::first()->id]);

        $response = $this->actingAs($this->user)->postJson('/api/v1/subscription/verify', [
            'reference' => 'REF-ALREADY-DONE',
        ]);

        $response->assertStatus(200);
        $response->assertJson(['success' => true, 'message' => 'Payment already verified.']);
        $this->assertDatabaseCount('subscriptions', 1);
    }

    public function test_verify_payment_activates_a_subscription_for_a_genuinely_successful_transaction()
    {
        PaymentTransaction::create([
            'provider' => 'paystack',
            'provider_reference' => 'REF-NEW',
            'amount' => 8000,
            'currency' => 'NGN',
            'status' => 'pending',
            'metadata' => ['plan_name' => 'pro', 'user_id' => $this->user->id, 'interval' => 'monthly'],
        ]);

        $this->mock(PaymentService::class, function ($mock) {
            $mock->shouldReceive('verifyTransaction')
                ->once()
                ->andReturn(['success' => true, 'amount' => 8000, 'currency' => 'NGN', 'data' => []]);
        });

        $response = $this->actingAs($this->user)->postJson('/api/v1/subscription/verify', [
            'reference' => 'REF-NEW',
        ]);

        $response->assertStatus(200);
        $this->assertDatabaseHas('subscriptions', ['user_id' => $this->user->id, 'plan_name' => 'pro', 'status' => 'active']);
        $this->assertDatabaseCount('subscriptions', 1);
    }

    /**
     * Regression test for Fix D.1: PaymentService rounds the amount sent to
     * Paystack to the nearest kobo, but $txn->amount (naira) can retain
     * sub-kobo float precision from coupon-percentage arithmetic - a
     * genuine payment verifying at 13124.12 against a $txn->amount of
     * 13124.124 must not be marked failed by a strict `<` comparison.
     */
    public function test_verify_payment_tolerates_sub_kobo_float_precision_in_txn_amount()
    {
        PaymentTransaction::create([
            'provider' => 'paystack',
            'provider_reference' => 'REF-SUBKOBO',
            'amount' => 13124.124,
            'currency' => 'NGN',
            'status' => 'pending',
            'metadata' => ['plan_name' => 'pro', 'user_id' => $this->user->id, 'interval' => 'monthly'],
        ]);

        $this->mock(PaymentService::class, function ($mock) {
            $mock->shouldReceive('verifyTransaction')
                ->once()
                ->andReturn(['success' => true, 'amount' => 13124.12, 'currency' => 'NGN', 'data' => []]);
        });

        $response = $this->actingAs($this->user)->postJson('/api/v1/subscription/verify', [
            'reference' => 'REF-SUBKOBO',
        ]);

        $response->assertStatus(200);
        $response->assertJson(['success' => true]);
        $this->assertDatabaseHas('payment_transactions', ['provider_reference' => 'REF-SUBKOBO', 'status' => 'success']);
    }

    /**
     * Regression test for Fix D.2: the failure-branch status write ran
     * outside any lock and without re-checking the transaction was still
     * pending - if the webhook already activated the subscription (status
     * already 'success') and a stale/short verify call arrived after, this
     * write corrupted the transaction's status back to 'failed' while the
     * subscription stayed active. It must now be a no-op once the
     * transaction is no longer pending.
     */
    public function test_a_stale_failed_verification_does_not_revert_an_already_successful_transaction()
    {
        $txn = PaymentTransaction::create([
            'provider' => 'paystack',
            'provider_reference' => 'REF-STALE',
            'amount' => 8000,
            'currency' => 'NGN',
            'status' => 'pending',
            'metadata' => ['plan_name' => 'pro', 'user_id' => $this->user->id, 'interval' => 'monthly'],
        ]);

        // Simulates the webhook winning the race and activating the
        // subscription WHILE this verify call's own (slow/third-party)
        // verifyTransaction() call is in flight, by mutating the row as a
        // side effect of that mocked call and then returning a failed
        // verification result - exactly the interleaving Fix D.2 guards
        // against.
        $this->mock(PaymentService::class, function ($mock) use ($txn) {
            $mock->shouldReceive('verifyTransaction')
                ->once()
                ->andReturnUsing(function () use ($txn) {
                    $webhookTxn = PaymentTransaction::find($txn->id);
                    app(\App\Http\Controllers\Api\Web\SubscriptionController::class)
                        ->activateSubscriptionFromTransaction($webhookTxn);

                    return ['success' => false, 'amount' => 0, 'data' => []];
                });
        });

        $response = $this->actingAs($this->user)->postJson('/api/v1/subscription/verify', [
            'reference' => 'REF-STALE',
        ]);

        // This stale caller still sees its own (failed) verification result
        // reported back - the fix's guarantee is about the DB row, not this
        // response: the transaction that the webhook already activated must
        // remain 'success' with its subscription intact, not get stomped
        // back to 'failed' out from under an active subscription.
        $response->assertStatus(400);
        $response->assertJson(['success' => false]);
        $this->assertDatabaseHas('payment_transactions', ['provider_reference' => 'REF-STALE', 'status' => 'success']);
        $this->assertDatabaseHas('subscriptions', ['user_id' => $this->user->id, 'plan_name' => 'pro', 'status' => 'active']);
    }
}
