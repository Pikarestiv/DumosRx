<?php

namespace Tests\Feature;

use App\Models\OnlineOrder;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
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
