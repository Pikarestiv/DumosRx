<?php

namespace Tests\Feature;

use App\Mail\OnlineOrderCancelledMail;
use App\Mail\OnlineOrderReadyMail;
use App\Models\Notification;
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
 * Unpaid orders expire and release their stock; staff can tell a customer their
 * order is ready; customers are emailed when an order is ready or cancelled.
 */
class StorefrontOrderLifecycleTest extends TestCase
{
    use RefreshDatabase;

    protected User $owner;

    protected Store $store;

    protected Product $product;

    protected function setUp(): void
    {
        parent::setUp();

        SystemConfig::setVal('subscription_plans', ['tiers' => ['free' => ['features' => ['store_url' => true]]]]);
        config(['dumos.storefront.unpaid_hold_minutes' => ['transfer' => 30, 'in_store' => 1440]]);

        $this->owner = User::create([
            'first_name' => 'Owner', 'last_name' => 'One', 'email' => 'owner@dumosrx.com',
            'password' => bcrypt('password'), 'role' => 'store_owner',
        ]);
        $this->store = Store::create([
            'user_id' => $this->owner->id, 'name' => 'Divamax', 'store_slug' => 'divamax', 'device_id' => 'DEV-1',
            'online_store_enabled' => true, 'phone' => '699000000',
        ]);
        Storefront::create(['user_id' => $this->owner->id, 'slug' => 'divamax', 'name' => 'Divamax', 'primary_store_id' => $this->store->id]);
        $this->product = Product::create([
            'name' => 'Bulb', 'selling_price' => 1500, 'is_active' => true, 'show_online' => true,
            'user_id' => $this->owner->id, 'store_id' => $this->store->id,
        ]);
        StockBatch::create([
            'product_id' => $this->product->id, 'user_id' => $this->owner->id, 'store_id' => $this->store->id,
            'batch_number' => 'B1', 'quantity' => 2, 'cost_price' => 10, 'expiry_date' => now()->addYear(),
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
     * @param  array<string, mixed>  $attrs
     */
    private function order(array $attrs = [], int $minutesOld = 0, ?Store $store = null): OnlineOrder
    {
        $order = OnlineOrder::create(array_merge([
            'store_id' => ($store ?? $this->store)->id, 'customer_name' => 'Marie Ngo', 'customer_phone' => '677123456',
            'customer_email' => 'marie@example.com', 'total_amount' => 3000, 'payment_method' => 'transfer',
            'payment_status' => 'pending', 'order_status' => 'pending', 'fulfilment_method' => 'pickup',
        ], $attrs));
        $order->items()->create(['product_id' => $this->product->id, 'quantity' => 2, 'unit_price' => 1500, 'subtotal' => 3000]);
        OnlineOrder::where('id', $order->id)->update(['created_at' => now()->subMinutes($minutesOld)]);

        return $order->refresh();
    }

    public function test_an_unpaid_transfer_order_expires_after_thirty_minutes_but_not_before(): void
    {
        Mail::fake();
        $fresh = $this->order([], 29);
        $stale = $this->order([], 31);

        $this->artisan('storefront:expire-unpaid-orders')->assertSuccessful();

        $this->assertSame('pending', $fresh->refresh()->order_status);
        $this->assertSame('cancelled', $stale->refresh()->order_status);
        $this->assertSame('expired', $stale->cancel_reason);
    }

    public function test_a_pay_at_pickup_order_is_held_for_a_day(): void
    {
        Mail::fake();
        $morning = $this->order(['payment_method' => 'in_store'], 600);
        $stale = $this->order(['payment_method' => 'in_store'], 1441);

        $this->artisan('storefront:expire-unpaid-orders');

        $this->assertSame('pending', $morning->refresh()->order_status);
        $this->assertSame('cancelled', $stale->refresh()->order_status);
    }

    public function test_a_paid_a_ready_or_already_finished_order_never_expires(): void
    {
        Mail::fake();
        $paid = $this->order(['payment_method' => 'paystack', 'payment_status' => 'paid'], 5000);
        $ready = $this->order(['ready_at' => now()], 5000);
        $fulfilled = $this->order(['order_status' => 'fulfilled'], 5000);

        $this->artisan('storefront:expire-unpaid-orders');

        $this->assertSame('pending', $paid->refresh()->order_status);
        $this->assertSame('pending', $ready->refresh()->order_status);
        $this->assertSame('fulfilled', $fulfilled->refresh()->order_status);
    }

    public function test_a_hold_of_zero_switches_expiry_off_for_that_method(): void
    {
        Mail::fake();
        config(['dumos.storefront.unpaid_hold_minutes' => ['transfer' => 0, 'in_store' => 1440]]);
        $stale = $this->order([], 5000);

        $this->artisan('storefront:expire-unpaid-orders');

        $this->assertSame('pending', $stale->refresh()->order_status);
    }

    public function test_expiry_releases_the_reserved_stock(): void
    {
        Mail::fake();
        $this->order([], 31);
        $line = [['product_id' => $this->product->id, 'quantity' => 2]];
        $buy = fn () => $this->postJson('/api/v1/storefront/divamax/checkout', [
            'customer_name' => 'Next Buyer', 'customer_phone' => '1', 'payment_method' => 'in_store', 'items' => $line,
        ]);

        $buy()->assertStatus(422);
        $this->artisan('storefront:expire-unpaid-orders');
        $buy()->assertCreated();
    }

    public function test_expiry_tells_the_store_and_the_customer_but_not_a_customer_with_no_email(): void
    {
        Mail::fake();
        $withEmail = $this->order([], 31);
        $this->order(['customer_email' => null], 31);

        $this->artisan('storefront:expire-unpaid-orders');

        $this->assertSame(2, Notification::where('user_id', $this->owner->id)->where('title', 'Online order expired')->count());
        Mail::assertSent(OnlineOrderCancelledMail::class, 1);
        Mail::assertSent(OnlineOrderCancelledMail::class, function (OnlineOrderCancelledMail $mail) use ($withEmail) {
            $this->assertTrue($mail->hasTo('marie@example.com'));
            $this->assertStringContainsString('not paid in time', $mail->render());
            $this->assertSame($withEmail->id, $mail->order->id);

            return true;
        });
    }

    public function test_running_the_command_twice_does_not_notify_twice(): void
    {
        Mail::fake();
        $this->order([], 31);

        $this->artisan('storefront:expire-unpaid-orders');
        $this->artisan('storefront:expire-unpaid-orders');

        Mail::assertSent(OnlineOrderCancelledMail::class, 1);
    }

    public function test_staff_mark_an_order_ready_and_the_customer_is_emailed_once(): void
    {
        Mail::fake();
        $order = $this->order();

        $first = $this->actingAs($this->owner)->postJson("/api/v1/app/online-orders/{$order->id}/ready")->assertOk()->json();
        $second = $this->actingAs($this->owner)->postJson("/api/v1/app/online-orders/{$order->id}/ready")->assertOk()->json();

        $this->assertTrue($first['emailed']);
        $this->assertFalse($second['emailed']);
        Mail::assertSent(OnlineOrderReadyMail::class, 1);
        Mail::assertSent(OnlineOrderReadyMail::class, fn ($m) => $m->hasTo('marie@example.com') && str_contains($m->render(), 'is ready'));
        $this->assertNotNull($order->refresh()->ready_at);
    }

    public function test_an_order_with_no_customer_email_is_still_marked_ready_for_staff_to_phone(): void
    {
        Mail::fake();
        $order = $this->order(['customer_email' => null]);

        $this->actingAs($this->owner)->postJson("/api/v1/app/online-orders/{$order->id}/ready")
            ->assertOk()->assertJsonPath('emailed', false);

        $this->assertNotNull($order->refresh()->ready_at);
        Mail::assertNothingSent();
    }

    public function test_a_delivery_order_ready_email_talks_about_delivery(): void
    {
        Mail::fake();
        $order = $this->order(['fulfilment_method' => 'delivery', 'customer_address' => '12 Rue Joss']);

        $this->actingAs($this->owner)->postJson("/api/v1/app/online-orders/{$order->id}/ready")->assertOk();

        Mail::assertSent(OnlineOrderReadyMail::class, fn ($m) => str_contains($m->render(), 'for delivery'));
    }

    public function test_only_a_pending_order_of_your_own_store_can_be_marked_ready(): void
    {
        Mail::fake();
        $rivalOwner = User::create(['first_name' => 'R', 'last_name' => 'V', 'email' => 'rival@dumosrx.com', 'password' => bcrypt('x'), 'role' => 'store_owner']);
        $rivalStore = Store::create(['user_id' => $rivalOwner->id, 'name' => 'Rival', 'store_slug' => 'rival', 'device_id' => 'DEV-2', 'online_store_enabled' => true]);
        $theirs = $this->order([], 0, $rivalStore);
        $done = $this->order(['order_status' => 'fulfilled']);

        $this->actingAs($this->owner)->postJson("/api/v1/app/online-orders/{$theirs->id}/ready")->assertNotFound();
        $this->actingAs($this->owner)->postJson("/api/v1/app/online-orders/{$done->id}/ready")->assertStatus(409);

        $this->assertNull($theirs->refresh()->ready_at);
        Mail::assertNothingSent();
    }

    public function test_a_ready_order_stops_expiring_even_when_unpaid(): void
    {
        Mail::fake();
        $order = $this->order([], 40);
        $this->actingAs($this->owner)->postJson("/api/v1/app/online-orders/{$order->id}/ready")->assertOk();

        $this->artisan('storefront:expire-unpaid-orders');

        $this->assertSame('pending', $order->refresh()->order_status);
    }

    public function test_cancelling_an_order_by_hand_emails_the_customer_with_the_stores_reason(): void
    {
        Mail::fake();
        $order = $this->order();

        $this->actingAs($this->owner)->postJson("/api/v1/app/online-orders/{$order->id}/fulfill", ['status' => 'cancelled'])->assertOk();

        $this->assertSame('store', $order->refresh()->cancel_reason);
        Mail::assertSent(OnlineOrderCancelledMail::class, fn ($m) => $m->hasTo('marie@example.com') && str_contains($m->render(), 'by the store'));
    }

    public function test_fulfilling_an_order_does_not_send_a_cancellation(): void
    {
        Mail::fake();
        $order = $this->order();

        $this->actingAs($this->owner)->postJson("/api/v1/app/online-orders/{$order->id}/fulfill", ['status' => 'fulfilled', 'payment_confirmed' => true])->assertOk();

        Mail::assertNothingSent();
    }

    public function test_the_lookup_the_confirmation_page_uses_reports_ready_and_expired(): void
    {
        Mail::fake();
        $ready = $this->order(['ready_at' => now()]);
        $expired = $this->order(['order_status' => 'cancelled', 'cancel_reason' => 'expired']);

        $this->getJson("/api/v1/storefront/divamax/orders/{$ready->id}")->assertJsonPath('order.ready', true)->assertJsonPath('order.cancel_reason', null);
        $this->getJson("/api/v1/storefront/divamax/orders/{$expired->id}")->assertJsonPath('order.cancel_reason', 'expired')->assertJsonPath('order.ready', false);
    }

    public function test_the_shipped_default_holds_a_transfer_order_for_a_day_because_a_transfer_cannot_be_confirmed(): void
    {
        $shipped = (require config_path('dumos.php'))['storefront']['unpaid_hold_minutes'];

        $this->assertSame(1440, $shipped['transfer']);
        $this->assertSame(1440, $shipped['in_store']);
    }

    public function test_the_cancellation_email_tells_a_transfer_customer_who_already_paid_to_contact_the_store(): void
    {
        Mail::fake();
        $order = $this->order();

        $this->actingAs($this->owner)->postJson("/api/v1/app/online-orders/{$order->id}/fulfill", ['status' => 'cancelled'])->assertOk();

        Mail::assertSent(OnlineOrderCancelledMail::class, fn ($m) => str_contains($m->render(), 'already paid by transfer') && str_contains($m->render(), $order->code()));
    }

    public function test_an_order_the_expiry_job_cancelled_cannot_then_be_marked_ready_or_emailed(): void
    {
        Mail::fake();
        $order = $this->order([], 40);
        $this->artisan('storefront:expire-unpaid-orders');
        Mail::assertSent(OnlineOrderCancelledMail::class, 1);

        $this->actingAs($this->owner)->postJson("/api/v1/app/online-orders/{$order->id}/ready")->assertStatus(409);

        $this->assertNull($order->refresh()->ready_at);
        Mail::assertNotSent(OnlineOrderReadyMail::class);
    }
}
