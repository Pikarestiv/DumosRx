<?php

namespace Tests\Feature;

use App\Models\PaymentTransaction;
use App\Models\Product;
use App\Models\StockBatch;
use App\Models\Store;
use App\Models\StorefrontPaymentIntent;
use App\Models\SystemConfig;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * A-81: every Paystack/Flutterwave call must carry a timeout (an unbounded
 * one holds a PHP-FPM worker for the whole socket lifetime, which on shared
 * hosting is a full outage), and a verification that never reached the
 * provider is "unknown", not "failed" — the money may have moved, so nothing
 * may be booked and nothing may be marked failed.
 */
class PaymentProviderTimeoutTest extends TestCase
{
    use RefreshDatabase;

    protected User $owner;

    protected Store $store;

    protected Product $product;

    protected function setUp(): void
    {
        parent::setUp();

        config(['payment.paystack.secret_key' => 'sk_test_fake']);

        SystemConfig::setVal('subscription_plans', [
            'tiers' => ['free' => ['features' => ['store_url' => true]]],
        ]);

        $this->owner = User::create([
            'first_name' => 'Timeout', 'last_name' => 'Owner',
            'email' => 'timeout-owner@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $this->store = Store::create([
            'user_id' => $this->owner->id, 'name' => 'Timeout Chemist',
            'store_slug' => 'timeout-chemist', 'device_id' => 'WEB-TIMEOUT',
            'currency' => 'NGN', 'online_store_enabled' => true,
        ]);

        $this->product = Product::create([
            'name' => 'Panadol', 'selling_price' => 250,
            'is_active' => true, 'show_online' => true,
            'user_id' => $this->owner->id, 'store_id' => $this->store->id,
        ]);
        StockBatch::create([
            'product_id' => $this->product->id, 'user_id' => $this->owner->id,
            'batch_number' => 'B-TO-1', 'quantity' => 10, 'cost_price' => 100,
            'expiry_date' => now()->addYear(),
        ]);

        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
            \App\Http\Middleware\CheckPermission::class,
            \App\Http\Middleware\CheckSubscription::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);
    }

    /**
     * Guzzle's default request timeout is 0 — wait forever — and the options
     * are not visible on a faked request, so this is asserted at the source
     * level, the same way TenantScopingArchitectureTest pins its convention.
     */
    #[Test]
    public function every_payment_provider_call_sets_a_request_and_connect_timeout()
    {
        $files = [
            app_path('Services/Payment/PaymentService.php'),
            app_path('Services/Payment/PaystackSubaccountService.php'),
        ];

        foreach ($files as $file) {
            $source = file_get_contents($file);

            $clients = substr_count($source, 'Http::withToken(');

            $this->assertGreaterThan(0, $clients);
            $this->assertSame(
                $clients,
                substr_count($source, '->timeout('),
                basename($file).': every provider client must set a request timeout.'
            );
            $this->assertSame(
                $clients,
                substr_count($source, '->connectTimeout('),
                basename($file).': every provider client must set a connect timeout.'
            );
        }
    }

    #[Test]
    public function a_verification_that_never_reached_paystack_is_reported_as_unknown()
    {
        Http::fake([
            'api.paystack.co/transaction/verify/*' => fn () => throw new ConnectionException('cURL error 28: timed out'),
        ]);

        $result = app(\App\Services\Payment\PaymentService::class)->verifyTransaction('TO-REF-1', 'paystack');

        $this->assertFalse($result['success']);
        $this->assertTrue($result['unknown']);
    }

    #[Test]
    public function a_storefront_checkout_whose_verification_times_out_books_no_order()
    {
        StorefrontPaymentIntent::create([
            'store_id' => $this->store->id,
            'reference' => 'TO-REF-2',
            'provider' => 'paystack',
            'amount' => 500,
            'currency' => 'NGN',
            'items' => [['product_id' => $this->product->id, 'quantity' => 2]],
            'status' => 'pending',
        ]);

        Http::fake([
            'api.paystack.co/*' => fn () => throw new ConnectionException('cURL error 28: timed out'),
        ]);

        $response = $this->postJson('/api/v1/storefront/timeout-chemist/checkout', [
            'customer_name' => 'Ada',
            'customer_phone' => '08000000000',
            'payment_method' => 'paystack',
            'paystack_reference' => 'TO-REF-2',
            'items' => [['product_id' => $this->product->id, 'quantity' => 2]],
        ]);

        $response->assertStatus(503);
        $this->assertStringContainsString('TO-REF-2', $response->json('message'));
        $this->assertDatabaseCount('online_orders', 0);
        $this->assertDatabaseHas('storefront_payment_intents', [
            'reference' => 'TO-REF-2', 'status' => 'pending',
        ]);
    }

    #[Test]
    public function a_subscription_verification_that_times_out_does_not_mark_the_transaction_failed()
    {
        $txn = PaymentTransaction::create([
            'user_id' => $this->owner->id,
            'reference' => 'DRX-TO-1',
            'provider' => 'paystack',
            'provider_reference' => 'TO-REF-3',
            'amount' => 15000,
            'currency' => 'NGN',
            'status' => 'pending',
            'plan_name' => 'basic',
            'metadata' => ['user_id' => $this->owner->id],
        ]);

        Http::fake([
            'api.paystack.co/*' => fn () => throw new ConnectionException('cURL error 28: timed out'),
        ]);

        $this->actingAs($this->owner)
            ->postJson('/api/v1/subscription/verify', ['reference' => 'TO-REF-3'])
            ->assertStatus(503);

        $this->assertSame('pending', $txn->fresh()->status);
    }
}
