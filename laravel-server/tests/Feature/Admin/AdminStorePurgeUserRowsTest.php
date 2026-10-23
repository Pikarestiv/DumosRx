<?php

namespace Tests\Feature\Admin;

use App\Models\Sale;
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

/** A-292: the purge must remove a deleted user's rows without relying on declared foreign keys. */
class AdminStorePurgeUserRowsTest extends TestCase
{
    use RefreshDatabase {
        beginDatabaseTransaction as beginRefreshTransaction;
    }

    public function beginDatabaseTransaction()
    {
        // SQLite ignores this PRAGMA inside the test transaction, so set it first (docs/ADMIN_STORE_LIFECYCLE.md).
        DB::statement('PRAGMA foreign_keys = OFF');
        $this->beginRefreshTransaction();
        // The rollback above disconnects first, so restore the pragma on the PDO RefreshDatabase hands the next test.
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
            'first_name' => 'Super', 'last_name' => 'Admin',
            'email' => 'super-purge@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'super_admin',
        ]);
        $this->owner = User::create([
            'first_name' => 'Ada', 'last_name' => 'Owner',
            'email' => 'ada-purge@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);
        $this->store = Store::create([
            'user_id' => $this->owner->id,
            'name' => 'Purged Store',
            'device_id' => 'DEV-PURGE-001',
            'status' => Store::STATUS_ACTIVE,
        ]);
        $this->staff = User::create([
            'first_name' => 'Sam', 'last_name' => 'Staff',
            'email' => 'sam-purge@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'sales_staff',
            'store_id' => $this->store->id,
        ]);
    }

    private function withoutDeclaredForeignKeys(): void
    {
        $this->app->instance(ForeignKeyCascadeEmulator::class, new class extends ForeignKeyCascadeEmulator {
            public function cascadeChildren(string $parentTable, array $ids, array &$removed, array $skipTables = [], int $depth = 0): void
            {
            }
        });
    }

    private function purge(): void
    {
        app(AdminStoreDeletionService::class)->purgeStore($this->store->id, $this->superAdmin);
    }

    private function seedProduct(?string $storeId, string $userId): string
    {
        $id = (string) Str::uuid();
        DB::table('products')->insert([
            'id' => $id,
            'store_id' => $storeId,
            'user_id' => $userId,
            'name' => 'Paracetamol',
            'selling_price' => 100,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return $id;
    }

    #[Test]
    public function a_deleted_users_own_rows_are_removed_on_a_schema_with_no_foreign_keys(): void
    {
        $this->withoutDeclaredForeignKeys();
        DB::table('notifications')->insert([
            'id' => (string) Str::uuid(), 'user_id' => $this->owner->id,
            'title' => 'Hi', 'message' => 'Hello', 'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('feedback')->insert([
            'id' => (string) Str::uuid(), 'user_id' => $this->staff->id,
            'type' => 'bug', 'content' => 'Broken', 'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('activity_logs')->insert([
            'user_id' => $this->owner->id, 'store_id' => null, 'action' => 'LOGIN',
            'description' => 'Logged in', 'created_at' => now(), 'updated_at' => now(),
        ]);
        $legacyProduct = $this->seedProduct(null, $this->staff->id);

        $this->purge();

        $this->assertSame(0, DB::table('notifications')->where('user_id', $this->owner->id)->count());
        $this->assertSame(0, DB::table('feedback')->where('user_id', $this->staff->id)->count());
        $this->assertSame(0, DB::table('activity_logs')->where('user_id', $this->owner->id)->count());
        $this->assertFalse(DB::table('products')->where('id', $legacyProduct)->exists());
    }

    #[Test]
    public function a_surviving_users_pointer_at_a_deleted_user_is_cleared_and_versioned(): void
    {
        $this->withoutDeclaredForeignKeys();
        $manager = User::create([
            'first_name' => 'Kept', 'last_name' => 'User',
            'email' => 'kept-purge@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);
        DB::table('users')->where('id', $manager->id)->update([
            'account_manager_id' => $this->staff->id,
            'referred_by_id' => $this->owner->id,
            '_version' => 3,
            'updated_at' => now()->subDay(),
        ]);
        $this->travel(1)->minutes();

        $this->purge();

        $row = DB::table('users')->where('id', $manager->id)->first();
        $this->assertNull($row->account_manager_id);
        $this->assertNull($row->referred_by_id);
        $this->assertSame(4, (int) $row->_version);
        $this->assertTrue(\Illuminate\Support\Carbon::parse($row->updated_at)->greaterThan(now()->subMinute()));
    }

    public static function foreignKeyShapes(): array
    {
        return ['no declared foreign keys (production)' => [false], 'declared foreign keys' => [true]];
    }

    #[Test]
    #[\PHPUnit\Framework\Attributes\DataProvider('foreignKeyShapes')]
    public function a_staff_members_rows_in_a_sibling_store_survive_whether_or_not_the_schema_declares_foreign_keys(bool $declared): void
    {
        if (!$declared) {
            $this->withoutDeclaredForeignKeys();
        }
        $sibling = Store::create([
            'user_id' => $this->owner->id,
            'name' => 'Sibling Store',
            'device_id' => 'DEV-PURGE-002',
            'status' => Store::STATUS_ACTIVE,
        ]);
        $siblingProduct = $this->seedProduct($sibling->id, $this->staff->id);

        $this->purge();

        $this->assertTrue(DB::table('products')->where('id', $siblingProduct)->exists());
        $this->assertFalse(DB::table('users')->where('id', $this->staff->id)->exists());
    }

    #[Test]
    public function a_legacy_cashier_sales_line_items_go_with_it_on_a_schema_with_no_foreign_keys(): void
    {
        $this->withoutDeclaredForeignKeys();
        $sale = Sale::create([
            'transaction_number' => 'TXN-LEGACY-'.uniqid(),
            'cashier_id' => $this->staff->id,
            'subtotal' => 100,
            'total_amount' => 100,
            'payment_method' => 'cash',
            'payment_status' => 'completed',
            'amount_paid' => 100,
        ]);
        DB::table('sales')->where('id', $sale->id)->update(['store_id' => null]);
        $saleItemId = (string) Str::uuid();
        DB::table('sale_items')->insert([
            'id' => $saleItemId,
            'sale_id' => $sale->id,
            'product_id' => (string) Str::uuid(),
            'quantity' => 1,
            'unit_price' => 100,
            'total_price' => 100,
            'cost_price' => 50,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->purge();

        $this->assertFalse(DB::table('sales')->where('id', $sale->id)->exists());
        $this->assertFalse(DB::table('sale_items')->where('id', $saleItemId)->exists());
    }

    #[Test]
    public function a_staff_members_storeless_rows_are_kept_when_the_owner_keeps_another_store(): void
    {
        $this->withoutDeclaredForeignKeys();
        Store::create([
            'user_id' => $this->owner->id,
            'name' => 'Surviving Store',
            'device_id' => 'DEV-PURGE-003',
            'status' => Store::STATUS_ACTIVE,
        ]);
        $ambiguous = $this->seedProduct(null, $this->staff->id);

        $this->purge();

        $this->assertTrue(DB::table('products')->where('id', $ambiguous)->exists());
    }

    #[Test]
    public function a_storeless_prescription_takes_its_items_with_it(): void
    {
        $this->withoutDeclaredForeignKeys();
        $prescriptionId = (string) Str::uuid();
        DB::table('prescriptions')->insert([
            'id' => $prescriptionId, 'store_id' => null, 'user_id' => $this->owner->id,
            'prescription_number' => 'RX-LEGACY', 'prescription_date' => now()->toDateString(),
            'created_at' => now(), 'updated_at' => now(),
        ]);
        $itemId = (string) Str::uuid();
        DB::table('prescription_items')->insert([
            'id' => $itemId, 'prescription_id' => $prescriptionId, 'product_id' => (string) Str::uuid(),
            'quantity_prescribed' => 1, 'created_at' => now(), 'updated_at' => now(),
        ]);

        $this->purge();

        $this->assertFalse(DB::table('prescriptions')->where('id', $prescriptionId)->exists());
        $this->assertFalse(DB::table('prescription_items')->where('id', $itemId)->exists());
    }

    #[Test]
    public function the_pointer_list_covers_every_set_null_reference_the_schema_declares_against_users(): void
    {
        $declared = [];
        foreach (\App\Support\SchemaTables::names() as $table) {
            foreach (\Illuminate\Support\Facades\Schema::getForeignKeys($table) as $foreignKey) {
                if (\App\Support\SchemaTables::unqualified($foreignKey['foreign_table']) === 'users' && strtolower((string) $foreignKey['on_delete']) === 'set null') {
                    $declared[] = $table.'.'.$foreignKey['columns'][0];
                }
            }
        }

        $listed = [];
        foreach (\App\Services\Admin\PurgedUserRowSweeper::POINTER_COLUMNS as $table => $columns) {
            foreach ($columns as $column) {
                $listed[] = $table.'.'.$column;
            }
        }

        $this->assertNotEmpty($declared);
        $this->assertSame([], array_values(array_diff($declared, $listed)));
    }

    private function legacySaleWithAReturn(): array
    {
        $sale = Sale::create([
            'transaction_number' => 'TXN-RET-'.uniqid(),
            'cashier_id' => $this->staff->id,
            'subtotal' => 100, 'total_amount' => 100, 'payment_method' => 'cash',
            'payment_status' => 'completed', 'amount_paid' => 100,
        ]);
        DB::table('sales')->where('id', $sale->id)->update(['store_id' => null]);
        $returnId = (string) Str::uuid();
        DB::table('returns')->insert([
            'id' => $returnId, 'store_id' => null, 'sale_id' => $sale->id, 'user_id' => $this->staff->id,
            'total_refunded' => 10, 'created_at' => now(), 'updated_at' => now(),
        ]);
        $returnItemId = (string) Str::uuid();
        DB::table('return_items')->insert([
            'id' => $returnItemId, 'return_id' => $returnId, 'product_id' => (string) Str::uuid(),
            'quantity' => 1, 'unit_price' => 100, 'subtotal' => 100, 'created_at' => now(), 'updated_at' => now(),
        ]);

        return [$returnId, $returnItemId];
    }

    #[Test]
    #[\PHPUnit\Framework\Attributes\DataProvider('foreignKeyShapes')]
    public function a_legacy_sales_returns_go_with_it_whether_or_not_the_schema_declares_foreign_keys(bool $declared): void
    {
        if (!$declared) {
            $this->withoutDeclaredForeignKeys();
        }
        Store::create(['user_id' => $this->owner->id, 'name' => 'Kept', 'device_id' => 'DEV-PURGE-004', 'status' => Store::STATUS_ACTIVE]);
        [$returnId, $returnItemId] = $this->legacySaleWithAReturn();

        $this->purge();

        $this->assertFalse(DB::table('returns')->where('id', $returnId)->exists());
        $this->assertFalse(DB::table('return_items')->where('id', $returnItemId)->exists());
    }

    #[Test]
    public function a_staff_members_vendor_is_kept_when_the_owner_keeps_another_store(): void
    {
        $this->withoutDeclaredForeignKeys();
        Store::create(['user_id' => $this->owner->id, 'name' => 'Kept', 'device_id' => 'DEV-PURGE-005', 'status' => Store::STATUS_ACTIVE]);
        $vendorId = (string) Str::uuid();
        DB::table('vendors')->insert(['id' => $vendorId, 'user_id' => $this->staff->id, 'name' => 'Emzor', 'created_at' => now(), 'updated_at' => now()]);

        $this->purge();

        $this->assertTrue(DB::table('vendors')->where('id', $vendorId)->exists());
    }

    #[Test]
    public function the_children_map_covers_every_cascade_the_schema_declares_for_a_swept_parent(): void
    {
        $missing = [];
        foreach (\App\Support\SchemaTables::names() as $table) {
            foreach (\Illuminate\Support\Facades\Schema::getForeignKeys($table) as $foreignKey) {
                $parent = \App\Support\SchemaTables::unqualified($foreignKey['foreign_table']);
                if (isset(\App\Services\Admin\PurgedUserRowSweeper::CHILDREN[$parent]) && strtolower((string) $foreignKey['on_delete']) === 'cascade'
                    && (\App\Services\Admin\PurgedUserRowSweeper::CHILDREN[$parent][$table] ?? null) !== $foreignKey['columns'][0]) {
                    $missing[] = "{$parent} -> {$table}.{$foreignKey['columns'][0]}";
                }
            }
        }

        $this->assertSame([], $missing);
    }
}
