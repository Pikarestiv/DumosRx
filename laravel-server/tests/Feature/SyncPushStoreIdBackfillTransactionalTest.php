<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Regression coverage for A-166, the transactional half of A-164: stock_audits,
 * held_transactions, loyalty_transactions and customer_payments were absent
 * from SyncController::STORE_ID_BACKFILL_TABLES, so an INSERT whose payload
 * omitted store_id was stored unscoped and stayed invisible to pull(), and an
 * UPDATE naming another tenant's store_id was forceFilled straight onto the
 * row. See docs/FIXED_BUGS.md.
 */
class SyncPushStoreIdBackfillTransactionalTest extends TestCase
{
    use RefreshDatabase;

    protected User $owner;
    protected Store $store;

    public static function transactionalTables(): array
    {
        return [
            'stock_audits' => ['stock_audits'],
            'held_transactions' => ['held_transactions'],
            'loyalty_transactions' => ['loyalty_transactions'],
            'customer_payments' => ['customer_payments'],
        ];
    }

    protected function setUp(): void
    {
        parent::setUp();

        \Illuminate\Support\Facades\Schema::disableForeignKeyConstraints();

        $this->owner = User::create([
            'first_name' => 'Txn',
            'last_name' => 'Owner',
            'email' => 'txn-owner@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'admin',
        ]);
        $this->store = Store::create([
            'user_id' => $this->owner->id,
            'name' => 'Txn Store',
            'email' => 'txn-store@dumosrx.com',
            'phone' => '6666666666',
            'address' => '6 Txn St',
            'slug' => 'txn-store',
            'device_id' => 'WEB-TXN',
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

        \Illuminate\Support\Facades\Schema::enableForeignKeyConstraints();
    }

    private function push(string $table, string $recordId, array $payload, string $operation = 'INSERT', array $headers = [])
    {
        return $this->actingAs($this->owner)->withHeaders($headers)->postJson('/api/v1/app/sync/push', [
            'setup' => true,
            'changes' => [
                [
                    'table_name' => $table,
                    'operation' => $operation,
                    'record_id' => $recordId,
                    'payload' => $payload,
                ],
            ],
        ]);
    }

    private function createSecondStore(): Store
    {
        return Store::create([
            'user_id' => $this->owner->id,
            'name' => 'Second Txn Store',
            'email' => 'txn-store-2@dumosrx.com',
            'phone' => '6666666667',
            'address' => '7 Txn St',
            'slug' => 'txn-store-2',
            'device_id' => 'WEB-TXN-2',
        ]);
    }

    private function createForeignStore(): Store
    {
        $foreignOwner = User::create([
            'first_name' => 'Foreign',
            'last_name' => 'Txn',
            'email' => 'foreign-txn@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'admin',
        ]);
        $foreignStore = Store::create([
            'user_id' => $foreignOwner->id,
            'name' => 'Foreign Txn Store',
            'email' => 'foreign-txn-store@dumosrx.com',
            'phone' => '7777777777',
            'address' => '8 Foreign St',
            'slug' => 'foreign-txn-store',
            'device_id' => 'WEB-FOREIGN-TXN',
        ]);
        $foreignOwner->update(['store_id' => $foreignStore->id]);

        return $foreignStore;
    }

    private function payloadFor(string $table, string $recordId): array
    {
        $base = ['id' => $recordId, '_version' => 1];

        return match ($table) {
            'stock_audits' => $base + [
                'product_id' => 'txn-product-1',
                'expected_quantity' => 10,
                'actual_quantity' => 8,
                'difference' => -2,
                'user_id' => $this->owner->id,
                'status' => 'reconciled',
                'notes' => 'counted',
            ],
            'held_transactions' => $base + [
                'customer_name' => 'Walk-in Customer',
                'items_json' => '[]',
                'total_amount' => 1500,
                'notes' => 'held',
            ],
            'loyalty_transactions' => $base + [
                'customer_id' => 'txn-customer-1',
                'points' => 25,
                'type' => 'earned',
            ],
            'customer_payments' => $base + [
                'customer_id' => 'txn-customer-1',
                'amount' => 2500,
                'payment_method' => 'cash',
            ],
        };
    }

    private function mutableField(string $table): array
    {
        return match ($table) {
            'stock_audits' => ['notes', 'recounted'],
            'held_transactions' => ['customer_name', 'Renamed Customer'],
            'loyalty_transactions' => ['type', 'redeemed'],
            'customer_payments' => ['payment_method', 'transfer'],
        };
    }

    private function seedRow(string $table, string $recordId, string $storeId): void
    {
        DB::table($table)->insert($this->payloadFor($table, $recordId) + [
            'store_id' => $storeId,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    #[DataProvider('transactionalTables')]
    public function test_insert_without_store_id_is_backfilled_from_the_callers_store(string $table)
    {
        $recordId = "{$table}-no-store";

        $response = $this->push($table, $recordId, $this->payloadFor($table, $recordId));

        $response->assertStatus(200);
        $response->assertJsonCount(0, 'failed');

        $this->assertSame(
            $this->store->id,
            DB::table($table)->where('id', $recordId)->value('store_id'),
            "a pushed {$table} row with no store_id must be scoped to the pusher's store, not left NULL"
        );
    }

    #[DataProvider('transactionalTables')]
    public function test_insert_naming_another_stores_id_is_refused(string $table)
    {
        $foreignStore = $this->createForeignStore();
        $recordId = "{$table}-cross-tenant-insert";

        $payload = $this->payloadFor($table, $recordId);
        $payload['store_id'] = $foreignStore->id;

        $response = $this->push($table, $recordId, $payload);

        $response->assertStatus(200);
        $response->assertJsonPath('failed.0.reason', 'permission_denied');
        $this->assertDatabaseMissing($table, ['id' => $recordId]);
    }

    #[DataProvider('transactionalTables')]
    public function test_update_omitting_store_id_keeps_its_original_store(string $table)
    {
        $secondStore = $this->createSecondStore();
        $recordId = "{$table}-update-keeps-store";
        $this->seedRow($table, $recordId, $this->store->id);

        [$field, $newValue] = $this->mutableField($table);
        $response = $this->push($table, $recordId, [
            'id' => $recordId,
            $field => $newValue,
            '_version' => 1,
        ], 'UPDATE', ['X-Store-Id' => $secondStore->id]);

        $response->assertStatus(200);
        $response->assertJsonCount(0, 'failed');

        $row = DB::table($table)->where('id', $recordId)->first();
        $this->assertSame($newValue, $row->{$field});
        $this->assertSame(
            $this->store->id,
            $row->store_id,
            "an UPDATE to {$table} that omits store_id must never reassign the row to the push's active store"
        );
    }

    #[DataProvider('transactionalTables')]
    public function test_update_naming_another_stores_id_is_refused(string $table)
    {
        $foreignStore = $this->createForeignStore();
        $recordId = "{$table}-cross-tenant-update";
        $this->seedRow($table, $recordId, $this->store->id);

        [$field, $newValue] = $this->mutableField($table);
        $response = $this->push($table, $recordId, [
            'id' => $recordId,
            'store_id' => $foreignStore->id,
            $field => $newValue,
            '_version' => 1,
        ], 'UPDATE');

        $response->assertStatus(200);
        $response->assertJsonPath('failed.0.reason', 'permission_denied');

        $this->assertSame(
            $this->store->id,
            DB::table($table)->where('id', $recordId)->value('store_id'),
            "an UPDATE to {$table} naming a foreign store_id must never be applied to the row"
        );
    }

    #[DataProvider('transactionalTables')]
    public function test_insert_overridden_to_update_keeps_its_original_store(string $table)
    {
        $secondStore = $this->createSecondStore();
        $recordId = "{$table}-insert-override";
        $this->seedRow($table, $recordId, $this->store->id);

        [$field, $newValue] = $this->mutableField($table);
        $response = $this->push($table, $recordId, [
            'id' => $recordId,
            $field => $newValue,
            '_version' => 1,
        ], 'INSERT', ['X-Store-Id' => $secondStore->id]);

        $response->assertStatus(200);
        $response->assertJsonCount(0, 'failed');

        $this->assertSame(
            $this->store->id,
            DB::table($table)->where('id', $recordId)->value('store_id'),
            "a re-queued {$table} INSERT that push() rewrites into an UPDATE must not carry its backfilled store_id onto the existing row"
        );
    }
}
