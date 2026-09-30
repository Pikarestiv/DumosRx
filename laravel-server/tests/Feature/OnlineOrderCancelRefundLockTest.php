<?php

namespace Tests\Feature;

use App\Models\OnlineOrder;
use App\Models\Store;
use App\Models\SystemConfig;
use App\Models\User;
use App\Services\Payment\PaystackSubaccountService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * A-82: cancelling a paid online order used to transition and refund with no
 * transaction or row lock, so two concurrent cancels could both reach the
 * provider — a double payout, or (Paystack rejecting the second) a correct
 * refund recorded as still owed.
 */
class OnlineOrderCancelRefundLockTest extends TestCase
{
    use RefreshDatabase;

    protected User $owner;

    protected Store $store;

    protected function setUp(): void
    {
        parent::setUp();

        config(['payment.paystack.secret_key' => 'sk_test_fake']);

        SystemConfig::setVal('subscription_plans', [
            'tiers' => ['free' => ['features' => ['store_url' => true]]],
        ]);

        $this->owner = User::create([
            'first_name' => 'Cancel', 'last_name' => 'Owner',
            'email' => 'cancel-owner@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $this->store = Store::create([
            'user_id' => $this->owner->id, 'name' => 'Cancel Chemist',
            'store_slug' => 'cancel-chemist', 'device_id' => 'WEB-CANCEL',
            'currency' => 'NGN', 'online_store_enabled' => true,
        ]);

        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
            \App\Http\Middleware\CheckPermission::class,
            \App\Http\Middleware\CheckSubscription::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);
    }

    private function paidOrder(): OnlineOrder
    {
        return OnlineOrder::create([
            'store_id' => $this->store->id,
            'customer_name' => 'Ada',
            'customer_phone' => '08000000000',
            'total_amount' => 500,
            'payment_method' => 'paystack',
            'payment_status' => 'paid',
            'order_status' => 'pending',
            'paystack_reference' => 'CANCEL-REF-1',
        ]);
    }

    private function cancel(OnlineOrder $order)
    {
        return $this->actingAs($this->owner)
            ->postJson("/api/v1/app/online-orders/{$order->id}/fulfill", ['status' => 'cancelled']);
    }

    #[Test]
    public function a_second_cancel_never_reaches_the_provider_again()
    {
        Http::fake([
            'api.paystack.co/refund' => Http::response(['status' => true, 'message' => 'Refunded'], 200),
        ]);

        $order = $this->paidOrder();

        $this->cancel($order)->assertStatus(200);
        $this->cancel($order)->assertStatus(409);

        Http::assertSentCount(1);
        $this->assertSame('refunded', $order->fresh()->payment_status);
    }

    #[Test]
    public function a_provider_already_refunded_answer_is_treated_as_a_successful_refund()
    {
        Http::fake([
            'api.paystack.co/refund' => Http::response([
                'status' => false,
                'message' => 'Transaction has been fully reversed',
            ], 400),
        ]);

        $order = $this->paidOrder();

        $this->cancel($order)->assertStatus(200);

        $order->refresh();
        $this->assertSame('cancelled', $order->order_status);
        $this->assertSame('refunded', $order->payment_status);
    }

    #[Test]
    public function the_refund_service_reports_an_already_reversed_transaction_as_success()
    {
        Http::fake([
            'api.paystack.co/refund' => Http::response([
                'status' => false,
                'message' => 'Refund amount is greater than the remaining amount, transaction has already been refunded',
            ], 400),
        ]);

        $result = app(PaystackSubaccountService::class)->refund('CANCEL-REF-1');

        $this->assertTrue($result['success']);
        $this->assertTrue($result['already_refunded']);
    }

    #[Test]
    public function a_genuinely_failed_refund_still_leaves_the_order_flagged_for_manual_handling()
    {
        Http::fake([
            'api.paystack.co/refund' => Http::response([
                'status' => false,
                'message' => 'Transaction not found',
            ], 400),
        ]);

        $order = $this->paidOrder();

        $this->cancel($order)->assertStatus(200);

        $order->refresh();
        $this->assertSame('cancelled', $order->order_status);
        $this->assertSame('paid', $order->payment_status);
    }

    #[Test]
    public function the_cancellation_is_committed_even_when_the_provider_call_throws()
    {
        Http::fake([
            'api.paystack.co/refund' => fn () => throw new \Illuminate\Http\Client\ConnectionException('timed out'),
        ]);

        $order = $this->paidOrder();

        $this->cancel($order)->assertStatus(200);

        $this->assertSame('cancelled', $order->fresh()->order_status);
    }
}
