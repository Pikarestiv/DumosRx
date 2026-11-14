<?php

namespace Tests\Feature;

use App\Mail\OnlineOrderConfirmationMail;
use App\Mail\OnlineOrderPlacedMail;
use App\Models\OnlineOrder;
use App\Models\Product;
use App\Models\StockBatch;
use App\Models\Store;
use App\Models\Storefront;
use App\Models\SystemConfig;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/**
 * Checkout details: customer email, pickup or delivery, how-to-pay instructions,
 * the order lookup the confirmation page uses, and the order emails.
 */
class StorefrontCheckoutDetailsTest extends TestCase
{
    use RefreshDatabase;

    protected User $owner;

    protected Store $store;

    protected Storefront $storefront;

    protected Product $product;

    protected function setUp(): void
    {
        parent::setUp();

        SystemConfig::setVal('subscription_plans', ['tiers' => ['free' => ['features' => ['store_url' => true]]]]);

        $this->owner = User::create([
            'first_name' => 'Owner', 'last_name' => 'One', 'email' => 'owner@dumosrx.com',
            'password' => bcrypt('password'), 'role' => 'store_owner',
        ]);
        $this->store = Store::create([
            'user_id' => $this->owner->id, 'name' => 'Divamax', 'store_slug' => 'divamax', 'device_id' => 'DEV-1',
            'online_store_enabled' => true, 'email' => 'shop@divamax.test', 'phone' => '699000000',
        ]);
        $this->storefront = Storefront::create([
            'user_id' => $this->owner->id, 'slug' => 'divamax', 'name' => 'Divamax', 'primary_store_id' => $this->store->id,
            'payment_instructions' => "MTN MoMo 677 000 000 (Divamax)\nReference: your order code", 'delivery_available' => true,
            'delivery_note' => 'Delivery within Douala, 1,000 FCFA.', 'pay_on_delivery' => true, 'whatsapp' => '+237677000000',
        ]);
        $this->product = Product::create([
            'name' => 'Bulb 12W', 'selling_price' => 1500, 'is_active' => true, 'show_online' => true,
            'user_id' => $this->owner->id, 'store_id' => $this->store->id,
        ]);
        StockBatch::create([
            'product_id' => $this->product->id, 'user_id' => $this->owner->id, 'store_id' => $this->store->id,
            'batch_number' => 'B1', 'quantity' => 50, 'cost_price' => 10, 'expiry_date' => now()->addYear(),
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
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    private function payload(array $overrides = []): array
    {
        return array_merge([
            'customer_name' => 'Marie Ngo', 'customer_phone' => '677123456', 'payment_method' => 'in_store',
            'items' => [['product_id' => $this->product->id, 'quantity' => 2]],
        ], $overrides);
    }

    private function place(array $overrides = [])
    {
        return $this->postJson('/api/v1/storefront/divamax/checkout', $this->payload($overrides));
    }

    public function test_the_order_keeps_the_customers_email_and_defaults_to_pickup(): void
    {
        Mail::fake();

        $this->place(['customer_email' => 'marie@example.com'])->assertCreated();

        $order = OnlineOrder::firstOrFail();
        $this->assertSame('marie@example.com', $order->customer_email);
        $this->assertSame('pickup', $order->fulfilment_method);
    }

    public function test_a_delivery_order_needs_an_address_and_a_store_that_offers_delivery(): void
    {
        Mail::fake();

        $this->place(['fulfilment_method' => 'delivery'])->assertStatus(422)->assertJsonValidationErrors('customer_address');
        $this->place(['fulfilment_method' => 'delivery', 'customer_address' => '12 Rue Joss'])->assertCreated();
        $this->assertSame('delivery', OnlineOrder::firstOrFail()->fulfilment_method);

        $this->storefront->update(['delivery_available' => false]);
        $this->place(['fulfilment_method' => 'delivery', 'customer_address' => '12 Rue Joss'])->assertStatus(422);
        $this->assertSame(1, OnlineOrder::count());
    }

    public function test_a_delivery_order_cannot_be_paid_on_delivery_unless_the_store_accepts_it(): void
    {
        Mail::fake();
        $this->storefront->update(['pay_on_delivery' => false]);
        $delivery = ['fulfilment_method' => 'delivery', 'customer_address' => '12 Rue Joss'];

        $this->place($delivery)->assertStatus(422)->assertJsonPath('message', fn ($m) => str_contains($m, 'payment on delivery'));
        $this->assertSame(0, OnlineOrder::count());

        $this->place($delivery + ['payment_method' => 'transfer'])->assertCreated();
        $this->place(['payment_method' => 'in_store'])->assertCreated();
        $this->assertSame(2, OnlineOrder::count());

        $this->storefront->update(['pay_on_delivery' => true]);
        $this->place($delivery)->assertCreated();
    }

    public function test_an_unknown_fulfilment_method_or_a_bad_email_is_refused(): void
    {
        $this->place(['fulfilment_method' => 'drone'])->assertStatus(422);
        $this->place(['customer_email' => 'not-an-email'])->assertStatus(422);
        $this->assertSame(0, OnlineOrder::count());
    }

    public function test_the_owner_and_the_store_address_are_emailed_and_so_is_the_customer(): void
    {
        Mail::fake();

        $this->place(['customer_email' => 'marie@example.com'])->assertCreated();

        Mail::assertSent(OnlineOrderPlacedMail::class, 2);
        Mail::assertSent(OnlineOrderPlacedMail::class, fn ($m) => $m->hasTo('owner@dumosrx.com'));
        Mail::assertSent(OnlineOrderPlacedMail::class, fn ($m) => $m->hasTo('shop@divamax.test'));
        Mail::assertSent(OnlineOrderConfirmationMail::class, fn ($m) => $m->hasTo('marie@example.com'));
    }

    public function test_no_customer_email_means_no_customer_message_and_the_owner_is_emailed_once_when_the_addresses_match(): void
    {
        Mail::fake();
        $this->store->update(['email' => 'OWNER@dumosrx.com']);

        $this->place()->assertCreated();

        Mail::assertNotSent(OnlineOrderConfirmationMail::class);
        Mail::assertSent(OnlineOrderPlacedMail::class, 1);
    }

    public function test_the_owner_email_lists_the_customer_the_items_and_the_total(): void
    {
        Mail::fake();
        $this->place(['customer_address' => '12 Rue Joss', 'fulfilment_method' => 'delivery', 'customer_email' => 'marie@example.com'])->assertCreated();

        Mail::assertSent(OnlineOrderPlacedMail::class, function (OnlineOrderPlacedMail $mail) {
            $html = $mail->render();
            foreach (['Marie Ngo', '677123456', 'marie@example.com', '12 Rue Joss', 'Bulb 12W', '3,000.00', 'Delivery', $mail->order->code()] as $expected) {
                $this->assertStringContainsString($expected, $html);
            }

            return true;
        });
    }

    public function test_a_transfer_customer_is_told_how_to_pay_and_never_promised_a_message_when_ready(): void
    {
        Mail::fake();
        $this->place(['payment_method' => 'transfer', 'customer_email' => 'marie@example.com'])->assertCreated();

        Mail::assertSent(OnlineOrderConfirmationMail::class, function (OnlineOrderConfirmationMail $mail) {
            $html = $mail->render();
            $this->assertStringContainsString('MTN MoMo 677 000 000', $html);
            $this->assertStringContainsString('not yet confirmed', $html);
            $this->assertStringNotContainsStringIgnoringCase('when it is ready', $html);

            return true;
        });
    }

    public function test_a_pay_at_pickup_customer_email_has_no_transfer_instructions(): void
    {
        Mail::fake();
        $this->place(['customer_email' => 'marie@example.com'])->assertCreated();

        Mail::assertSent(OnlineOrderConfirmationMail::class, fn ($m) => ! str_contains($m->render(), 'MTN MoMo'));
    }

    public function test_a_failing_mail_server_never_costs_the_customer_their_order(): void
    {
        config(['mail.default' => 'failing', 'mail.mailers.failing' => ['transport' => 'smtp', 'host' => '127.0.0.1', 'port' => 1, 'timeout' => 1]]);

        $this->place(['customer_email' => 'marie@example.com'])->assertCreated();

        $this->assertSame(1, OnlineOrder::count());
    }

    public function test_the_lookup_gives_the_confirmation_page_what_it_needs(): void
    {
        Mail::fake();
        $id = $this->place(['payment_method' => 'transfer'])->assertCreated()->json('order.id');

        $order = $this->getJson("/api/v1/storefront/divamax/orders/{$id}")->assertOk()->json('order');

        $this->assertSame(OnlineOrder::find($id)->code(), $order['code']);
        $this->assertSame('pickup', $order['fulfilment_method']);
        $this->assertStringContainsString('MTN MoMo', $order['payment_instructions']);
        $this->assertSame('699000000', $order['store_phone']);
        $this->assertSame('+237677000000', $order['whatsapp']);
        $this->assertSame('M***e N*o', $order['customer_name']);
        $this->assertArrayNotHasKey('customer_phone', $order);
        $this->assertArrayNotHasKey('customer_email', $order);
    }

    public function test_instructions_are_shown_only_for_a_transfer_order(): void
    {
        Mail::fake();
        $id = $this->place()->assertCreated()->json('order.id');

        $this->assertNull($this->getJson("/api/v1/storefront/divamax/orders/{$id}")->json('order.payment_instructions'));
    }

    public function test_the_public_storefront_reports_how_to_pay_and_whether_it_delivers(): void
    {
        $this->getJson('/api/v1/storefront/divamax')
            ->assertOk()
            ->assertJsonPath('storefront.delivery_available', true)
            ->assertJsonPath('storefront.pay_on_delivery', true)
            ->assertJsonPath('storefront.delivery_note', 'Delivery within Douala, 1,000 FCFA.')
            ->assertJsonPath('storefront.payment_instructions', "MTN MoMo 677 000 000 (Divamax)\nReference: your order code");
    }

    public function test_an_order_code_is_short_and_stable(): void
    {
        Mail::fake();
        $id = $this->place()->json('order.id');
        $code = OnlineOrder::find($id)->code();

        $this->assertMatchesRegularExpression('/^[0-9A-F]{8}$/', $code);
        $this->assertSame($code, OnlineOrder::find($id)->code());
    }

    public function test_an_old_bundle_checkout_with_no_fulfilment_method_is_a_pickup_and_still_reserves_stock(): void
    {
        Mail::fake();

        $this->place(['customer_address' => '12 Rue Joss'])->assertCreated();

        $order = OnlineOrder::firstOrFail();
        $this->assertSame('pickup', $order->fulfilment_method);
        $this->assertSame(48.0, app(\App\Services\Storefront\StorefrontCheckoutService::class)->availableQuantity($this->store, $this->product->id));
    }

    public function test_a_transfer_order_for_a_store_with_no_instructions_is_still_accepted_for_old_bundles(): void
    {
        Mail::fake();
        $this->storefront->update(['payment_instructions' => null]);

        $this->place(['payment_method' => 'transfer'])->assertCreated();
    }
}
