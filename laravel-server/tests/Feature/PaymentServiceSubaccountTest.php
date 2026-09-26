<?php

namespace Tests\Feature;

use App\Services\Payment\PaymentService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class PaymentServiceSubaccountTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config([
            'payment.paystack.secret_key' => 'sk_test_fake',
            'system.subscription_plans' => ['enable_paystack' => true, 'enable_flutterwave' => false],
        ]);
    }

    public function test_initialize_transaction_passes_subaccount_and_currency_to_paystack_when_given()
    {
        Http::fake([
            'api.paystack.co/transaction/initialize' => Http::response([
                'status' => true,
                'data' => ['reference' => 'ref_1', 'authorization_url' => 'https://paystack.com/pay/ref_1'],
            ], 200),
        ]);

        (new PaymentService())->initializeTransaction(
            1000, 'customer@example.com', [], null, 'ACCT_store123', 'KES',
        );

        Http::assertSent(function ($request) {
            return ($request['subaccount'] ?? null) === 'ACCT_store123'
                && ($request['currency'] ?? null) === 'KES';
        });
    }

    public function test_initialize_transaction_omits_subaccount_and_currency_when_not_given()
    {
        // The subscription flow's existing call sites pass neither - must
        // not regress into always sending them.
        Http::fake([
            'api.paystack.co/transaction/initialize' => Http::response([
                'status' => true,
                'data' => ['reference' => 'ref_2', 'authorization_url' => 'https://paystack.com/pay/ref_2'],
            ], 200),
        ]);

        (new PaymentService())->initializeTransaction(1000, 'customer@example.com');

        Http::assertSent(function ($request) {
            return !array_key_exists('subaccount', $request->data())
                && !array_key_exists('currency', $request->data());
        });
    }

    public function test_refund_transaction_delegates_to_paystack_subaccount_service_for_paystack()
    {
        Http::fake([
            'api.paystack.co/refund' => Http::response(['status' => true, 'message' => 'Refunded'], 200),
        ]);

        $result = (new PaymentService())->refundTransaction('ref_1', 'paystack');

        $this->assertTrue($result['success']);
    }

    public function test_refund_transaction_returns_failure_for_flutterwave_with_no_refund_support()
    {
        // Flutterwave refund is genuinely out of scope for this pass - this
        // pins that it fails closed (a clear failure result) rather than
        // silently doing nothing while reporting success.
        $result = (new PaymentService())->refundTransaction('tx_ref_1', 'flutterwave');

        $this->assertFalse($result['success']);
    }
}
