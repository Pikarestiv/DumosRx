<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Product;
use App\Models\Sale;
use App\Models\StockBatch;
use App\Models\StockMovement;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Regression coverage for POST /app/sales:
 * - Sale::create() was passed user_id/status/invoice_number, none of which
 *   are fillable/real columns, so cashier_id (NOT NULL FK) and amount_paid
 *   (NOT NULL, no default) were left unset - every call 500'd on a DB
 *   constraint violation.
 * - unit_price was trusted from the request with no server-side lookup.
 * - items.*.product_id was validated only as exists:products,id with no
 *   tenant scope, so another tenant's product id was accepted.
 * - $tenantId was computed but unused, so store_id was never set.
 * - no stock check/deduction happened at all.
 */
class SaleControllerTest extends TestCase
{
    use RefreshDatabase;

    protected User $owner;
    protected Store $store;
    protected User $otherOwner;

    protected function setUp(): void
    {
        parent::setUp();

        $this->owner = User::create([
            'first_name' => 'Owner', 'last_name' => 'A',
            'email' => 'ownerA@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $this->store = Store::create([
            'user_id' => $this->owner->id, 'name' => 'Store A',
            'store_slug' => 'store-a', 'device_id' => 'WEB-A',
        ]);

        $this->otherOwner = User::create([
            'first_name' => 'Owner', 'last_name' => 'B',
            'email' => 'ownerB@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $this->withoutMiddleware();
    }

    private function stockedProduct(User $owner, float $price = 100, int $quantity = 50): Product
    {
        $product = Product::create([
            'name' => 'Panadol', 'selling_price' => $price, 'user_id' => $owner->id,
            'is_active' => true,
        ]);

        StockBatch::create([
            'product_id' => $product->id,
            'user_id' => $owner->id,
            'batch_number' => 'B-' . $product->id,
            'quantity' => $quantity,
            'cost_price' => 40,
            'expiry_date' => now()->addYear(),
        ]);

        return $product;
    }

    public function test_creates_a_sale_and_deducts_stock()
    {
        $product = $this->stockedProduct($this->owner);

        $response = $this->actingAs($this->owner)->postJson('/api/v1/app/sales', [
            'items' => [['product_id' => $product->id, 'quantity' => 3]],
            'payment_method' => 'cash',
        ]);

        $response->assertStatus(201);

        $sale = Sale::first();
        $this->assertNotNull($sale);
        $this->assertSame($this->owner->id, $sale->cashier_id);
        $this->assertSame($this->store->id, $sale->store_id);
        $this->assertEquals(300, $sale->total_amount);
        $this->assertEquals(300, $sale->amount_paid);
        $this->assertNotNull($sale->transaction_number);

        $this->assertEquals(47, StockBatch::where('product_id', $product->id)->sum('quantity'));
    }

    public function test_ignores_client_submitted_unit_price()
    {
        $product = $this->stockedProduct($this->owner, price: 100);

        $response = $this->actingAs($this->owner)->postJson('/api/v1/app/sales', [
            'items' => [['product_id' => $product->id, 'quantity' => 1, 'unit_price' => 1]],
            'payment_method' => 'cash',
        ]);

        $response->assertStatus(201);
        $this->assertEquals(100, Sale::first()->total_amount);
    }

    public function test_rejects_a_product_belonging_to_another_tenant()
    {
        $foreignProduct = $this->stockedProduct($this->otherOwner);

        $response = $this->actingAs($this->owner)->postJson('/api/v1/app/sales', [
            'items' => [['product_id' => $foreignProduct->id, 'quantity' => 1]],
            'payment_method' => 'cash',
        ]);

        $response->assertStatus(422);
        $this->assertDatabaseCount('sales', 0);
    }

    public function test_rejects_an_order_exceeding_available_stock()
    {
        $product = $this->stockedProduct($this->owner, quantity: 2);

        $response = $this->actingAs($this->owner)->postJson('/api/v1/app/sales', [
            'items' => [['product_id' => $product->id, 'quantity' => 5]],
            'payment_method' => 'cash',
        ]);

        $response->assertStatus(422);
        $this->assertDatabaseCount('sales', 0);
        $this->assertEquals(2, StockBatch::where('product_id', $product->id)->sum('quantity'));
    }

    public function test_two_sales_in_the_same_second_get_distinct_transaction_numbers()
    {
        $product = $this->stockedProduct($this->owner, quantity: 10);

        for ($i = 0; $i < 2; $i++) {
            $response = $this->actingAs($this->owner)->postJson('/api/v1/app/sales', [
                'items' => [['product_id' => $product->id, 'quantity' => 1]],
                'payment_method' => 'cash',
            ]);
            $response->assertStatus(201);
        }

        $numbers = Sale::pluck('transaction_number');
        $this->assertCount(2, $numbers->unique());
    }

    /**
     * Regression test for Fix B: StockMovement::$fillable didn't include
     * store_id, and this create() call never passed it, so mass-assignment
     * silently dropped it - every movement created by this endpoint ended
     * up with store_id = NULL, invisible to SyncController's
     * applyPullTenantScope() (which scopes stock_movements pulls by
     * store_id), permanently under-counting every POS device's local
     * on-hand stock.
     */
    public function test_sale_records_stock_movement_with_store_id()
    {
        $product = $this->stockedProduct($this->owner);

        $response = $this->actingAs($this->owner)->postJson('/api/v1/app/sales', [
            'items' => [['product_id' => $product->id, 'quantity' => 3]],
            'payment_method' => 'cash',
        ]);

        $response->assertStatus(201);

        $movement = StockMovement::where('product_id', $product->id)->first();
        $this->assertNotNull($movement);
        $this->assertSame($this->store->id, $movement->store_id);
    }

    /**
     * Regression test for Fix C.1: the batch query had no is_active/expiry
     * filter and sorted purely by expiry_date, so a NULL-expiry batch (which
     * sorts first on MySQL) or an already-expired/inactive batch could be
     * dispensed ahead of a real, in-date batch.
     */
    public function test_sale_prefers_dated_batch_over_null_expiry_batch()
    {
        $product = Product::create([
            'name' => 'Panadol', 'selling_price' => 100, 'user_id' => $this->owner->id,
            'is_active' => true,
        ]);

        // NULL expiry_date - must sort LAST, not first.
        $nullExpiryBatch = StockBatch::create([
            'product_id' => $product->id, 'user_id' => $this->owner->id,
            'batch_number' => 'B-NULL', 'quantity' => 10, 'cost_price' => 40,
            'expiry_date' => null,
        ]);

        $datedBatch = StockBatch::create([
            'product_id' => $product->id, 'user_id' => $this->owner->id,
            'batch_number' => 'B-DATED', 'quantity' => 10, 'cost_price' => 40,
            'expiry_date' => now()->addMonth(),
        ]);

        $response = $this->actingAs($this->owner)->postJson('/api/v1/app/sales', [
            'items' => [['product_id' => $product->id, 'quantity' => 4]],
            'payment_method' => 'cash',
        ]);

        $response->assertStatus(201);
        $this->assertEquals(6, $datedBatch->fresh()->quantity);
        $this->assertEquals(10, $nullExpiryBatch->fresh()->quantity);
    }

    public function test_sale_excludes_expired_and_inactive_batches()
    {
        $product = Product::create([
            'name' => 'Panadol', 'selling_price' => 100, 'user_id' => $this->owner->id,
            'is_active' => true,
        ]);

        $expiredBatch = StockBatch::create([
            'product_id' => $product->id, 'user_id' => $this->owner->id,
            'batch_number' => 'B-EXPIRED', 'quantity' => 10, 'cost_price' => 40,
            'expiry_date' => now()->subDay(),
        ]);

        $inactiveBatch = StockBatch::create([
            'product_id' => $product->id, 'user_id' => $this->owner->id,
            'batch_number' => 'B-INACTIVE', 'quantity' => 10, 'cost_price' => 40,
            'expiry_date' => now()->addMonth(), 'is_active' => false,
        ]);

        $response = $this->actingAs($this->owner)->postJson('/api/v1/app/sales', [
            'items' => [['product_id' => $product->id, 'quantity' => 1]],
            'payment_method' => 'cash',
        ]);

        // Neither remaining batch is eligible, so there's no stock to sell.
        $response->assertStatus(422);
        $this->assertEquals(10, $expiredBatch->fresh()->quantity);
        $this->assertEquals(10, $inactiveBatch->fresh()->quantity);
    }

    /**
     * Regression test for Fix C.2: the migration widening sales.payment_method
     * to support 'mixed' and 'credit' (both real POS payment methods) wasn't
     * reflected in this endpoint's validation rule, so both 422'd.
     */
    public function test_sale_accepts_mixed_and_credit_payment_methods()
    {
        $product = $this->stockedProduct($this->owner, quantity: 10);

        foreach (['mixed', 'credit'] as $method) {
            $response = $this->actingAs($this->owner)->postJson('/api/v1/app/sales', [
                'items' => [['product_id' => $product->id, 'quantity' => 1]],
                'payment_method' => $method,
            ]);

            $response->assertStatus(201);
        }
    }

    /**
     * Regression test for Fix C.3: customer_id was validated only as
     * exists:customers,id with no tenant scope, unlike product_id one line
     * above - a caller could attach another tenant's customer id to their
     * sale.
     */
    public function test_rejects_a_customer_belonging_to_another_tenant()
    {
        $product = $this->stockedProduct($this->owner);
        $foreignCustomer = Customer::create([
            'first_name' => 'Foreign', 'last_name' => 'Customer',
            'user_id' => $this->otherOwner->id,
        ]);

        $response = $this->actingAs($this->owner)->postJson('/api/v1/app/sales', [
            'items' => [['product_id' => $product->id, 'quantity' => 1]],
            'payment_method' => 'cash',
            'customer_id' => $foreignCustomer->id,
        ]);

        $response->assertStatus(422);
        $this->assertDatabaseCount('sales', 0);
    }

    /**
     * Regression test for Fix C.4: batches are scoped by store_id (falling
     * back to a null store_id for legacy rows) so a multi-store owner can't
     * sell stock physically held at store B against a sale recorded at
     * store A, even though the Product catalog row itself is shared
     * tenant-wide across both stores.
     */
    public function test_sale_does_not_dispense_stock_from_a_different_store()
    {
        $product = Product::create([
            'name' => 'Panadol', 'selling_price' => 100, 'user_id' => $this->owner->id,
            'is_active' => true,
        ]);

        $otherStore = Store::create([
            'user_id' => $this->owner->id, 'name' => 'Store A2',
            'store_slug' => 'store-a2', 'device_id' => 'WEB-A2',
        ]);

        $otherStoreBatch = StockBatch::create([
            'product_id' => $product->id, 'user_id' => $this->owner->id,
            'store_id' => $otherStore->id,
            'batch_number' => 'B-OTHER-STORE', 'quantity' => 10, 'cost_price' => 40,
            'expiry_date' => now()->addMonth(),
        ]);

        $response = $this->actingAs($this->owner)->postJson('/api/v1/app/sales', [
            'items' => [['product_id' => $product->id, 'quantity' => 1]],
            'payment_method' => 'cash',
        ]);

        // No batch belongs to $this->store (the owner's default store) or
        // has a null store_id, so there's nothing eligible to sell.
        $response->assertStatus(422);
        $this->assertEquals(10, $otherStoreBatch->fresh()->quantity);
    }

    /**
     * Regression test for L1 (docs/KNOWN_BUGS.md): this endpoint used to
     * accept no discount/tax fields at all, so total_amount was always the
     * raw undiscounted subtotal no matter what a future caller sent.
     */
    public function test_applies_a_fixed_discount_and_tax()
    {
        $product = $this->stockedProduct($this->owner, price: 100);

        $response = $this->actingAs($this->owner)->postJson('/api/v1/app/sales', [
            'items' => [['product_id' => $product->id, 'quantity' => 2]],
            'payment_method' => 'cash',
            'discount_type' => 'fixed',
            'discount_amount' => 30,
            'tax_amount' => 10,
        ]);

        $response->assertStatus(201);
        $sale = Sale::first();
        $this->assertEquals(200, $sale->subtotal);
        $this->assertEquals(30, $sale->discount_total);
        $this->assertEquals(10, $sale->tax_amount);
        // 200 - 30 discount + 10 tax
        $this->assertEquals(180, $sale->total_amount);
        $this->assertEquals(180, $sale->amount_paid);
    }

    public function test_applies_a_percentage_discount()
    {
        $product = $this->stockedProduct($this->owner, price: 100);

        $response = $this->actingAs($this->owner)->postJson('/api/v1/app/sales', [
            'items' => [['product_id' => $product->id, 'quantity' => 2]],
            'payment_method' => 'cash',
            'discount_type' => 'percentage',
            'discount_amount' => 10,
        ]);

        $response->assertStatus(201);
        $sale = Sale::first();
        $this->assertEquals(200, $sale->subtotal);
        // 10% of 200
        $this->assertEquals(20, $sale->discount_total);
        $this->assertEquals(10, $sale->discount_percentage);
        $this->assertEquals(180, $sale->total_amount);
    }

    public function test_rejects_a_percentage_discount_over_100()
    {
        $product = $this->stockedProduct($this->owner, price: 100);

        $response = $this->actingAs($this->owner)->postJson('/api/v1/app/sales', [
            'items' => [['product_id' => $product->id, 'quantity' => 1]],
            'payment_method' => 'cash',
            'discount_type' => 'percentage',
            'discount_amount' => 150,
        ]);

        $response->assertStatus(422);
        $this->assertDatabaseCount('sales', 0);
    }

    public function test_a_flat_discount_larger_than_the_subtotal_never_goes_negative()
    {
        $product = $this->stockedProduct($this->owner, price: 100);

        $response = $this->actingAs($this->owner)->postJson('/api/v1/app/sales', [
            'items' => [['product_id' => $product->id, 'quantity' => 1]],
            'payment_method' => 'cash',
            'discount_type' => 'fixed',
            'discount_amount' => 500,
        ]);

        $response->assertStatus(201);
        $sale = Sale::first();
        $this->assertEquals(100, $sale->discount_total);
        $this->assertEquals(0, $sale->total_amount);
    }
}
