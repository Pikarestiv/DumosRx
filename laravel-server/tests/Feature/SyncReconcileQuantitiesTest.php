<?php

namespace Tests\Feature;

use App\Http\Controllers\Api\App\SyncController;
use App\Models\ActivityLog;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * A-148: POST /app/sync/reconcile-quantities accepts a client-reported
 * stock_batches.quantity snapshot and closes the gap left by a batch whose
 * opening stock never produced a stock_movements row, recording the
 * correction as a real, labelled 'sync_reconciliation' movement plus one
 * summary ActivityLog per store touched.
 */
class SyncReconcileQuantitiesTest extends TestCase
{
    use RefreshDatabase;

    protected User $owner;
    protected Store $store;
    protected User $staff;
    protected User $outsider;
    protected Store $outsiderStore;

    protected function setUp(): void
    {
        parent::setUp();

        Schema::disableForeignKeyConstraints();

        $this->owner = User::create([
            'first_name' => 'Owner', 'last_name' => 'User',
            'email' => 'owner@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $this->store = Store::create([
            'user_id' => $this->owner->id,
            'name' => 'Main Store',
            'store_slug' => 'main-store',
            'device_id' => 'WEB-MAIN',
        ]);

        $this->staff = User::create([
            'first_name' => 'Staff', 'last_name' => 'Member',
            'email' => 'staff@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'sales_staff',
            'store_id' => $this->store->id,
        ]);

        $this->outsider = User::create([
            'first_name' => 'Other', 'last_name' => 'Owner',
            'email' => 'other@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $this->outsiderStore = Store::create([
            'user_id' => $this->outsider->id,
            'name' => 'Other Store',
            'store_slug' => 'other-store',
            'device_id' => 'WEB-OTHER',
        ]);

        \App\Models\SystemConfig::setVal('subscription_plans', [
            'tiers' => [
                'free' => [
                    'features' => ['cloud_sync' => true],
                    'limits' => ['stores' => -1],
                ],
            ],
        ]);

        $this->withoutMiddleware();

        Schema::enableForeignKeyConstraints();
    }

    private function makeBatch(string $storeId, int $quantity): string
    {
        $productId = (string) Str::uuid();
        DB::table('products')->insert([
            'id' => $productId,
            'name' => 'Product ' . substr($productId, 0, 8),
            'store_id' => $storeId,
            'selling_price' => 500,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $batchId = (string) Str::uuid();
        DB::table('stock_batches')->insert([
            'id' => $batchId,
            'product_id' => $productId,
            'store_id' => $storeId,
            'batch_number' => 'B-' . substr($batchId, 0, 6),
            'quantity' => $quantity,
            'cost_price' => 100,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return $batchId;
    }

    private function reconcile(User $as, array $batches)
    {
        return $this->actingAs($as)
            ->postJson('/api/v1/app/sync/reconcile-quantities', ['batches' => $batches]);
    }

    #[Test]
    public function it_corrects_a_zeroed_batch_and_records_a_movement_and_activity_log(): void
    {
        $batchId = $this->makeBatch($this->store->id, 0);

        $response = $this->reconcile($this->owner, [['id' => $batchId, 'quantity' => 250]]);

        $response->assertStatus(200)
            ->assertJson(['success' => true, 'reconciled' => 1, 'checked' => 1]);

        $this->assertEquals(250, DB::table('stock_batches')->where('id', $batchId)->value('quantity'));

        $movements = DB::table('stock_movements')->where('stock_batch_id', $batchId)->get();
        $this->assertCount(1, $movements);
        $this->assertEquals('sync_reconciliation', $movements[0]->movement_type);
        $this->assertEquals(250, $movements[0]->quantity);
        $this->assertEquals('Automatic stock quantity reconciliation', $movements[0]->reason);
        $this->assertEquals($this->store->id, $movements[0]->store_id);

        $logs = ActivityLog::where('action', 'STOCK_QUANTITY_AUTO_RECONCILED')->get();
        $this->assertCount(1, $logs);
        $this->assertEquals($this->store->id, $logs[0]->store_id);
        $this->assertEquals(1, $logs[0]->properties['batches_reconciled']);
        $this->assertEquals(250, $logs[0]->properties['total_quantity_delta']);
    }

    #[Test]
    public function a_downward_correction_records_a_negative_signed_delta(): void
    {
        $batchId = $this->makeBatch($this->store->id, 80);

        $this->reconcile($this->owner, [['id' => $batchId, 'quantity' => 30]])->assertStatus(200);

        $this->assertEquals(30, DB::table('stock_batches')->where('id', $batchId)->value('quantity'));
        $this->assertEquals(-50, DB::table('stock_movements')->where('stock_batch_id', $batchId)->value('quantity'));
    }

    #[Test]
    public function running_it_twice_with_the_same_payload_is_a_no_op_the_second_time(): void
    {
        $batchId = $this->makeBatch($this->store->id, 0);
        $payload = [['id' => $batchId, 'quantity' => 120]];

        $this->reconcile($this->owner, $payload)->assertStatus(200)->assertJson(['reconciled' => 1]);

        $second = $this->reconcile($this->owner, $payload);

        $second->assertStatus(200)->assertJson(['reconciled' => 0, 'checked' => 1]);
        $this->assertEquals(1, DB::table('stock_movements')->where('stock_batch_id', $batchId)->count());
        $this->assertEquals(1, ActivityLog::where('action', 'STOCK_QUANTITY_AUTO_RECONCILED')->count());
    }

    #[Test]
    public function a_batch_outside_the_callers_tenant_scope_is_silently_skipped(): void
    {
        $foreignBatchId = $this->makeBatch($this->outsiderStore->id, 5);

        $response = $this->reconcile($this->owner, [['id' => $foreignBatchId, 'quantity' => 999]]);

        $response->assertStatus(200)->assertJson(['reconciled' => 0, 'checked' => 0]);
        $this->assertEquals(5, DB::table('stock_batches')->where('id', $foreignBatchId)->value('quantity'));
        $this->assertEquals(0, DB::table('stock_movements')->where('stock_batch_id', $foreignBatchId)->count());
        $this->assertEquals(0, ActivityLog::where('action', 'STOCK_QUANTITY_AUTO_RECONCILED')->count());
    }

    #[Test]
    public function a_nonexistent_batch_id_is_ignored_without_erroring(): void
    {
        $realBatchId = $this->makeBatch($this->store->id, 0);

        $response = $this->reconcile($this->owner, [
            ['id' => (string) Str::uuid(), 'quantity' => 42],
            ['id' => $realBatchId, 'quantity' => 7],
        ]);

        $response->assertStatus(200)->assertJson(['reconciled' => 1, 'checked' => 1]);
        $this->assertEquals(7, DB::table('stock_batches')->where('id', $realBatchId)->value('quantity'));
    }

    #[Test]
    public function a_staff_account_can_reconcile_their_own_stores_batches(): void
    {
        $batchId = $this->makeBatch($this->store->id, 0);

        $this->reconcile($this->staff, [['id' => $batchId, 'quantity' => 64]])
            ->assertStatus(200)
            ->assertJson(['reconciled' => 1, 'checked' => 1]);

        $this->assertEquals(64, DB::table('stock_batches')->where('id', $batchId)->value('quantity'));
    }

    #[Test]
    public function each_touched_store_gets_its_own_activity_log_row(): void
    {
        $secondStore = Store::create([
            'user_id' => $this->owner->id,
            'name' => 'Branch Store',
            'store_slug' => 'branch-store',
            'device_id' => 'WEB-BRANCH',
        ]);

        $batchA = $this->makeBatch($this->store->id, 0);
        $batchB = $this->makeBatch($secondStore->id, 0);

        $this->reconcile($this->owner, [
            ['id' => $batchA, 'quantity' => 10],
            ['id' => $batchB, 'quantity' => 20],
        ])->assertStatus(200)->assertJson(['reconciled' => 2, 'checked' => 2]);

        $logs = ActivityLog::where('action', 'STOCK_QUANTITY_AUTO_RECONCILED')->get();
        $this->assertCount(2, $logs);
        $this->assertEqualsCanonicalizing(
            [$this->store->id, $secondStore->id],
            $logs->pluck('store_id')->all(),
        );
    }

    #[Test]
    public function the_response_includes_the_created_movement_so_the_reporting_device_can_apply_it_locally(): void
    {
        $batchId = $this->makeBatch($this->store->id, 0);

        $response = $this->reconcile($this->owner, [['id' => $batchId, 'quantity' => 40]]);

        $response->assertStatus(200);
        $movements = $response->json('movements');
        $this->assertCount(1, $movements);
        $this->assertSame($batchId, $movements[0]['stock_batch_id']);
        $this->assertSame('sync_reconciliation', $movements[0]['movement_type']);
        $this->assertSame(40, $movements[0]['quantity']);
        $this->assertSame(
            DB::table('stock_movements')->where('stock_batch_id', $batchId)->value('id'),
            $movements[0]['id'],
        );
    }

    #[Test]
    public function a_concurrent_push_moving_the_batchs_quantity_is_not_clobbered(): void
    {
        // writeQuantityReconciliation() is given a $currentQuantity read
        // earlier in the request; a real race (another device's push()
        // landing between that read and this write) can't be interleaved
        // inside one synchronous test request, so this calls the private
        // method directly with a $currentQuantity that no longer matches
        // the row - exactly what a genuine race would look like from the
        // method's own point of view.
        $batchId = $this->makeBatch($this->store->id, 8);
        $batch = \App\Models\StockBatch::find($batchId);

        $method = new \ReflectionMethod(SyncController::class, 'writeQuantityReconciliation');
        $method->setAccessible(true);
        $result = $method->invoke(
            app(SyncController::class),
            $batch,
            $this->store->id,
            10, // stale: the row actually holds 8, not 10
            50,
            $this->owner,
        );

        $this->assertNull($result);
        $this->assertEquals(8, DB::table('stock_batches')->where('id', $batchId)->value('quantity'));
        $this->assertEquals(0, DB::table('stock_movements')->where('stock_batch_id', $batchId)->count());
    }

    #[Test]
    public function the_batch_and_product_lookups_do_not_scale_with_the_number_of_batches(): void
    {
        $batchIds = [];
        for ($i = 0; $i < 20; $i++) {
            $batchIds[] = $this->makeBatch($this->store->id, $i);
        }

        $payload = array_map(fn ($id, $i) => ['id' => $id, 'quantity' => $i + 100], $batchIds, array_keys($batchIds));

        DB::enableQueryLog();
        $this->reconcile($this->owner, $payload)->assertStatus(200)->assertJson(['reconciled' => 20, 'checked' => 20]);
        $queries = DB::getQueryLog();
        DB::disableQueryLog();

        $lookupQueries = array_filter(
            $queries,
            fn ($q) => str_contains($q['query'], 'select * from "stock_batches"')
                || str_contains($q['query'], 'select "store_id", "id" from "products"'),
        );

        $this->assertCount(
            2,
            $lookupQueries,
            'Expected exactly one batched stock_batches lookup and one batched products lookup, regardless of batch count.',
        );
    }

    #[Test]
    public function the_payload_is_validated(): void
    {
        $this->actingAs($this->owner)
            ->postJson('/api/v1/app/sync/reconcile-quantities', [])
            ->assertStatus(422);

        $this->actingAs($this->owner)
            ->postJson('/api/v1/app/sync/reconcile-quantities', [
                'batches' => [['id' => (string) Str::uuid(), 'quantity' => -3]],
            ])
            ->assertStatus(422);
    }
}
