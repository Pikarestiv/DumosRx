<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use App\Services\Sync\HealthSyncReconciliationRepairService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * A-214: one Health Sync run wrote 146 'sync_reconciliation' movements that
 * zeroed live stock. See laravel-server/AGENTS.md for the arithmetic this
 * repair uses and why it reverses rather than restores a snapshot.
 */
class HealthSyncReconciliationRepairTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private Store $storeA;

    private Store $storeB;

    protected function setUp(): void
    {
        parent::setUp();

        $this->owner = User::create([
            'first_name' => 'Owner', 'last_name' => 'User',
            'email' => 'owner@dumosrx.test', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $this->storeA = Store::create([
            'user_id' => $this->owner->id, 'name' => 'Store A',
            'store_slug' => 'store-a', 'device_id' => 'WEB-A',
        ]);
        $this->storeB = Store::create([
            'user_id' => $this->owner->id, 'name' => 'Store B',
            'store_slug' => 'store-b', 'device_id' => 'WEB-B',
        ]);
    }

    private function batch(Store $store, string $productName, int $quantity): string
    {
        $productId = (string) Str::uuid();
        DB::table('products')->insert([
            'id' => $productId,
            'name' => $productName,
            'store_id' => $store->id,
            'selling_price' => 500,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $batchId = (string) Str::uuid();
        DB::table('stock_batches')->insert([
            'id' => $batchId,
            'product_id' => $productId,
            'store_id' => $store->id,
            'batch_number' => 'B-'.substr($batchId, 0, 6),
            'quantity' => $quantity,
            'cost_price' => 100,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return $batchId;
    }

    private function movement(string $batchId, string $type, int $quantity, string $date): string
    {
        $row = DB::table('stock_batches')->where('id', $batchId)->first();
        $id = (string) Str::uuid();

        DB::table('stock_movements')->insert([
            'id' => $id,
            'stock_batch_id' => $batchId,
            'product_id' => $row->product_id,
            'store_id' => $row->store_id,
            'movement_type' => $type,
            'quantity' => $quantity,
            'reason' => $type === 'sync_reconciliation' ? 'Automatic stock quantity reconciliation' : 'test',
            'performed_by' => $this->owner->id,
            'movement_date' => $date,
            'created_at' => $date,
            'updated_at' => $date,
        ]);

        return $id;
    }

    private const INCIDENT_AT = '2026-10-10 08:53:29';

    private function service(): HealthSyncReconciliationRepairService
    {
        return app(HealthSyncReconciliationRepairService::class);
    }

    private function quantity(string $batchId): int
    {
        return (int) DB::table('stock_batches')->where('id', $batchId)->value('quantity');
    }

    #[Test]
    public function it_restores_a_batch_whose_only_damage_is_the_bad_reconciliation(): void
    {
        $batchId = $this->batch($this->storeA, 'VITAMIN C WHITE COUNTING', 0);
        $this->movement($batchId, 'purchase', 1626, '2026-09-01 10:00:00');
        $badId = $this->movement($batchId, 'sync_reconciliation', -1626, self::INCIDENT_AT);

        $result = $this->service()->apply(null);

        $this->assertSame(1, $result['batches']);
        $this->assertSame(1, $result['movements_reversed']);
        $this->assertSame(1626, $result['units_restored']);
        $this->assertSame(1626, $this->quantity($batchId));

        $reversal = DB::table('stock_movements')
            ->where('movement_type', HealthSyncReconciliationRepairService::REVERSAL_MOVEMENT_TYPE)
            ->first();

        $this->assertSame(1626, (int) $reversal->quantity);
        $this->assertSame($badId, $reversal->reference_id);
        $this->assertSame($this->storeA->id, $reversal->store_id);
        $this->assertStringContainsString($badId, $reversal->reason);

        $this->assertNotNull(DB::table('stock_movements')->where('id', $badId)->first());
    }

    #[Test]
    public function it_keeps_movements_made_after_the_incident_and_still_lands_on_the_right_number(): void
    {
        $batchId = $this->batch($this->storeA, 'FESOLATE', 0);
        $this->movement($batchId, 'purchase', 100, '2026-09-01 10:00:00');
        $this->movement($batchId, 'sync_reconciliation', -100, self::INCIDENT_AT);
        $this->movement($batchId, 'sale', -30, '2026-10-10 11:15:00');
        $this->movement($batchId, 'purchase', 20, '2026-10-10 13:40:00');
        $this->movement($batchId, 'adjustment', -5, '2026-10-10 15:00:00');

        $this->service()->apply(null);

        $this->assertSame(85, $this->quantity($batchId));
        $this->assertSame(
            85,
            (int) DB::table('stock_movements')->where('stock_batch_id', $batchId)->sum('quantity'),
        );
    }

    #[Test]
    public function applying_twice_changes_nothing_the_second_time(): void
    {
        $batchId = $this->batch($this->storeA, 'FOLIC ACID COUNTING', 0);
        $this->movement($batchId, 'purchase', 1405, '2026-09-01 10:00:00');
        $this->movement($batchId, 'sync_reconciliation', -1405, self::INCIDENT_AT);

        $this->service()->apply(null);
        $second = $this->service()->apply(null);

        $this->assertSame(0, $second['batches']);
        $this->assertSame(0, $second['movements_reversed']);
        $this->assertSame(1405, $this->quantity($batchId));
        $this->assertSame(1, DB::table('stock_movements')
            ->where('movement_type', HealthSyncReconciliationRepairService::REVERSAL_MOVEMENT_TYPE)
            ->count());
    }

    #[Test]
    public function report_mode_writes_nothing(): void
    {
        $batchId = $this->batch($this->storeA, 'VITAMIN C', 0);
        $this->movement($batchId, 'purchase', 50, '2026-09-01 10:00:00');
        $this->movement($batchId, 'sync_reconciliation', -50, self::INCIDENT_AT);

        $this->artisan('sync:repair-health-sync-reconciliation')
            ->expectsOutputToContain('DRY RUN')
            ->assertSuccessful();

        $this->assertSame(0, $this->quantity($batchId));
        $this->assertSame(2, DB::table('stock_movements')->count());
    }

    #[Test]
    public function store_scoping_leaves_other_stores_untouched(): void
    {
        $batchA = $this->batch($this->storeA, 'A PRODUCT', 0);
        $this->movement($batchA, 'purchase', 40, '2026-09-01 10:00:00');
        $this->movement($batchA, 'sync_reconciliation', -40, self::INCIDENT_AT);

        $batchB = $this->batch($this->storeB, 'B PRODUCT', 0);
        $this->movement($batchB, 'purchase', 9, '2026-09-01 10:00:00');
        $this->movement($batchB, 'sync_reconciliation', -9, self::INCIDENT_AT);

        $result = $this->service()->apply($this->storeA->id);

        $this->assertSame(1, $result['batches']);
        $this->assertSame(40, $this->quantity($batchA));
        $this->assertSame(0, $this->quantity($batchB));
    }

    #[Test]
    public function a_batch_the_incident_never_touched_is_left_alone(): void
    {
        $batchId = $this->batch($this->storeA, 'UNAFFECTED', 70);
        $this->movement($batchId, 'purchase', 100, '2026-09-01 10:00:00');
        $this->movement($batchId, 'sale', -30, '2026-09-02 10:00:00');

        $result = $this->service()->apply(null);

        $this->assertSame(0, $result['batches']);
        $this->assertSame(70, $this->quantity($batchId));
        $this->assertSame(2, DB::table('stock_movements')->count());
    }

    #[Test]
    public function a_reconciliation_written_after_the_incident_window_is_not_reversed(): void
    {
        $batchId = $this->batch($this->storeA, 'LATER RECONCILED', 12);
        $this->movement($batchId, 'purchase', 12, '2026-09-01 10:00:00');
        $this->movement($batchId, 'sync_reconciliation', -12, '2026-11-01 09:00:00');

        $result = $this->service()->apply(null);

        $this->assertSame(0, $result['batches']);
        $this->assertSame(12, $this->quantity($batchId));
    }

    #[Test]
    public function a_log_sum_below_zero_is_stored_clamped_and_reported(): void
    {
        $batchId = $this->batch($this->storeA, 'OVERSOLD', 0);
        $this->movement($batchId, 'purchase', 10, '2026-09-01 10:00:00');
        $this->movement($batchId, 'sync_reconciliation', -10, self::INCIDENT_AT);
        $this->movement($batchId, 'sale', -14, '2026-10-10 12:00:00');

        $result = $this->service()->apply(null);

        $this->assertSame(1, $result['clamped']);
        $this->assertSame(0, $this->quantity($batchId));
    }

    #[Test]
    public function the_report_names_the_largest_corrections_per_store(): void
    {
        $small = $this->batch($this->storeA, 'SMALL ITEM', 0);
        $this->movement($small, 'purchase', 5, '2026-09-01 10:00:00');
        $this->movement($small, 'sync_reconciliation', -5, self::INCIDENT_AT);

        $big = $this->batch($this->storeA, 'VITAMIN C WHITE COUNTING', 0);
        $this->movement($big, 'purchase', 1626, '2026-09-01 10:00:00');
        $this->movement($big, 'sync_reconciliation', -1626, self::INCIDENT_AT);

        $result = $this->service()->preview(null);

        $this->assertSame(2, $result['batches']);
        $this->assertSame(1631, $result['units_restored']);
        $this->assertSame(1631, $result['per_store'][$this->storeA->id]['units']);
        $this->assertSame('VITAMIN C WHITE COUNTING', $result['largest'][0]['product']);
        $this->assertSame(1626, $result['largest'][0]['units']);
        $this->assertSame(0, $result['largest'][0]['from']);
        $this->assertSame(1626, $result['largest'][0]['to']);
        $this->assertSame(0, DB::table('stock_movements')
            ->where('movement_type', HealthSyncReconciliationRepairService::REVERSAL_MOVEMENT_TYPE)
            ->count());
    }
}
