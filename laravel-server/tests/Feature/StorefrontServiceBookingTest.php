<?php

namespace Tests\Feature;

use App\Mail\OnlineOrderPlacedMail;
use App\Models\OnlineOrder;
use App\Models\OnlineOrderItem;
use App\Models\Product;
use App\Models\Service;
use App\Models\StockBatch;
use App\Models\Store;
use App\Models\Storefront;
use App\Models\SystemConfig;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class StorefrontServiceBookingTest extends TestCase
{
    use RefreshDatabase;
    use \Tests\Concerns\BuildsStorefrontPlans;

    private User $owner;

    private Store $store;

    private Storefront $storefront;

    private Product $product;

    private Service $service;

    protected function setUp(): void
    {
        parent::setUp();
        $this->grantEveryStorefrontEntitlementToEveryPlan();

        SystemConfig::setVal('subscription_plans', ['tiers' => ['free' => ['features' => ['store_url' => true]]]]);
        $this->owner = User::create([
            'first_name' => 'Owner', 'last_name' => 'One', 'email' => 'owner@dumosrx.com',
            'password' => bcrypt('password'), 'role' => 'store_owner',
        ]);
        $this->store = Store::create([
            'user_id' => $this->owner->id, 'name' => 'Cutis', 'store_slug' => 'cutis', 'device_id' => 'DEV-1',
            'online_store_enabled' => true,
        ]);
        $this->storefront = Storefront::create([
            'user_id' => $this->owner->id, 'slug' => 'cutis', 'name' => 'Cutis', 'primary_store_id' => $this->store->id,
            'show_services' => true,
        ]);
        $this->product = Product::create([
            'name' => 'Sunscreen', 'selling_price' => 1500, 'is_active' => true, 'show_online' => true,
            'user_id' => $this->owner->id, 'store_id' => $this->store->id,
        ]);
        StockBatch::create([
            'product_id' => $this->product->id, 'user_id' => $this->owner->id, 'store_id' => $this->store->id,
            'batch_number' => 'B1', 'quantity' => 5, 'cost_price' => 10, 'expiry_date' => now()->addYear(),
        ]);
        $this->service = Service::create([
            'store_id' => $this->store->id, 'name' => 'Scaling and polishing', 'category' => 'Dental', 'price' => 25000,
        ]);

        Mail::fake();
        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
            \App\Http\Middleware\CheckPermission::class,
            \App\Http\Middleware\CheckSubscription::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);
    }

    /**
     * @param  array<int, array<string, mixed>>  $items
     * @param  array<string, mixed>  $overrides
     */
    private function place(array $items, array $overrides = [])
    {
        return $this->postJson('/api/v1/storefront/cutis/checkout', array_merge([
            'customer_name' => 'Ada Obi', 'customer_phone' => '08012345678', 'customer_email' => 'ada@example.com',
            'payment_method' => 'in_store', 'items' => $items,
        ], $overrides));
    }

    public function test_a_mixed_cart_becomes_one_order_priced_from_the_catalogue(): void
    {
        $this->place([
            ['product_id' => $this->product->id, 'quantity' => 2],
            ['service_id' => $this->service->id, 'quantity' => 1],
        ])->assertCreated();

        $order = OnlineOrder::firstOrFail();
        $this->assertEquals(28000, (float) $order->total_amount);
        $serviceLine = OnlineOrderItem::whereNotNull('service_id')->firstOrFail();
        $this->assertNull($serviceLine->product_id);
        $this->assertSame($this->service->id, $serviceLine->service_id);
        $this->assertEquals(25000, (float) $serviceLine->subtotal);
        $this->assertSame(1, OnlineOrderItem::whereNotNull('product_id')->count());
    }

    public function test_a_services_only_booking_needs_no_stock(): void
    {
        StockBatch::query()->delete();

        $this->place([['service_id' => $this->service->id, 'quantity' => 2]])->assertCreated();

        $this->assertEquals(50000, (float) OnlineOrder::firstOrFail()->total_amount);
    }

    public function test_a_line_must_name_exactly_one_of_product_or_service(): void
    {
        $this->place([['quantity' => 1]])->assertStatus(422);
        $this->place([['product_id' => $this->product->id, 'service_id' => $this->service->id, 'quantity' => 1]])->assertStatus(422);

        $this->assertSame(0, OnlineOrder::count());
    }

    public function test_a_service_that_is_inactive_or_belongs_to_another_store_cannot_be_booked(): void
    {
        $other = Store::create(['user_id' => $this->owner->id, 'name' => 'Other', 'device_id' => 'DEV-2']);
        $foreign = Service::create(['store_id' => $other->id, 'name' => 'Elsewhere', 'price' => 100]);
        $retired = Service::create(['store_id' => $this->store->id, 'name' => 'Retired', 'price' => 100, 'is_active' => false]);

        $this->place([['service_id' => $foreign->id, 'quantity' => 1]])->assertNotFound();
        $this->place([['service_id' => $retired->id, 'quantity' => 1]])->assertNotFound();

        $this->assertSame(0, OnlineOrder::count());
    }

    public function test_a_price_on_request_service_cannot_be_booked_for_nothing(): void
    {
        $quoted = Service::create(['store_id' => $this->store->id, 'name' => 'Bridal styling', 'price' => 0]);

        $this->place([['service_id' => $quoted->id, 'quantity' => 1]])->assertNotFound();
        $this->place([
            ['product_id' => $this->product->id, 'quantity' => 1],
            ['service_id' => $quoted->id, 'quantity' => 1],
        ])->assertNotFound();

        $this->assertSame(0, OnlineOrder::count());
    }

    public function test_services_cannot_be_booked_while_the_store_has_them_switched_off(): void
    {
        $this->storefront->update(['show_services' => false]);

        $this->place([['service_id' => $this->service->id, 'quantity' => 1]])->assertNotFound();
    }

    public function test_the_till_sees_product_lines_in_items_and_bookings_in_service_items(): void
    {
        $this->place([
            ['product_id' => $this->product->id, 'quantity' => 1],
            ['service_id' => $this->service->id, 'quantity' => 1],
        ])->assertCreated();

        $this->actingAs($this->owner)->getJson('/api/v1/app/online-orders')
            ->assertOk()
            ->assertJsonCount(1, 'orders.0.items')
            ->assertJsonPath('orders.0.items.0.product.name', 'Sunscreen')
            ->assertJsonCount(1, 'orders.0.service_items')
            ->assertJsonPath('orders.0.service_items.0.service.name', 'Scaling and polishing');
    }

    public function test_the_order_lookup_and_the_owner_email_name_the_booked_service(): void
    {
        $response = $this->place([['service_id' => $this->service->id, 'quantity' => 1]])->assertCreated();

        $this->getJson('/api/v1/storefront/cutis/orders/'.$response->json('order.id'))
            ->assertOk()
            ->assertJsonPath('order.items.0.product_name', 'Scaling and polishing')
            ->assertJsonPath('order.items.0.is_service', true);

        Mail::assertSent(OnlineOrderPlacedMail::class, fn ($mail) => str_contains($mail->render(), 'Scaling and polishing'));
    }

    public function test_a_paid_booking_must_match_the_cart_its_payment_was_started_for(): void
    {
        config(['payment.paystack.secret_key' => 'sk_test_fake']);
        $this->store->update(['paystack_subaccount_code' => 'ACCT_cutis']);
        Http::fake([
            'api.paystack.co/transaction/initialize' => Http::response(['status' => true, 'data' => [
                'reference' => 'REF-BOOK-1', 'authorization_url' => 'https://checkout.paystack.com/REF-BOOK-1',
            ]], 200),
            'api.paystack.co/transaction/verify/*' => Http::response(['status' => true, 'data' => [
                'status' => 'success', 'amount' => 2650000, 'currency' => 'NGN',
            ]], 200),
            'api.paystack.co/refund' => Http::response(['status' => true], 200),
        ]);
        $items = [['product_id' => $this->product->id, 'quantity' => 1], ['service_id' => $this->service->id, 'quantity' => 1]];

        $this->postJson('/api/v1/storefront/cutis/checkout/initialize', ['customer_email' => 'ada@example.com', 'items' => $items])
            ->assertOk()
            ->assertJsonPath('amount', 26500);

        $this->place([['product_id' => $this->product->id, 'quantity' => 1]], ['payment_method' => 'paystack', 'paystack_reference' => 'REF-BOOK-1'])
            ->assertStatus(422);
        $this->place($items, ['payment_method' => 'paystack', 'paystack_reference' => 'REF-BOOK-1'])->assertCreated();

        $this->assertSame('paid', OnlineOrder::firstOrFail()->payment_status);
    }
}
