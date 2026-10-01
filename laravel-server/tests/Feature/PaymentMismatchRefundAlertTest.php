<?php

namespace Tests\Feature;

use App\Mail\SuperAdminAlertMail;
use App\Models\PaymentTransaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/**
 * PG-3: a subscription payment whose amount or currency doesn't match what
 * the transaction was created for is refunded automatically, and a human is
 * always told — whether the refund succeeded or not. Covers both observers of
 * a mismatch: the provider's webhook and the user's own verify call.
 */
class PaymentMismatchRefundAlertTest extends TestCase
{
    use RefreshDatabase;

    protected User $user;

    const PAYSTACK_SECRET = 'sk_test_paystack_secret';

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'payment.paystack.secret_key' => self::PAYSTACK_SECRET,
            'dumos.admin_emails' => ['ops@dumosrx.com'],
        ]);

        Mail::fake();

        $this->user = User::create([
            'first_name' => 'Mismatch', 'last_name' => 'Payer',
            'email' => 'mismatch-payer@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);
    }

    protected function makeTransaction(array $overrides = []): PaymentTransaction
    {
        return PaymentTransaction::create(array_merge([
            'provider' => 'paystack',
            'provider_reference' => 'REF-MISMATCH-1',
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

    protected function postPaystackWebhook(array $payload)
    {
        $body = json_encode($payload);
        $headers = [
            'Content-Type' => 'application/json',
            'x-paystack-signature' => hash_hmac('sha512', $body, self::PAYSTACK_SECRET),
        ];

        return $this->call('POST', '/api/v1/webhooks/paystack', [], [], [], $this->transformHeadersToServerVars($headers), $body);
    }

    public function test_an_underpaying_webhook_is_refunded_and_alerted()
    {
        Http::fake([
            'api.paystack.co/refund' => Http::response(['status' => true, 'message' => 'Refund processed'], 200),
        ]);

        $txn = $this->makeTransaction(['amount' => 8000]);

        $this->postPaystackWebhook([
            'event' => 'charge.success',
            'data' => ['reference' => 'REF-MISMATCH-1', 'amount' => 400000, 'currency' => 'NGN'],
        ])->assertStatus(200);

        $txn->refresh();
        $this->assertSame('failed', $txn->status);
        $this->assertTrue($txn->metadata['mismatch_refund']['success'] ?? false);

        Http::assertSent(fn ($request) => $request->url() === 'https://api.paystack.co/refund'
            && $request['transaction'] === 'REF-MISMATCH-1');

        Mail::assertSent(SuperAdminAlertMail::class);
    }

    public function test_a_wrong_currency_webhook_is_refunded_and_alerted()
    {
        Http::fake([
            'api.paystack.co/refund' => Http::response(['status' => true, 'message' => 'Refund processed'], 200),
        ]);

        $this->makeTransaction(['amount' => 8000, 'currency' => 'NGN']);

        $this->postPaystackWebhook([
            'event' => 'charge.success',
            'data' => ['reference' => 'REF-MISMATCH-1', 'amount' => 800000, 'currency' => 'USD'],
        ])->assertStatus(200);

        Http::assertSent(fn ($request) => $request->url() === 'https://api.paystack.co/refund');
        Mail::assertSent(SuperAdminAlertMail::class);
    }

    public function test_a_failed_refund_still_alerts_a_human()
    {
        Http::fake([
            'api.paystack.co/refund' => Http::response(['status' => false, 'message' => 'Transaction not found'], 400),
        ]);

        $txn = $this->makeTransaction(['amount' => 8000]);

        $this->postPaystackWebhook([
            'event' => 'charge.success',
            'data' => ['reference' => 'REF-MISMATCH-1', 'amount' => 400000, 'currency' => 'NGN'],
        ])->assertStatus(200);

        $txn->refresh();
        $this->assertSame('failed', $txn->status);
        $this->assertFalse($txn->metadata['mismatch_refund']['success'] ?? true);

        Mail::assertSent(SuperAdminAlertMail::class);
    }

    public function test_the_verify_path_refunds_and_alerts_on_a_mismatch_too()
    {
        Http::fake([
            'api.paystack.co/transaction/verify/*' => Http::response([
                'status' => true,
                'data' => ['status' => 'success', 'amount' => 400000, 'currency' => 'NGN'],
            ], 200),
            'api.paystack.co/refund' => Http::response(['status' => true, 'message' => 'Refund processed'], 200),
        ]);

        $txn = $this->makeTransaction(['amount' => 8000]);

        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
            \App\Http\Middleware\CheckPermission::class,
            \App\Http\Middleware\CheckSubscription::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);

        $this->actingAs($this->user)
            ->postJson('/api/v1/subscription/verify', ['reference' => 'REF-MISMATCH-1'])
            ->assertStatus(400);

        $this->assertSame('failed', $txn->fresh()->status);
        Http::assertSent(fn ($request) => $request->url() === 'https://api.paystack.co/refund');
        Mail::assertSent(SuperAdminAlertMail::class);
    }

    public function test_a_matching_payment_is_never_refunded()
    {
        Http::fake([
            'api.paystack.co/refund' => Http::response(['status' => true], 200),
        ]);

        $this->makeTransaction(['amount' => 8000]);

        $this->postPaystackWebhook([
            'event' => 'charge.success',
            'data' => ['reference' => 'REF-MISMATCH-1', 'amount' => 800000, 'currency' => 'NGN'],
        ])->assertStatus(200);

        Http::assertNotSent(fn ($request) => $request->url() === 'https://api.paystack.co/refund');
        $this->assertDatabaseHas('payment_transactions', ['provider_reference' => 'REF-MISMATCH-1', 'status' => 'success']);
    }
}
