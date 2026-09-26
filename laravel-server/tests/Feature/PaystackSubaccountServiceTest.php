<?php

namespace Tests\Feature;

use App\Services\Payment\PaystackSubaccountService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class PaystackSubaccountServiceTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['payment.paystack.secret_key' => 'sk_test_fake']);
    }

    public function test_list_banks_returns_the_bank_array_on_success()
    {
        Http::fake([
            'api.paystack.co/bank*' => Http::response([
                'status' => true,
                'data' => [
                    ['name' => 'GTBank', 'code' => '058'],
                    ['name' => 'Access Bank', 'code' => '044'],
                ],
            ], 200),
        ]);

        $banks = (new PaystackSubaccountService())->listBanks('nigeria');

        $this->assertCount(2, $banks);
        $this->assertSame('058', $banks[0]['code']);
    }

    public function test_list_banks_returns_empty_array_on_failure_rather_than_throwing()
    {
        Http::fake(['api.paystack.co/bank*' => Http::response([], 500)]);

        $banks = (new PaystackSubaccountService())->listBanks('rwanda');

        $this->assertSame([], $banks);
    }

    public function test_resolve_account_returns_resolved_name_on_success()
    {
        Http::fake([
            'api.paystack.co/bank/resolve*' => Http::response([
                'status' => true,
                'data' => ['account_number' => '0123456789', 'account_name' => 'JANE M DOE'],
            ], 200),
        ]);

        $resolved = (new PaystackSubaccountService())->resolveAccount('0123456789', '058', 'nigeria');

        $this->assertSame('JANE M DOE', $resolved['account_name']);
    }

    public function test_resolve_account_returns_null_on_failure_rather_than_throwing()
    {
        Http::fake(['api.paystack.co/bank/resolve*' => Http::response(['status' => false], 422)]);

        $resolved = (new PaystackSubaccountService())->resolveAccount('0000000000', '058', 'nigeria');

        $this->assertNull($resolved);
    }

    public function test_create_subaccount_returns_the_subaccount_code()
    {
        Http::fake([
            'api.paystack.co/subaccount' => Http::response([
                'status' => true,
                'data' => ['subaccount_code' => 'ACCT_abc123'],
            ], 200),
        ]);

        $code = (new PaystackSubaccountService())->createSubaccount(
            'Jane\'s Pharmacy', '058', '0123456789', 2.0,
        );

        $this->assertSame('ACCT_abc123', $code);
        Http::assertSent(function ($request) {
            return $request['percentage_charge'] === 2.0
                && $request['settlement_bank'] === '058'
                && $request['account_number'] === '0123456789';
        });
    }

    public function test_create_subaccount_throws_on_a_provider_error()
    {
        Http::fake(['api.paystack.co/subaccount' => Http::response(['message' => 'Invalid account number'], 400)]);

        $this->expectException(\Exception::class);

        (new PaystackSubaccountService())->createSubaccount('Bad Store', '058', '0000000000', 2.0);
    }

    public function test_update_subaccount_fee_sends_the_new_percentage()
    {
        Http::fake(['api.paystack.co/subaccount/ACCT_abc123' => Http::response(['status' => true], 200)]);

        (new PaystackSubaccountService())->updateSubaccountFee('ACCT_abc123', 3.5);

        Http::assertSent(fn ($request) => $request['percentage_charge'] === 3.5);
    }

    public function test_refund_returns_success_on_a_successful_refund()
    {
        Http::fake(['api.paystack.co/refund' => Http::response(['status' => true, 'message' => 'Refund has been queued for processing'], 200)]);

        $result = (new PaystackSubaccountService())->refund('DRX-REF-1');

        $this->assertTrue($result['success']);
    }

    public function test_refund_returns_failure_on_a_provider_error()
    {
        Http::fake(['api.paystack.co/refund' => Http::response(['status' => false, 'message' => 'Transaction already refunded'], 400)]);

        $result = (new PaystackSubaccountService())->refund('DRX-REF-1');

        $this->assertFalse($result['success']);
        $this->assertSame('Transaction already refunded', $result['message']);
    }
}
