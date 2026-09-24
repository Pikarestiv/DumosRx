<?php

namespace Tests\Feature;

use App\Models\PaymentTransaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Regression coverage for PaymentController's webhook handlers, added
 * alongside three fixes:
 * - An unset/empty configured secret used to silently coerce to an empty
 *   HMAC key (Paystack) or an empty string comparison (Flutterwave), making
 *   a forged signature trivial. Both handlers now fail closed with a 500.
 * - The Flutterwave handler was comparing `verif-hash` against the wrong
 *   config value (`encryption_key` instead of a proper `secret_hash`).
 * - Neither handler checked the webhook's reported amount/currency against
 *   the PaymentTransaction before activating a subscription, so a genuine
 *   webhook for a smaller/wrong-currency charge could still activate a more
 *   expensive plan.
 */
class PaymentWebhookTest extends TestCase
{
    use RefreshDatabase;

    protected User $user;

    const PAYSTACK_SECRET = 'sk_test_paystack_secret';
    const FLUTTERWAVE_SECRET_HASH = 'flw-test-secret-hash';

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'payment.paystack.secret_key' => self::PAYSTACK_SECRET,
            'payment.flutterwave.secret_hash' => self::FLUTTERWAVE_SECRET_HASH,
        ]);

        $this->user = User::create([
            'first_name' => 'Owner', 'last_name' => 'User',
            'email' => 'webhook-subscriber@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);
    }

    protected function makeTransaction(array $overrides = []): PaymentTransaction
    {
        return PaymentTransaction::create(array_merge([
            'provider' => 'paystack',
            'provider_reference' => 'REF-WEBHOOK-1',
            'amount' => 8000,
            'currency' => 'NGN',
            'status' => 'pending',
            'metadata' => [
                'plan_name' => 'pro',
                'user_id' => $this->user->id,
                'interval' => 'monthly',
            ],
        ], $overrides));
    }

    protected function postPaystackWebhook(array $payload, ?string $secret = self::PAYSTACK_SECRET)
    {
        $body = json_encode($payload);
        // Content-Type must be set explicitly here: $this->call() posts the
        // raw $body string directly, and without it Laravel never parses the
        // body into $request->input() (the signature check over the raw
        // content still "passes" regardless, which is what made this easy
        // to get wrong - the response looks like a success with no data ever
        // actually read).
        $headers = ['Content-Type' => 'application/json'];
        if ($secret !== null) {
            $headers['x-paystack-signature'] = hash_hmac('sha512', $body, $secret);
        }

        return $this->call('POST', '/api/v1/webhooks/paystack', [], [], [], $this->transformHeadersToServerVars($headers), $body);
    }

    protected function postFlutterwaveWebhook(array $payload, ?string $secretHash = self::FLUTTERWAVE_SECRET_HASH)
    {
        $body = json_encode($payload);
        $headers = ['Content-Type' => 'application/json'];
        if ($secretHash !== null) {
            $headers['verif-hash'] = $secretHash;
        }

        return $this->call('POST', '/api/v1/webhooks/flutterwave', [], [], [], $this->transformHeadersToServerVars($headers), $body);
    }

    // --- Paystack: signature handling -----------------------------------

    public function test_paystack_webhook_with_valid_signature_activates_a_matching_transaction()
    {
        $this->makeTransaction();

        $response = $this->postPaystackWebhook([
            'event' => 'charge.success',
            'data' => ['reference' => 'REF-WEBHOOK-1', 'amount' => 800000, 'currency' => 'NGN'],
        ]);

        $response->assertStatus(200);
        $this->assertDatabaseHas('payment_transactions', ['provider_reference' => 'REF-WEBHOOK-1', 'status' => 'success']);
        $this->assertDatabaseHas('subscriptions', ['user_id' => $this->user->id, 'plan_name' => 'pro', 'status' => 'active']);
    }

    public function test_paystack_webhook_rejects_an_invalid_signature()
    {
        $txn = $this->makeTransaction();

        $body = json_encode([
            'event' => 'charge.success',
            'data' => ['reference' => 'REF-WEBHOOK-1', 'amount' => 800000, 'currency' => 'NGN'],
        ]);
        $response = $this->call('POST', '/api/v1/webhooks/paystack', [], [], [], [
            'HTTP_X-Paystack-Signature' => 'not-a-real-signature',
        ], $body);

        $response->assertStatus(400);
        $this->assertSame('pending', $txn->fresh()->status);
    }

    public function test_paystack_webhook_rejects_a_missing_signature_header()
    {
        $txn = $this->makeTransaction();

        $response = $this->postPaystackWebhook([
            'event' => 'charge.success',
            'data' => ['reference' => 'REF-WEBHOOK-1', 'amount' => 800000, 'currency' => 'NGN'],
        ], secret: null);

        $response->assertStatus(400);
        $this->assertSame('pending', $txn->fresh()->status);
    }

    public function test_paystack_webhook_fails_closed_when_the_secret_is_not_configured()
    {
        config(['payment.paystack.secret_key' => '']);
        $txn = $this->makeTransaction();

        // Even a signature computed against the empty string must not pass.
        $response = $this->postPaystackWebhook([
            'event' => 'charge.success',
            'data' => ['reference' => 'REF-WEBHOOK-1', 'amount' => 800000, 'currency' => 'NGN'],
        ], secret: '');

        $response->assertStatus(500);
        $this->assertSame('pending', $txn->fresh()->status);
    }

    // --- Paystack: amount/currency verification --------------------------

    public function test_paystack_webhook_refuses_to_activate_on_amount_mismatch()
    {
        $txn = $this->makeTransaction(['amount' => 8000]);

        // Reports a charge for half the expected amount (kobo).
        $response = $this->postPaystackWebhook([
            'event' => 'charge.success',
            'data' => ['reference' => 'REF-WEBHOOK-1', 'amount' => 400000, 'currency' => 'NGN'],
        ]);

        // Still 200: the payload is genuinely signed, nothing for Paystack to retry.
        $response->assertStatus(200);
        $txn->refresh();
        $this->assertSame('failed', $txn->status);
        $this->assertSame('amount_or_currency_mismatch', $txn->metadata['suspicious_webhook']['reason'] ?? null);
        $this->assertDatabaseMissing('subscriptions', ['user_id' => $this->user->id, 'plan_name' => 'pro']);
    }

    public function test_paystack_webhook_refuses_to_activate_on_currency_mismatch()
    {
        $txn = $this->makeTransaction(['amount' => 8000, 'currency' => 'NGN']);

        $response = $this->postPaystackWebhook([
            'event' => 'charge.success',
            'data' => ['reference' => 'REF-WEBHOOK-1', 'amount' => 800000, 'currency' => 'USD'],
        ]);

        $response->assertStatus(200);
        $txn->refresh();
        $this->assertSame('failed', $txn->status);
        $this->assertDatabaseMissing('subscriptions', ['user_id' => $this->user->id, 'plan_name' => 'pro']);
    }

    public function test_paystack_webhook_amount_conversion_from_kobo_is_correct()
    {
        // 8000 naira == 800000 kobo exactly; anything less must fail, this
        // exact amount must pass. Guards against a factor-of-100 regression.
        $this->makeTransaction(['amount' => 8000]);

        $response = $this->postPaystackWebhook([
            'event' => 'charge.success',
            'data' => ['reference' => 'REF-WEBHOOK-1', 'amount' => 800000, 'currency' => 'NGN'],
        ]);

        $response->assertStatus(200);
        $this->assertDatabaseHas('payment_transactions', ['provider_reference' => 'REF-WEBHOOK-1', 'status' => 'success']);
    }

    // --- Flutterwave: signature handling ---------------------------------

    public function test_flutterwave_webhook_with_valid_secret_hash_activates_a_matching_transaction()
    {
        $this->makeTransaction(['provider' => 'flutterwave', 'provider_reference' => 'DRX-FW-1']);

        $response = $this->postFlutterwaveWebhook([
            'event' => 'charge.completed',
            'data' => ['tx_ref' => 'DRX-FW-1', 'status' => 'successful', 'amount' => 8000, 'currency' => 'NGN'],
        ]);

        $response->assertStatus(200);
        $this->assertDatabaseHas('payment_transactions', ['provider_reference' => 'DRX-FW-1', 'status' => 'success']);
        $this->assertDatabaseHas('subscriptions', ['user_id' => $this->user->id, 'plan_name' => 'pro', 'status' => 'active']);
    }

    public function test_flutterwave_webhook_rejects_an_invalid_secret_hash()
    {
        $txn = $this->makeTransaction(['provider' => 'flutterwave', 'provider_reference' => 'DRX-FW-1']);

        $response = $this->postFlutterwaveWebhook([
            'event' => 'charge.completed',
            'data' => ['tx_ref' => 'DRX-FW-1', 'status' => 'successful', 'amount' => 8000, 'currency' => 'NGN'],
        ], secretHash: 'wrong-hash');

        $response->assertStatus(400);
        $this->assertSame('pending', $txn->fresh()->status);
    }

    public function test_flutterwave_webhook_fails_closed_when_the_secret_hash_is_not_configured()
    {
        config(['payment.flutterwave.secret_hash' => '']);
        $txn = $this->makeTransaction(['provider' => 'flutterwave', 'provider_reference' => 'DRX-FW-1']);

        $response = $this->postFlutterwaveWebhook([
            'event' => 'charge.completed',
            'data' => ['tx_ref' => 'DRX-FW-1', 'status' => 'successful', 'amount' => 8000, 'currency' => 'NGN'],
        ], secretHash: '');

        $response->assertStatus(500);
        $this->assertSame('pending', $txn->fresh()->status);
    }

    public function test_flutterwave_webhook_amount_is_compared_unconverted_in_naira()
    {
        // Flutterwave reports the major unit already - unlike Paystack, no
        // /100 conversion should be applied. A regression that added a wrong
        // /100 division here would take a correct 8000-naira report down to
        // 80 and wrongly reject a genuine payment; a regression that instead
        // expected kobo would accept a genuinely-insufficient naira report
        // (e.g. 100, two orders of magnitude short) as if it were enough.
        // Cover both directions with the transaction's exact expected amount.
        $txn = $this->makeTransaction(['provider' => 'flutterwave', 'provider_reference' => 'DRX-FW-1', 'amount' => 8000]);

        $underpaid = $this->postFlutterwaveWebhook([
            'event' => 'charge.completed',
            'data' => ['tx_ref' => 'DRX-FW-1', 'status' => 'successful', 'amount' => 100, 'currency' => 'NGN'],
        ]);
        $underpaid->assertStatus(200);
        $this->assertSame('failed', $txn->fresh()->status);
    }

    public function test_flutterwave_webhook_accepts_the_exact_expected_naira_amount()
    {
        $txn = $this->makeTransaction(['provider' => 'flutterwave', 'provider_reference' => 'DRX-FW-1', 'amount' => 8000]);

        $response = $this->postFlutterwaveWebhook([
            'event' => 'charge.completed',
            'data' => ['tx_ref' => 'DRX-FW-1', 'status' => 'successful', 'amount' => 8000, 'currency' => 'NGN'],
        ]);

        $response->assertStatus(200);
        $this->assertSame('success', $txn->fresh()->status);
    }

    // --- Idempotency ------------------------------------------------------

    public function test_a_second_webhook_for_an_already_activated_transaction_does_not_double_activate()
    {
        $this->makeTransaction();

        $payload = [
            'event' => 'charge.success',
            'data' => ['reference' => 'REF-WEBHOOK-1', 'amount' => 800000, 'currency' => 'NGN'],
        ];

        $this->postPaystackWebhook($payload)->assertStatus(200);
        $this->postPaystackWebhook($payload)->assertStatus(200);

        $this->assertSame(1, \App\Models\Subscription::where('user_id', $this->user->id)->where('plan_name', 'pro')->count());
    }

    public function test_an_unknown_reference_is_silently_ignored()
    {
        $response = $this->postPaystackWebhook([
            'event' => 'charge.success',
            'data' => ['reference' => 'REF-DOES-NOT-EXIST', 'amount' => 800000, 'currency' => 'NGN'],
        ]);

        $response->assertStatus(200);
        $this->assertDatabaseMissing('payment_transactions', ['provider_reference' => 'REF-DOES-NOT-EXIST']);
    }
}
