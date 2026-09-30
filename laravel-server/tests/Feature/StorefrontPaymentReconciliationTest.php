<?php

namespace Tests\Feature;

use App\Mail\SuperAdminAlertMail;
use App\Models\Product;
use App\Models\StockBatch;
use App\Models\Store;
use App\Models\StorefrontPaymentIntent;
use App\Models\SystemConfig;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/**
 * PG-2: a storefront payment no longer depends on the customer's browser
 * coming back. The provider's own webhook records the money against the
 * intent, and a scheduled sweep chases anything left stale.
 */
class StorefrontPaymentReconciliationTest extends TestCase
{
    use RefreshDatabase;

    const PAYSTACK_SECRET = 'sk_test_paystack_secret';

    protected User $owner;
    protected Store $store;
    protected Product $product;

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'payment.paystack.secret_key' => self::PAYSTACK_SECRET,
            'dumos.admin_emails' => ['ops@dumosrx.com'],
        ]);

        Mail::fake();
        // Each test declares the provider calls it expects; a stray one is a
        // bug, not something to silently absorb with a blanket fake (which
        // would also shadow the per-test stubs below).
        Http::preventStrayRequests();

        SystemConfig::setVal('subscription_plans', [
            'tiers' => ['free' => ['features' => ['store_url' => true]]],
        ]);

        $this->owner = User::create([
            'first_name' => 'Recon', 'last_name' => 'Owner',
            'email' => 'recon-owner@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $this->store = Store::create([
            'user_id' => $this->owner->id, 'name' => 'Recon Pharmacy',
            'store_slug' => 'recon-pharmacy', 'device_id' => 'WEB-RECON',
            'currency' => 'NGN', 'online_store_enabled' => true,
            'paystack_subaccount_code' => 'ACCT_recon',
        ]);

        $this->product = Product::create([
            'name' => 'Vitamin C', 'selling_price' => 100,
            'is_active' => true, 'show_online' => true,
            'user_id' => $this->owner->id, 'store_id' => $this->store->id,
        ]);
        StockBatch::create([
            'product_id' => $this->product->id, 'user_id' => $this->owner->id,
            'batch_number' => 'B-RECON-1', 'quantity' => 50, 'cost_price' => 40,
            'expiry_date' => now()->addYear(),
        ]);

        $this->withoutMiddleware([
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);
    }

    protected function makeIntent(array $overrides = []): StorefrontPaymentIntent
    {
        return StorefrontPaymentIntent::create(array_merge([
            'store_id' => $this->store->id,
            'reference' => 'SF-RECON-1',
            'provider' => 'paystack',
            'amount' => 200,
            'currency' => 'NGN',
            'status' => 'pending',
            'items' => [[
                'product_id' => $this->product->id, 'quantity' => 2,
                'unit_price' => 100, 'subtotal' => 200,
            ]],
            'customer_email' => 'buyer@example.com',
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

    // --- webhook -----------------------------------------------------------

    public function test_a_storefront_webhook_marks_the_intent_paid()
    {
        $intent = $this->makeIntent();

        $this->postPaystackWebhook([
            'event' => 'charge.success',
            'data' => ['reference' => 'SF-RECON-1', 'amount' => 20000, 'currency' => 'NGN'],
        ])->assertStatus(200);

        $this->assertSame('paid', $intent->fresh()->status);
    }

    public function test_a_storefront_webhook_does_not_try_to_activate_a_subscription()
    {
        $this->makeIntent();

        $this->postPaystackWebhook([
            'event' => 'charge.success',
            'data' => ['reference' => 'SF-RECON-1', 'amount' => 20000, 'currency' => 'NGN'],
        ])->assertStatus(200);

        $this->assertDatabaseCount('subscriptions', 0);
    }

    public function test_a_storefront_webhook_for_an_underpayment_is_refunded_and_alerted()
    {
        Http::fake([
            'api.paystack.co/refund' => Http::response(['status' => true, 'message' => 'Refund processed'], 200),
        ]);

        $intent = $this->makeIntent();

        $this->postPaystackWebhook([
            'event' => 'charge.success',
            'data' => ['reference' => 'SF-RECON-1', 'amount' => 10000, 'currency' => 'NGN'],
        ])->assertStatus(200);

        $this->assertSame('refunded', $intent->fresh()->status);
        Http::assertSent(fn ($request) => $request->url() === 'https://api.paystack.co/refund'
            && $request['transaction'] === 'SF-RECON-1');
        Mail::assertSent(SuperAdminAlertMail::class);
    }

    public function test_a_webhook_never_disturbs_an_already_consumed_intent()
    {
        Http::fake();
        $intent = $this->makeIntent(['status' => 'consumed']);

        $this->postPaystackWebhook([
            'event' => 'charge.success',
            'data' => ['reference' => 'SF-RECON-1', 'amount' => 20000, 'currency' => 'NGN'],
        ])->assertStatus(200);

        $this->assertSame('consumed', $intent->fresh()->status);
        Http::assertNotSent(fn ($request) => $request->url() === 'https://api.paystack.co/refund');
    }

    public function test_the_return_flow_can_still_place_the_order_after_the_webhook_marked_it_paid()
    {
        $this->makeIntent(['status' => 'paid']);

        Http::fake([
            'api.paystack.co/transaction/verify/*' => Http::response([
                'status' => true,
                'data' => ['status' => 'success', 'amount' => 20000, 'currency' => 'NGN'],
            ], 200),
        ]);

        $this->postJson('/api/v1/storefront/recon-pharmacy/checkout', [
            'customer_name' => 'Buyer',
            'customer_phone' => '08000000000',
            'payment_method' => 'paystack',
            'paystack_reference' => 'SF-RECON-1',
            'items' => [['product_id' => $this->product->id, 'quantity' => 2]],
        ])->assertStatus(201);

        $this->assertDatabaseHas('storefront_payment_intents', [
            'reference' => 'SF-RECON-1', 'status' => 'consumed',
        ]);
    }

    // --- sweep -------------------------------------------------------------

    public function test_the_sweep_leaves_a_fresh_pending_intent_alone()
    {
        Http::fake();
        $intent = $this->makeIntent();

        $this->artisan('storefront:sweep-payment-intents')->assertExitCode(0);

        $this->assertSame('pending', $intent->fresh()->status);
        Http::assertNothingSent();
    }

    public function test_the_sweep_promotes_a_stale_pending_intent_the_provider_confirms_and_alerts()
    {
        Http::fake([
            'api.paystack.co/transaction/verify/*' => Http::response([
                'status' => true,
                'data' => ['status' => 'success', 'amount' => 20000, 'currency' => 'NGN'],
            ], 200),
        ]);

        $intent = $this->makeIntent();
        $intent->forceFill(['created_at' => now()->subHours(3)])->save();

        $this->artisan('storefront:sweep-payment-intents')->assertExitCode(0);

        $intent->refresh();
        $this->assertSame('paid', $intent->status);
        $this->assertNotNull($intent->reconciliation_alerted_at);
        Mail::assertSent(SuperAdminAlertMail::class);
    }

    public function test_the_sweep_abandons_a_stale_intent_the_provider_never_saw_paid()
    {
        Http::fake([
            'api.paystack.co/transaction/verify/*' => Http::response([
                'status' => true,
                'data' => ['status' => 'abandoned', 'amount' => 0, 'currency' => 'NGN'],
            ], 200),
        ]);

        $intent = $this->makeIntent();
        $intent->forceFill(['created_at' => now()->subHours(3)])->save();

        $this->artisan('storefront:sweep-payment-intents')->assertExitCode(0);

        $this->assertSame('abandoned', $intent->fresh()->status);
        Mail::assertNotSent(SuperAdminAlertMail::class);
    }

    public function test_the_sweep_leaves_an_intent_alone_when_the_provider_is_unreachable()
    {
        Http::fake([
            'api.paystack.co/transaction/verify/*' => fn () => throw new \Illuminate\Http\Client\ConnectionException('timed out'),
        ]);

        $intent = $this->makeIntent();
        $intent->forceFill(['created_at' => now()->subHours(3)])->save();

        $this->artisan('storefront:sweep-payment-intents')->assertExitCode(0);

        $this->assertSame('pending', $intent->fresh()->status);
    }

    public function test_the_sweep_alerts_once_for_a_paid_intent_no_order_ever_claimed()
    {
        $intent = $this->makeIntent(['status' => 'paid']);
        $intent->forceFill(['created_at' => now()->subHours(3), 'updated_at' => now()->subHours(3)])->save();

        $this->artisan('storefront:sweep-payment-intents')->assertExitCode(0);
        $this->assertNotNull($intent->fresh()->reconciliation_alerted_at);
        Mail::assertSentCount(1);

        $this->artisan('storefront:sweep-payment-intents')->assertExitCode(0);
        Mail::assertSentCount(1);
    }
}
