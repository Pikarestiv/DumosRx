<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * A-281. Nine models had a `deleted_at` column but no `SoftDeletes` trait, so
 * a client DELETE push destroyed the row: the delete reached no other device,
 * an edit to it was silently counted processed, and a whole-row resend
 * recreated it. Rationale in laravel-server/AGENTS.md, "Every pulled table
 * soft-deletes".
 */
class SyncDeletePropagatesForAllTablesTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private Store $store;

    protected function setUp(): void
    {
        parent::setUp();

        Schema::disableForeignKeyConstraints();

        $this->owner = User::create([
            'first_name' => 'Delete',
            'last_name' => 'Owner',
            'email' => 'delete-owner@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'admin',
        ]);
        $this->store = Store::create([
            'user_id' => $this->owner->id,
            'name' => 'Delete Store',
            'slug' => 'delete-store',
            'device_id' => 'WEB-DELETE',
            'currency' => 'NGN',
        ]);
        $this->owner->update(['store_id' => $this->store->id]);

        \App\Models\SystemConfig::setVal('subscription_plans', [
            'tiers' => [
                'free' => [
                    'features' => ['cloud_sync' => true],
                    'limits' => ['stores' => -1],
                ],
            ],
        ]);

        $this->withoutMiddleware();
    }

    /**
     * The nine tables, each with the minimum its NOT NULL columns demand.
     * `purchase_order_items` and `prescription_items` derive their scoping
     * through a parent, so each gets one.
     */
    private function rowsUnderTest(): array
    {
        $storeId = $this->store->id;

        DB::table('products')->insert([
            'id' => 'prod-x',
            'store_id' => $storeId,
            'user_id' => $this->owner->id,
            'name' => 'Painkillers',
            'selling_price' => 500,
            '_version' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        DB::table('suppliers')->insert([
            'id' => 'sup-x',
            'store_id' => $storeId,
            'name' => 'Acme Pharma',
            '_version' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        DB::table('purchase_orders')->insert([
            'id' => 'po-parent',
            'store_id' => $storeId,
            'order_number' => 'PO-PARENT',
            'ordered_by' => $this->owner->id,
            '_version' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        DB::table('prescriptions')->insert([
            'id' => 'rx-parent',
            'store_id' => $storeId,
            'prescription_number' => 'RX-PARENT',
            '_version' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return [
            'categories' => ['id' => 'cat-del', 'store_id' => $storeId, 'name' => 'Cosmetics'],
            'expenses' => ['id' => 'exp-del', 'store_id' => $storeId, 'category' => 'Rent', 'amount' => 5000, 'date' => now()->toDateString()],
            'purchase_orders' => ['id' => 'po-del', 'store_id' => $storeId, 'order_number' => 'PO-DEL', 'ordered_by' => $this->owner->id],
            'purchase_order_items' => ['id' => 'poi-del', 'purchase_order_id' => 'po-parent', 'product_id' => 'prod-x', 'quantity_ordered' => 2, 'unit_cost' => 10, 'total_cost' => 20],
            'prescriptions' => ['id' => 'rx-del', 'store_id' => $storeId, 'prescription_number' => 'RX-DEL'],
            'prescription_items' => ['id' => 'rxi-del', 'prescription_id' => 'rx-parent', 'product_id' => 'prod-x', 'quantity_prescribed' => 3],
            'requested_products' => ['id' => 'req-del', 'store_id' => $storeId, 'product_name' => 'Insulin'],
            'supplier_payments' => ['id' => 'sp-del', 'store_id' => $storeId, 'supplier_id' => 'sup-x', 'amount' => 900],
            'permission_groups' => ['id' => 'pg-del', 'store_id' => $storeId, 'name' => 'Custom Cashier', 'based_on_role' => 'cashier'],
        ];
    }

    private function seedRow(string $table, array $row): void
    {
        DB::table($table)->insert($row + [
            '_version' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function pushDelete(string $table, string $id)
    {
        return $this->actingAs($this->owner)->postJson('/api/v1/app/sync/push', [
            'setup' => true,
            'changes' => [
                [
                    'table_name' => $table,
                    'operation' => 'DELETE',
                    'record_id' => $id,
                    'payload' => ['id' => $id, 'store_id' => $this->store->id],
                ],
            ],
        ]);
    }

    public function test_a_client_delete_soft_deletes_rather_than_destroys_the_row()
    {
        foreach ($this->rowsUnderTest() as $table => $row) {
            $this->seedRow($table, $row);

            $this->pushDelete($table, $row['id'])->assertStatus(200);

            $stored = DB::table($table)->where('id', $row['id'])->first();
            $this->assertNotNull($stored, "{$table}: the DELETE destroyed the row instead of soft-deleting it.");
            $this->assertNotNull($stored->deleted_at, "{$table}: the row survived but was never marked deleted.");
        }
    }

    public function test_the_next_pull_delivers_the_delete_to_every_other_device()
    {
        foreach ($this->rowsUnderTest() as $table => $row) {
            $this->seedRow($table, $row);
            $this->pushDelete($table, $row['id'])->assertStatus(200);

            $pull = $this->actingAs($this->owner)->postJson('/api/v1/app/sync/pull', [
                'setup' => true,
                'last_synced' => [],
            ]);
            $pull->assertStatus(200);

            $delivered = collect($pull->json("changes.{$table}"))->firstWhere('id', $row['id']);
            $this->assertNotNull($delivered, "{$table}: the deleted row was not offered by the pull at all.");
            $this->assertSame(1, $delivered['_deleted'], "{$table}: the pull did not tell other devices the row is deleted.");
        }
    }

    /**
     * The trait's global scope also applies to the subqueries that scope the
     * child tables, so a soft-deleted parent would silently stop its children
     * being pulled at all — the device could then never learn they were
     * deleted. Same rule as A-176a's `stock_batches`.
     */
    public function test_children_of_a_soft_deleted_parent_are_still_pulled()
    {
        $rows = $this->rowsUnderTest();
        $this->seedRow('purchase_order_items', $rows['purchase_order_items']);
        $this->seedRow('prescription_items', $rows['prescription_items']);

        $this->pushDelete('purchase_orders', 'po-parent')->assertStatus(200);
        $this->pushDelete('prescriptions', 'rx-parent')->assertStatus(200);

        $pull = $this->actingAs($this->owner)->postJson('/api/v1/app/sync/pull', [
            'setup' => true,
            'last_synced' => [],
        ]);
        $pull->assertStatus(200);

        $this->assertNotNull(
            collect($pull->json('changes.purchase_order_items'))->firstWhere('id', 'poi-del'),
            'A deleted purchase order must not hide its items from the pull.',
        );
        $this->assertNotNull(
            collect($pull->json('changes.prescription_items'))->firstWhere('id', 'rxi-del'),
            'A deleted prescription must not hide its items from the pull.',
        );
    }

    /**
     * `categories` is UNIQUE (store_id, name) and the index counts
     * soft-deleted rows, so the duplicate-INSERT probe has to see a trashed
     * row or the INSERT it was meant to avoid fails outright. Re-creating a
     * category by the same name restores the row the client is really naming.
     */
    public function test_recreating_a_deleted_category_by_name_restores_it_instead_of_colliding()
    {
        $rows = $this->rowsUnderTest();
        $this->seedRow('categories', $rows['categories']);
        $this->pushDelete('categories', 'cat-del')->assertStatus(200);

        $response = $this->actingAs($this->owner)->postJson('/api/v1/app/sync/push', [
            'setup' => true,
            'changes' => [
                [
                    'table_name' => 'categories',
                    'operation' => 'INSERT',
                    'record_id' => 'cat-new',
                    'payload' => ['id' => 'cat-new', 'store_id' => $this->store->id, 'name' => 'Cosmetics'],
                ],
            ],
        ]);

        $response->assertStatus(200)->assertJsonCount(0, 'failed');
        $response->assertJsonPath('id_map.categories.cat-new', 'cat-del');
        $this->assertNull(
            DB::table('categories')->where('id', 'cat-del')->value('deleted_at'),
            'The row the client was remapped onto must not stay deleted, or its new category vanishes on the next pull.',
        );
    }

    public function test_a_whole_row_resend_does_not_resurrect_a_deleted_row()
    {
        foreach ($this->rowsUnderTest() as $table => $row) {
            $this->seedRow($table, $row);
            $this->pushDelete($table, $row['id'])->assertStatus(200);

            $this->actingAs($this->owner)->postJson('/api/v1/app/sync/push', [
                'setup' => true,
                'changes' => [
                    [
                        'table_name' => $table,
                        'operation' => 'INSERT',
                        'record_id' => $row['id'],
                        'payload' => $row + ['_version' => 1],
                    ],
                ],
            ])->assertStatus(200);

            $this->assertNotNull(
                DB::table($table)->where('id', $row['id'])->value('deleted_at'),
                "{$table}: a re-sent INSERT undid the delete on the device that made it.",
            );
        }
    }
}
