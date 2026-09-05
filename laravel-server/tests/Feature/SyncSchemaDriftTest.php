<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Regression coverage for a real production "stuck sync" report: several
 * server columns the client has always sent (STORE_SCOPED_TABLES in
 * client/lib/db/core.ts, and columns in client/lib/db/schema.ts) simply
 * didn't exist server-side, so every push touching them failed permanently
 * — no amount of retrying can fix a missing column.
 *
 * Worse, found while investigating: stock_audits, held_transactions,
 * loyalty_transactions, and customer_payments had no entry in
 * SyncController::getModelForTable() at all. That makes push() `continue`
 * silently (a server-side log warning only) instead of adding the change to
 * `response.failed` — and the client's push.ts treats "not in
 * response.failed" as "succeeded," deleting the change from its local
 * queue. Real customer payments, held transactions, loyalty point
 * transactions, and stock audits were being silently and permanently lost,
 * not just stuck.
 */
class SyncSchemaDriftTest extends TestCase
{
    use RefreshDatabase;

    protected User $user;
    protected Store $store;

    protected function setUp(): void
    {
        parent::setUp();

        \Illuminate\Support\Facades\Schema::disableForeignKeyConstraints();

        $this->user = User::create([
            'first_name' => 'Admin',
            'last_name' => 'User',
            'email' => 'admin@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'admin',
        ]);

        $this->store = Store::create([
            'user_id' => $this->user->id,
            'name' => 'Test Store',
            'email' => 'store@dumosrx.com',
            'phone' => '1234567890',
            'address' => '123 Test St',
            'slug' => 'test-store',
            'device_id' => 'WEB-TEST',
        ]);

        $this->user->update(['store_id' => $this->store->id]);

        \App\Models\SystemConfig::setVal('subscription_plans', [
            'tiers' => [
                'free' => [
                    'features' => ['cloud_sync' => true],
                    'limits' => ['stores' => -1],
                ],
            ],
        ]);

        $this->withoutMiddleware();

        \Illuminate\Support\Facades\Schema::enableForeignKeyConstraints();
    }

    private function push(array $changes): \Illuminate\Testing\TestResponse
    {
        return $this->actingAs($this->user)->postJson('/api/v1/app/sync/push', [
            'setup' => true,
            'changes' => $changes,
        ]);
    }

    public function test_customer_payment_push_succeeds_instead_of_being_silently_dropped()
    {
        $customer = \App\Models\Customer::create(['first_name' => 'Jane', 'store_id' => $this->store->id]);

        $response = $this->push([[
            'table_name' => 'customer_payments',
            'operation' => 'INSERT',
            'record_id' => 'pay_1',
            'payload' => [
                'id' => 'pay_1',
                'customer_id' => $customer->id,
                'store_id' => $this->store->id,
                'amount' => 5000,
                'payment_method' => 'cash',
            ],
        ]]);

        $response->assertStatus(200);
        $response->assertJsonMissingPath('failed.0');
        $this->assertDatabaseHas('customer_payments', ['id' => 'pay_1', 'amount' => 5000]);
    }

    public function test_held_transaction_push_succeeds_instead_of_being_silently_dropped()
    {
        $response = $this->push([[
            'table_name' => 'held_transactions',
            'operation' => 'INSERT',
            'record_id' => 'hold_1',
            'payload' => [
                'id' => 'hold_1',
                'store_id' => $this->store->id,
                'items_json' => '[]',
                'total_amount' => 1000,
                'discount' => 100,
                'discount_type' => 'fixed',
            ],
        ]]);

        $response->assertStatus(200);
        $response->assertJsonMissingPath('failed.0');
        $this->assertDatabaseHas('held_transactions', ['id' => 'hold_1', 'discount' => 100]);
    }

    public function test_loyalty_transaction_push_succeeds_instead_of_being_silently_dropped()
    {
        $customer = \App\Models\Customer::create(['first_name' => 'Jane', 'store_id' => $this->store->id]);

        $response = $this->push([[
            'table_name' => 'loyalty_transactions',
            'operation' => 'INSERT',
            'record_id' => 'lt_1',
            'payload' => [
                'id' => 'lt_1',
                'store_id' => $this->store->id,
                'customer_id' => $customer->id,
                'points' => 50,
                'type' => 'earn',
            ],
        ]]);

        $response->assertStatus(200);
        $response->assertJsonMissingPath('failed.0');
        $this->assertDatabaseHas('loyalty_transactions', ['id' => 'lt_1', 'type' => 'earn']);
    }

    public function test_stock_audit_push_succeeds_instead_of_being_silently_dropped()
    {
        $product = Product::create(['name' => 'Paracetamol', 'store_id' => $this->store->id, 'is_active' => true]);

        $response = $this->push([[
            'table_name' => 'stock_audits',
            'operation' => 'INSERT',
            'record_id' => 'audit_1',
            'payload' => [
                'id' => 'audit_1',
                'store_id' => $this->store->id,
                'product_id' => $product->id,
                'expected_quantity' => 10,
                'actual_quantity' => 8,
                'difference' => -2,
                'user_id' => $this->user->id,
                'status' => 'pending',
            ],
        ]]);

        $response->assertStatus(200);
        $response->assertJsonMissingPath('failed.0');
        $this->assertDatabaseHas('stock_audits', ['id' => 'audit_1', 'difference' => -2]);
    }

    public function test_prescription_item_push_with_unit_cost_succeeds()
    {
        // product_id/quantity_prescribed/quantity_dispensed/status are only
        // dropped from prescription_items on non-sqlite drivers (see
        // align_prescription_items_with_client migration) — a pre-existing,
        // unrelated test-environment quirk. Real clients never send any of
        // these (all dropped from client/lib/db/schema.ts too); they're
        // included solely so this test's sqlite run satisfies NOT NULL
        // constraints that don't exist on the real MySQL server.
        $product = Product::create(['name' => 'Tramadol', 'store_id' => $this->store->id, 'is_active' => true]);

        $response = $this->push([[
            'table_name' => 'prescriptions',
            'operation' => 'INSERT',
            'record_id' => 'rx_1',
            'payload' => ['id' => 'rx_1', 'store_id' => $this->store->id, 'status' => 'pending'],
        ], [
            'table_name' => 'prescription_items',
            'operation' => 'INSERT',
            'record_id' => 'rxi_1',
            'payload' => [
                'id' => 'rxi_1',
                'prescription_id' => 'rx_1',
                'store_id' => $this->store->id,
                'product_id' => $product->id,
                'quantity_prescribed' => 5,
                'quantity_dispensed' => 0,
                'status' => 'pending',
                'product_name' => 'Tramadol 100mg',
                'quantity' => 5,
                'cost' => 1500,
                'unit_cost' => 300,
            ],
        ]]);

        $response->assertStatus(200);
        $response->assertJsonMissingPath('failed.0');
        $this->assertDatabaseHas('prescription_items', ['id' => 'rxi_1', 'unit_cost' => 300]);
    }

    public function test_loyalty_tier_push_with_store_id_succeeds()
    {
        $response = $this->push([[
            'table_name' => 'loyalty_tiers',
            'operation' => 'INSERT',
            'record_id' => 'tier_1',
            'payload' => [
                'id' => 'tier_1',
                'user_id' => $this->user->id,
                'store_id' => $this->store->id,
                'name' => 'Bronze',
                'min_spend' => 0,
            ],
        ]]);

        $response->assertStatus(200);
        $response->assertJsonMissingPath('failed.0');
        $this->assertDatabaseHas('loyalty_tiers', ['id' => 'tier_1', 'store_id' => $this->store->id]);
    }

    public function test_loyalty_redemption_option_push_with_store_id_and_discount_value_succeeds()
    {
        $response = $this->push([[
            'table_name' => 'loyalty_redemption_options',
            'operation' => 'INSERT',
            'record_id' => 'redeem_1',
            'payload' => [
                'id' => 'redeem_1',
                'user_id' => $this->user->id,
                'store_id' => $this->store->id,
                'label' => 'N500 Discount',
                'points_cost' => 500,
                'discount_value' => 500,
            ],
        ]]);

        $response->assertStatus(200);
        $response->assertJsonMissingPath('failed.0');
        $this->assertDatabaseHas('loyalty_redemption_options', ['id' => 'redeem_1', 'discount_value' => 500]);
    }

    public function test_stock_batch_push_without_cost_price_succeeds_via_server_default()
    {
        $product = Product::create(['name' => 'Paracetamol', 'store_id' => $this->store->id, 'is_active' => true]);

        $response = $this->push([[
            'table_name' => 'stock_batches',
            'operation' => 'INSERT',
            'record_id' => 'batch_1',
            'payload' => [
                'id' => 'batch_1',
                'product_id' => $product->id,
                'store_id' => $this->store->id,
                'batch_number' => 'AUDIT-2026-09-02',
                'quantity' => 0,
                // Deliberately no cost_price, matching the real audit-adjustment
                // payload from the Sentry report.
            ],
        ]]);

        $response->assertStatus(200);
        $response->assertJsonMissingPath('failed.0');
        $this->assertDatabaseHas('stock_batches', ['id' => 'batch_1', 'cost_price' => 0]);
    }

    public function test_pull_scopes_the_four_previously_unsynced_tables_by_store_without_erroring()
    {
        // Note: this alone can't be trusted to catch a genuinely missing
        // column — SQLite (this test's driver) was found to silently
        // tolerate `WHERE nonexistent_column = ?` (zero rows, no error)
        // for a query shape identical to one that throws "Unknown column"
        // on the real MySQL server. See SyncSchemaParityTest for the
        // column-existence check this test can't reliably perform.
        $response = $this->actingAs($this->user)->postJson('/api/v1/app/sync/pull', [
            'last_synced' => [],
        ]);

        $response->assertStatus(200);
        foreach (['stock_audits', 'held_transactions', 'loyalty_transactions', 'customer_payments', 'audit_logs'] as $table) {
            $this->assertArrayHasKey($table, $response->json('changes'));
        }
    }
}
