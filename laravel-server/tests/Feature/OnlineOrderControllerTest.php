<?php

namespace Tests\Feature;

use App\Models\OnlineOrder;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Regression coverage for OnlineOrderController: both index() and
 * markFulfilled() used to gate on $user->store_id, which is deliberately
 * always null for a store owner (see User::employerStore()'s doc block) —
 * so an owner (exactly who this endpoint is for) always got "No store
 * associated" and could never see or fulfil their own storefront orders.
 * Fixed to resolve the store the same way SyncController::resolvePushStoreId
 * does: X-Store-Id when present/owned, else the caller's own store_id
 * (staff), else their first owned store.
 */
class OnlineOrderControllerTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Set by paidOnlineOrder() so a test can act as the owner of the order
     * it just created, matching the plan's task-8 test fixture.
     */
    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
            \App\Http\Middleware\CheckPermission::class,
            \App\Http\Middleware\CheckSubscription::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);
    }

    private function makeOrder(string $storeId): OnlineOrder
    {
        return OnlineOrder::create([
            'id' => (string) Str::uuid(),
            'store_id' => $storeId,
            'customer_name' => 'Jane Doe',
            'customer_phone' => '08000000000',
            'total_amount' => 100,
            'payment_method' => 'paystack',
            'payment_status' => 'paid',
            'order_status' => 'pending',
        ]);
    }

    public function test_store_owner_can_list_their_own_online_orders()
    {
        $owner = User::create([
            'first_name' => 'Owner', 'last_name' => 'User',
            'email' => 'oo-owner@dumosrx.com', 'password' => bcrypt('password'), 'role' => 'store_owner',
        ]);
        $store = Store::create([
            'user_id' => $owner->id, 'name' => 'Store', 'store_slug' => 'oo-store',
            'device_id' => 'WEB-OO-OWNER',
        ]);
        $order = $this->makeOrder($store->id);

        $response = $this->actingAs($owner)->getJson('/api/v1/app/online-orders');

        $response->assertStatus(200);
        $response->assertJsonPath('orders.0.id', $order->id);
    }

    public function test_store_owner_can_fulfill_their_own_online_order()
    {
        $owner = User::create([
            'first_name' => 'Owner', 'last_name' => 'User',
            'email' => 'oo-owner2@dumosrx.com', 'password' => bcrypt('password'), 'role' => 'store_owner',
        ]);
        $store = Store::create([
            'user_id' => $owner->id, 'name' => 'Store', 'store_slug' => 'oo-store-2',
            'device_id' => 'WEB-OO-OWNER-2',
        ]);
        $order = $this->makeOrder($store->id);

        $response = $this->actingAs($owner)
            ->postJson("/api/v1/app/online-orders/{$order->id}/fulfill", ['status' => 'fulfilled']);

        $response->assertStatus(200);
        $this->assertDatabaseHas('online_orders', [
            'id' => $order->id,
            'order_status' => 'fulfilled',
            'payment_status' => 'paid',
        ]);
    }

    public function test_multi_store_owner_selects_store_via_x_store_id_header()
    {
        $owner = User::create([
            'first_name' => 'Owner', 'last_name' => 'User',
            'email' => 'oo-multi@dumosrx.com', 'password' => bcrypt('password'), 'role' => 'store_owner',
        ]);
        $storeA = Store::create([
            'user_id' => $owner->id, 'name' => 'Store A', 'store_slug' => 'oo-store-a',
            'device_id' => 'WEB-OO-A',
        ]);
        $storeB = Store::create([
            'user_id' => $owner->id, 'name' => 'Store B', 'store_slug' => 'oo-store-b',
            'device_id' => 'WEB-OO-B',
        ]);
        $orderA = $this->makeOrder($storeA->id);
        $orderB = $this->makeOrder($storeB->id);

        $response = $this->actingAs($owner)
            ->withHeaders(['X-Store-Id' => $storeB->id])
            ->getJson('/api/v1/app/online-orders');

        $response->assertStatus(200);
        $ids = collect($response->json('orders'))->pluck('id')->all();
        $this->assertContains($orderB->id, $ids);
        $this->assertNotContains($orderA->id, $ids);
    }

    public function test_staff_sees_their_employer_stores_orders()
    {
        $owner = User::create([
            'first_name' => 'Owner', 'last_name' => 'User',
            'email' => 'oo-owner3@dumosrx.com', 'password' => bcrypt('password'), 'role' => 'store_owner',
        ]);
        $store = Store::create([
            'user_id' => $owner->id, 'name' => 'Store', 'store_slug' => 'oo-store-3',
            'device_id' => 'WEB-OO-OWNER-3',
        ]);
        $staff = User::create([
            'first_name' => 'Staff', 'last_name' => 'User',
            'email' => 'oo-staff@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'sales_staff', 'store_id' => $store->id,
        ]);
        $order = $this->makeOrder($store->id);

        $response = $this->actingAs($staff)->getJson('/api/v1/app/online-orders');

        $response->assertStatus(200);
        $response->assertJsonPath('orders.0.id', $order->id);
    }

    /** @return array{0: User, 1: Store} */
    private function ownerWithStore(string $suffix): array
    {
        $owner = User::create([
            'first_name' => 'Owner', 'last_name' => 'User',
            'email' => "oo-{$suffix}@dumosrx.com", 'password' => bcrypt('password'), 'role' => 'store_owner',
        ]);
        $store = Store::create([
            'user_id' => $owner->id, 'name' => 'Store', 'store_slug' => "oo-store-{$suffix}",
            'device_id' => 'WEB-OO-'.strtoupper($suffix),
        ]);

        return [$owner, $store];
    }

    public function test_fulfilling_an_order_that_is_no_longer_pending_is_rejected()
    {
        [$owner, $store] = $this->ownerWithStore('guard');
        $order = $this->makeOrder($store->id);
        $order->update(['order_status' => 'fulfilled']);

        $response = $this->actingAs($owner)
            ->postJson("/api/v1/app/online-orders/{$order->id}/fulfill", ['status' => 'cancelled']);

        $response->assertStatus(409);
        $this->assertDatabaseHas('online_orders', [
            'id' => $order->id,
            'order_status' => 'fulfilled',
        ]);
    }

    public function test_fulfilment_alone_does_not_record_an_unconfirmed_transfer_as_paid()
    {
        [$owner, $store] = $this->ownerWithStore('transfer');
        $order = $this->makeOrder($store->id);
        $order->update(['payment_method' => 'transfer', 'payment_status' => 'pending', 'paystack_reference' => null]);

        $response = $this->actingAs($owner)
            ->postJson("/api/v1/app/online-orders/{$order->id}/fulfill", ['status' => 'fulfilled']);

        $response->assertStatus(200);
        $this->assertDatabaseHas('online_orders', [
            'id' => $order->id,
            'order_status' => 'fulfilled',
            'payment_status' => 'pending',
        ]);
    }

    public function test_fulfilment_records_payment_when_the_caller_confirms_it()
    {
        [$owner, $store] = $this->ownerWithStore('confirmed');
        $order = $this->makeOrder($store->id);
        $order->update(['payment_method' => 'in_store', 'payment_status' => 'pending', 'paystack_reference' => null]);

        $response = $this->actingAs($owner)->postJson(
            "/api/v1/app/online-orders/{$order->id}/fulfill",
            ['status' => 'fulfilled', 'payment_confirmed' => true],
        );

        $response->assertStatus(200);
        $this->assertDatabaseHas('online_orders', [
            'id' => $order->id,
            'order_status' => 'fulfilled',
            'payment_status' => 'paid',
        ]);
    }

    /**
     * A paid, pending online order plus its owning owner/store, reused by
     * the refund tests below - sets $this->owner so a test can act as the
     * store's owner without repeating the owner/store setup. Builds on the
     * existing ownerWithStore()/makeOrder() fixtures rather than duplicating
     * them; each call gets its own owner/store so tests don't collide on
     * unique emails/slugs.
     */
    private function paidOnlineOrder(array $overrides = []): OnlineOrder
    {
        [$this->owner, $store] = $this->ownerWithStore('paid-'.Str::random(8));
        $order = $this->makeOrder($store->id);
        $order->update($overrides);

        return $order;
    }

    public function test_cancelling_a_paid_paystack_order_calls_the_refund_api()
    {
        Http::fake(['api.paystack.co/refund' => Http::response(['status' => true, 'message' => 'Refunded'], 200)]);

        $order = $this->paidOnlineOrder(['payment_method' => 'paystack', 'paystack_reference' => 'ref_to_refund']);

        $response = $this->actingAs($this->owner)
            ->postJson("/api/v1/app/online-orders/{$order->id}/fulfill", ['status' => 'cancelled']);

        $response->assertStatus(200);
        Http::assertSent(fn ($request) => $request['transaction'] === 'ref_to_refund');
    }

    public function test_a_successful_refund_marks_the_order_refunded_not_paid()
    {
        Http::fake(['api.paystack.co/refund' => Http::response(['status' => true, 'message' => 'Refunded'], 200)]);

        $order = $this->paidOnlineOrder(['payment_method' => 'paystack', 'paystack_reference' => 'ref_status']);

        $this->actingAs($this->owner)
            ->postJson("/api/v1/app/online-orders/{$order->id}/fulfill", ['status' => 'cancelled'])
            ->assertStatus(200);

        $this->assertDatabaseHas('online_orders', [
            'id' => $order->id,
            'order_status' => 'cancelled',
            'payment_status' => 'refunded',
        ]);
    }

    public function test_a_failed_refund_leaves_the_order_marked_paid()
    {
        Http::fake(['api.paystack.co/refund' => Http::response(['status' => false, 'message' => 'Already refunded'], 400)]);

        $order = $this->paidOnlineOrder(['payment_method' => 'paystack', 'paystack_reference' => 'ref_status_fail']);

        $this->actingAs($this->owner)
            ->postJson("/api/v1/app/online-orders/{$order->id}/fulfill", ['status' => 'cancelled'])
            ->assertStatus(200);

        // Still owed to the customer - the flag-and-notify path is the record
        // of that, and 'paid' is what makes it reconcilable.
        $this->assertDatabaseHas('online_orders', [
            'id' => $order->id,
            'payment_status' => 'paid',
        ]);
    }

    public function test_a_failed_refund_falls_back_to_the_log_and_notify_flag()
    {
        Http::fake(['api.paystack.co/refund' => Http::response(['status' => false, 'message' => 'Already refunded'], 400)]);

        $order = $this->paidOnlineOrder(['payment_method' => 'paystack', 'paystack_reference' => 'ref_fail']);

        $response = $this->actingAs($this->owner)
            ->postJson("/api/v1/app/online-orders/{$order->id}/fulfill", ['status' => 'cancelled']);

        $response->assertStatus(200);
        $this->assertDatabaseHas('notifications', [
            'user_id' => $this->owner->id,
            'title' => 'Refund required',
        ]);
    }

    public function test_cancelling_a_paid_order_with_no_reference_falls_back_to_the_flag_without_calling_paystack()
    {
        Http::fake();

        // An in_store/transfer order marked paid has no paystack_reference at
        // all - must never reach the refund API with an empty one.
        $order = $this->paidOnlineOrder(['payment_method' => 'in_store', 'paystack_reference' => null]);

        $response = $this->actingAs($this->owner)
            ->postJson("/api/v1/app/online-orders/{$order->id}/fulfill", ['status' => 'cancelled']);

        $response->assertStatus(200);
        Http::assertNothingSent();
        $this->assertDatabaseHas('notifications', [
            'user_id' => $this->owner->id,
            'title' => 'Refund required',
        ]);
    }

    public function test_cancelling_an_already_paid_order_flags_a_refund_for_the_store()
    {
        [$owner, $store] = $this->ownerWithStore('refund');
        $order = $this->makeOrder($store->id);

        $response = $this->actingAs($owner)
            ->postJson("/api/v1/app/online-orders/{$order->id}/fulfill", ['status' => 'cancelled']);

        $response->assertStatus(200);
        $this->assertDatabaseHas('notifications', [
            'user_id' => $owner->id,
            'title' => 'Refund required',
        ]);
    }

    public function test_cancelling_an_unpaid_order_does_not_flag_a_refund()
    {
        [$owner, $store] = $this->ownerWithStore('norefund');
        $order = $this->makeOrder($store->id);
        $order->update(['payment_status' => 'pending']);

        $this->actingAs($owner)
            ->postJson("/api/v1/app/online-orders/{$order->id}/fulfill", ['status' => 'cancelled'])
            ->assertStatus(200);

        $this->assertDatabaseMissing('notifications', [
            'user_id' => $owner->id,
            'title' => 'Refund required',
        ]);
    }

    public function test_index_is_bounded_and_reports_that_more_orders_exist()
    {
        [$owner, $store] = $this->ownerWithStore('bounded');
        for ($i = 0; $i < 52; $i++) {
            $this->makeOrder($store->id);
        }

        $response = $this->actingAs($owner)->getJson('/api/v1/app/online-orders');

        $response->assertStatus(200);
        $response->assertJsonCount(50, 'orders');
        $response->assertJsonPath('has_more', true);
    }

    public function test_index_can_filter_to_the_actionable_pending_orders()
    {
        [$owner, $store] = $this->ownerWithStore('filter');
        $pending = $this->makeOrder($store->id);
        $done = $this->makeOrder($store->id);
        $done->update(['order_status' => 'fulfilled']);

        $response = $this->actingAs($owner)->getJson('/api/v1/app/online-orders?status=pending');

        $response->assertStatus(200);
        $response->assertJsonCount(1, 'orders');
        $response->assertJsonPath('orders.0.id', $pending->id);
    }

    public function test_owner_with_no_store_gets_no_store_associated_error()
    {
        $ownerWithNoStore = User::create([
            'first_name' => 'No', 'last_name' => 'Store',
            'email' => 'oo-nostoreowner@dumosrx.com', 'password' => bcrypt('password'), 'role' => 'store_owner',
        ]);

        $response = $this->actingAs($ownerWithNoStore)->getJson('/api/v1/app/online-orders');

        $response->assertStatus(400);
        $response->assertJson(['error' => 'No store associated']);
    }
}
