<?php

namespace Tests\Feature;

use App\Models\PurchaseOrder;
use App\Models\Store;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Regression coverage: PurchaseOrderController::index() scoped by
 * `Store::where('user_id', $user->id)` directly instead of resolving the
 * tenant owner, so a staff caller (whose own id owns no Store row) always
 * saw an empty list instead of the store's own purchase orders. See
 * docs/KNOWN_BUGS.md.
 */
class PurchaseOrderControllerTest extends TestCase
{
    use RefreshDatabase;

    protected User $owner;
    protected User $staff;
    protected Store $store;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutMiddleware();

        $this->owner = User::create([
            'first_name' => 'Owner', 'last_name' => 'A',
            'email' => 'owner@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $this->store = Store::create([
            'user_id' => $this->owner->id,
            'name' => 'Store A',
            'store_slug' => 'store-a',
            'device_id' => 'WEB-A',
        ]);

        $this->staff = User::create([
            'first_name' => 'Staff', 'last_name' => 'A',
            'email' => 'staff@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'sales_staff', 'store_id' => $this->store->id,
        ]);

        $supplier = Supplier::create([
            'name' => 'Acme Supplies', 'user_id' => $this->owner->id,
        ]);

        PurchaseOrder::create([
            'order_number' => 'PO-1',
            'supplier_id' => $supplier->id,
            'ordered_by' => $this->owner->id,
            'order_date' => now(),
        ]);
    }

    public function test_owner_sees_their_own_purchase_orders()
    {
        $response = $this->actingAs($this->owner)->getJson('/api/v1/purchase-orders');

        $response->assertStatus(200);
        $response->assertJsonCount(1, 'data');
    }

    public function test_staff_sees_their_store_owners_purchase_orders_not_an_empty_list()
    {
        $response = $this->actingAs($this->staff)->getJson('/api/v1/purchase-orders');

        $response->assertStatus(200);
        $response->assertJsonCount(1, 'data');
    }
}
