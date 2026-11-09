<?php

namespace Tests\Feature\Admin;

use App\Models\Store;
use App\Models\User;
use App\Services\Admin\AdminStoreDeletionService;
use App\Services\Admin\ForeignKeyCascadeEmulator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Foundation\Testing\RefreshDatabaseState;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class AdminStorePurgeParentAndAliasRowsTest extends TestCase
{
    use RefreshDatabase {
        beginDatabaseTransaction as beginRefreshTransaction;
    }

    public function beginDatabaseTransaction()
    {
        DB::statement('PRAGMA foreign_keys = OFF');
        $this->beginRefreshTransaction();
        $this->beforeApplicationDestroyed(fn () => RefreshDatabaseState::$inMemoryConnections['sqlite']->exec('PRAGMA foreign_keys = ON'));
    }

    protected User $superAdmin;

    protected User $owner;

    protected User $staff;

    protected Store $store;

    protected function setUp(): void
    {
        parent::setUp();

        $this->superAdmin = User::create([
            'first_name' => 'Super',
            'last_name' => 'Admin',
            'email' => 'super-purge-alias@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'super_admin',
        ]);
        $this->owner = User::create([
            'first_name' => 'Ada',
            'last_name' => 'Owner',
            'email' => 'ada-purge-alias@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);
        $this->store = Store::create([
            'user_id' => $this->owner->id,
            'name' => 'Purged Store Alias',
            'device_id' => 'DEV-PURGE-ALIAS-001',
            'status' => Store::STATUS_ACTIVE,
        ]);
        $this->staff = User::create([
            'first_name' => 'Sam',
            'last_name' => 'Staff',
            'email' => 'sam-purge-alias@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'sales_staff',
            'store_id' => $this->store->id,
        ]);
    }

    private function withoutDeclaredForeignKeys(): void
    {
        $this->app->instance(ForeignKeyCascadeEmulator::class, new class extends ForeignKeyCascadeEmulator
        {
            public function cascadeChildren(string $parentTable, array $ids, array &$removed, array $skipTables = [], int $depth = 0): void {}
        });
    }

    private function purge(): void
    {
        app(AdminStoreDeletionService::class)->purgeStore($this->store->id, $this->superAdmin);
    }

    #[Test]
    public function storeless_purchase_orders_keyed_by_ordered_by_and_their_items_are_swept_on_whole_tenant_purge(): void
    {
        $this->withoutDeclaredForeignKeys();
        $poId = (string) Str::uuid();
        DB::table('purchase_orders')->insert([
            'id' => $poId,
            'store_id' => null,
            'ordered_by' => $this->owner->id,
            'order_number' => 'PO-LEGACY-001',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $itemId = (string) Str::uuid();
        DB::table('purchase_order_items')->insert([
            'id' => $itemId,
            'purchase_order_id' => $poId,
            'product_id' => (string) Str::uuid(),
            'quantity_ordered' => 5,
            'unit_cost' => 100,
            'total_cost' => 500,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->purge();

        $this->assertFalse(DB::table('purchase_orders')->where('id', $poId)->exists());
        $this->assertFalse(DB::table('purchase_order_items')->where('id', $itemId)->exists());
    }

    #[Test]
    public function storeless_purchase_orders_are_kept_when_owner_keeps_another_store(): void
    {
        $this->withoutDeclaredForeignKeys();
        Store::create([
            'user_id' => $this->owner->id,
            'name' => 'Kept Sibling',
            'device_id' => 'DEV-PURGE-ALIAS-002',
            'status' => Store::STATUS_ACTIVE,
        ]);
        $poId = (string) Str::uuid();
        DB::table('purchase_orders')->insert([
            'id' => $poId,
            'store_id' => null,
            'ordered_by' => $this->staff->id,
            'order_number' => 'PO-LEGACY-002',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->purge();

        $this->assertTrue(DB::table('purchase_orders')->where('id', $poId)->exists());
    }

    #[Test]
    public function storeless_stock_movements_keyed_by_performed_by_are_swept_on_whole_tenant_purge(): void
    {
        $this->withoutDeclaredForeignKeys();
        $movementId = (string) Str::uuid();
        DB::table('stock_movements')->insert([
            'id' => $movementId,
            'store_id' => null,
            'stock_batch_id' => (string) Str::uuid(),
            'product_id' => (string) Str::uuid(),
            'performed_by' => $this->owner->id,
            'movement_type' => 'adjustment',
            'quantity' => 10,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->purge();

        $this->assertFalse(DB::table('stock_movements')->where('id', $movementId)->exists());
    }

    #[Test]
    public function storeless_customers_take_their_payments_loyalty_and_held_transactions_with_them(): void
    {
        $this->withoutDeclaredForeignKeys();
        $customerId = (string) Str::uuid();
        DB::table('customers')->insert([
            'id' => $customerId,
            'store_id' => null,
            'user_id' => $this->owner->id,
            'first_name' => 'Ada',
            'last_name' => 'Customer',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $paymentId = (string) Str::uuid();
        DB::table('customer_payments')->insert([
            'id' => $paymentId,
            'customer_id' => $customerId,
            'store_id' => null,
            'amount' => 1000,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $loyaltyId = (string) Str::uuid();
        DB::table('loyalty_transactions')->insert([
            'id' => $loyaltyId,
            'customer_id' => $customerId,
            'points' => 50,
            'type' => 'earn',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $heldId = (string) Str::uuid();
        DB::table('held_transactions')->insert([
            'id' => $heldId,
            'customer_id' => $customerId,
            'items_json' => json_encode([]),
            'total_amount' => 1000,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->purge();

        $this->assertFalse(DB::table('customers')->where('id', $customerId)->exists());
        $this->assertFalse(DB::table('customer_payments')->where('id', $paymentId)->exists());
        $this->assertFalse(DB::table('loyalty_transactions')->where('id', $loyaltyId)->exists());
        $this->assertFalse(DB::table('held_transactions')->where('id', $heldId)->exists());
    }

    #[Test]
    public function storeless_suppliers_take_their_payments_and_purchase_orders_with_them(): void
    {
        $this->withoutDeclaredForeignKeys();
        $supplierId = (string) Str::uuid();
        DB::table('suppliers')->insert([
            'id' => $supplierId,
            'store_id' => null,
            'user_id' => $this->owner->id,
            'name' => 'Legacy Supplier',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $supplierPaymentId = (string) Str::uuid();
        DB::table('supplier_payments')->insert([
            'id' => $supplierPaymentId,
            'supplier_id' => $supplierId,
            'store_id' => null,
            'amount' => 2500,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $poId = (string) Str::uuid();
        DB::table('purchase_orders')->insert([
            'id' => $poId,
            'supplier_id' => $supplierId,
            'ordered_by' => $this->owner->id,
            'store_id' => null,
            'order_number' => 'PO-SUPP-001',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $poItemId = (string) Str::uuid();
        DB::table('purchase_order_items')->insert([
            'id' => $poItemId,
            'purchase_order_id' => $poId,
            'product_id' => (string) Str::uuid(),
            'quantity_ordered' => 2,
            'unit_cost' => 500,
            'total_cost' => 1000,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->purge();

        $this->assertFalse(DB::table('suppliers')->where('id', $supplierId)->exists());
        $this->assertFalse(DB::table('supplier_payments')->where('id', $supplierPaymentId)->exists());
        $this->assertFalse(DB::table('purchase_orders')->where('id', $poId)->exists());
        $this->assertFalse(DB::table('purchase_order_items')->where('id', $poItemId)->exists());
    }

    #[Test]
    public function storeless_products_take_their_batches_and_movements_with_them(): void
    {
        $this->withoutDeclaredForeignKeys();
        $productId = (string) Str::uuid();
        DB::table('products')->insert([
            'id' => $productId,
            'store_id' => null,
            'user_id' => $this->owner->id,
            'name' => 'Legacy Product',
            'selling_price' => 200,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $batchId = (string) Str::uuid();
        DB::table('stock_batches')->insert([
            'id' => $batchId,
            'product_id' => $productId,
            'batch_number' => 'BATCH-LEGACY-001',
            'quantity' => 15,
            'cost_price' => 120,
            'expiry_date' => now()->addYear()->toDateString(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $movementId = (string) Str::uuid();
        DB::table('stock_movements')->insert([
            'id' => $movementId,
            'product_id' => $productId,
            'stock_batch_id' => $batchId,
            'performed_by' => $this->owner->id,
            'movement_type' => 'receipt',
            'quantity' => 15,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->purge();

        $this->assertFalse(DB::table('products')->where('id', $productId)->exists());
        $this->assertFalse(DB::table('stock_batches')->where('id', $batchId)->exists());
        $this->assertFalse(DB::table('stock_movements')->where('id', $movementId)->exists());
    }
}
