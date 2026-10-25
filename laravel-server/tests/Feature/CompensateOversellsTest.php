<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

/** A-265 stage 3. Rules: laravel-server/AGENTS.md, "Oversell compensation backfill". */
class CompensateOversellsTest extends TestCase
{
    use RefreshDatabase;

    private User $cashier;

    private Store $store;

    private Store $otherStore;

    protected function setUp(): void
    {
        parent::setUp();

        $owner = User::create([
            'first_name' => 'Owner', 'last_name' => 'Nest', 'email' => 'owner-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'), 'role' => 'store_owner',
        ]);
        $this->cashier = $owner;
        $this->store = $this->makeStore($owner, 'Nest Pharmacy');
        $this->otherStore = $this->makeStore($owner, 'Agidi');
    }

    private function makeStore(User $owner, string $name): Store
    {
        return Store::create([
            'user_id' => $owner->id, 'name' => $name, 'store_slug' => Str::slug($name).'-'.uniqid(),
            'device_id' => 'WEB-'.strtoupper(Str::slug($name)),
        ]);
    }

    /** A batch with the given stored quantity and movement log; returns its id. */
    private function batch(Store $store, int $stored, array $log): string
    {
        $productId = (string) Str::uuid();
        $batchId = (string) Str::uuid();
        DB::table('products')->insert([
            'id' => $productId, 'user_id' => $this->cashier->id, 'store_id' => $store->id, 'name' => 'Gluformin '.substr($productId, 0, 4),
            'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('stock_batches')->insert([
            'id' => $batchId, 'product_id' => $productId, 'store_id' => $store->id, 'batch_number' => 'Opening Stock',
            'quantity' => $stored, 'cost_price' => 50, 'created_at' => now(), 'updated_at' => now(),
        ]);
        foreach ($log as $i => $quantity) {
            DB::table('stock_movements')->insert([
                'id' => (string) Str::uuid(), 'product_id' => $productId, 'stock_batch_id' => $batchId, 'store_id' => $store->id,
                'movement_type' => $quantity > 0 ? 'purchase' : 'sale', 'quantity' => $quantity, 'performed_by' => $this->cashier->id,
                'movement_date' => now()->subMinutes(10 - $i), 'created_at' => now(), 'updated_at' => now(),
            ]);
        }

        return $batchId;
    }

    private function compensations(string $batchId)
    {
        return DB::table('stock_movements')->where('stock_batch_id', $batchId)->where('reference_type', 'oversell')->get();
    }

    private function logSum(string $batchId): int
    {
        return (int) DB::table('stock_movements')->where('stock_batch_id', $batchId)->sum('quantity');
    }

    public function test_a_dry_run_lists_the_deficit_and_writes_nothing(): void
    {
        $batch = $this->batch($this->store, 0, [4, -6]);

        $this->artisan('stock:compensate-oversells')->expectsOutputToContain($batch)->assertSuccessful();

        $this->assertCount(0, $this->compensations($batch));
    }

    public function test_write_brings_each_deficit_to_zero_and_leaves_the_stored_quantity_alone(): void
    {
        $batch = $this->batch($this->store, 0, [4, -6]);
        $healthy = $this->batch($this->store, 3, [4, -1]);

        $this->artisan('stock:compensate-oversells', ['--write' => true, '--run' => 'r1'])->assertSuccessful();

        $rows = $this->compensations($batch);
        $this->assertCount(1, $rows);
        $this->assertSame('adjustment', $rows[0]->movement_type);
        $this->assertSame(2, (int) $rows[0]->quantity);
        $this->assertSame($this->store->id, $rows[0]->store_id);
        $this->assertSame($this->cashier->id, $rows[0]->performed_by);
        $this->assertSame(0, $this->logSum($batch));
        $this->assertSame(0, (int) DB::table('stock_batches')->where('id', $batch)->value('quantity'));
        $this->assertCount(0, $this->compensations($healthy));
    }

    public function test_a_second_run_finds_nothing(): void
    {
        $batch = $this->batch($this->store, 0, [4, -6]);

        $this->artisan('stock:compensate-oversells', ['--write' => true, '--run' => 'r1'])->assertSuccessful();
        $this->artisan('stock:compensate-oversells', ['--write' => true, '--run' => 'r2'])
            ->expectsOutputToContain('No batch has a movement log that sums below zero')
            ->assertSuccessful();

        $this->assertCount(1, $this->compensations($batch));
    }

    public function test_a_legacy_batch_whose_stock_was_never_logged_is_not_a_deficit(): void
    {
        $legacy = $this->batch($this->store, 95, [-5]);

        $this->artisan('stock:compensate-oversells', ['--write' => true, '--run' => 'r1'])->assertSuccessful();

        $this->assertCount(0, $this->compensations($legacy));
    }

    public function test_store_limits_the_run_to_one_store(): void
    {
        $here = $this->batch($this->store, 0, [4, -6]);
        $there = $this->batch($this->otherStore, 0, [1, -3]);

        $this->artisan('stock:compensate-oversells', ['--write' => true, '--run' => 'r1', '--store' => $this->store->id])->assertSuccessful();

        $this->assertCount(1, $this->compensations($here));
        $this->assertCount(0, $this->compensations($there));
    }

    public function test_revert_reverses_exactly_that_runs_rows_once(): void
    {
        $batch = $this->batch($this->store, 0, [4, -6]);
        $this->artisan('stock:compensate-oversells', ['--write' => true, '--run' => 'r1'])->assertSuccessful();

        $this->artisan('stock:compensate-oversells', ['--revert' => 'r1'])->assertSuccessful();
        $this->artisan('stock:compensate-oversells', ['--revert' => 'r1'])->assertSuccessful();

        $this->assertCount(2, $this->compensations($batch));
        $this->assertSame(-2, $this->logSum($batch));
        $this->assertSame(0, (int) DB::table('stock_batches')->where('id', $batch)->value('quantity'));
    }

    public function test_a_used_run_label_is_refused(): void
    {
        $this->batch($this->store, 0, [4, -6]);
        $this->artisan('stock:compensate-oversells', ['--write' => true, '--run' => 'r1'])->assertSuccessful();
        $this->batch($this->store, 0, [1, -2]);

        $this->artisan('stock:compensate-oversells', ['--write' => true, '--run' => 'r1'])->assertFailed();
    }

    public function test_it_refuses_while_health_sync_is_enabled(): void
    {
        config(['dumos.health_sync_enabled' => true]);
        $batch = $this->batch($this->store, 0, [4, -6]);

        $this->artisan('stock:compensate-oversells', ['--write' => true, '--run' => 'r1'])->assertFailed();

        $this->assertCount(0, $this->compensations($batch));
    }
}
