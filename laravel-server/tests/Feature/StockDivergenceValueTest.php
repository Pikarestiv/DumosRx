<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use App\Services\Admin\StockDivergenceService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * The stock-agreement panel reported units and batches but no money, so an
 * owner could not tell whether a divergence was worth acting on. Value is
 * reported alongside, over the same rows, and is deliberately NOT part of the
 * `diverged` verdict - see docs/KNOWN_BUGS.md A-246.
 */
class StockDivergenceValueTest extends TestCase
{
    use RefreshDatabase;

    private Store $store;

    protected function setUp(): void
    {
        parent::setUp();

        $owner = User::create([
            'first_name' => 'Owner', 'last_name' => 'User',
            'email' => 'owner@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $this->store = Store::create([
            'user_id' => $owner->id,
            'name' => 'Main Store',
            'store_slug' => 'main-store',
            'device_id' => 'WEB-MAIN',
        ]);
    }

    private function batch(float $quantity, ?float $costPrice): void
    {
        $productId = (string) Str::uuid();
        DB::table('products')->insert([
            'id' => $productId,
            'name' => 'Product '.substr($productId, 0, 8),
            'store_id' => $this->store->id,
            'selling_price' => 500,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('stock_batches')->insert([
            'id' => (string) Str::uuid(),
            'product_id' => $productId,
            'store_id' => $this->store->id,
            'batch_number' => 'B-'.substr($productId, 0, 6),
            'quantity' => $quantity,
            'cost_price' => $costPrice,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function test_it_values_server_stock_at_cost_over_the_rows_it_counts(): void
    {
        $this->batch(10, 2.5);
        $this->batch(4, 100);

        $report = app(StockDivergenceService::class)->record(
            $this->store->id,
            'DRX-TEST1',
            null,
            ['batch_count' => 2, 'quantity_sum' => 14, 'value_sum' => 425],
        );

        $this->assertSame(425.0, (float) $report->device_value_sum);
        $this->assertSame(425.0, (float) $report->server_value_sum);

        $row = app(StockDivergenceService::class)->forStore($this->store->id)['devices'][0];
        $this->assertSame(425.0, $row['device_value_sum']);
        $this->assertSame(425.0, $row['server_value_sum']);
        $this->assertSame(0.0, $row['value_delta']);
    }

    public function test_it_reports_the_value_gap_when_a_device_disagrees(): void
    {
        $this->batch(10, 5);

        app(StockDivergenceService::class)->record(
            $this->store->id,
            'DRX-TEST2',
            null,
            ['batch_count' => 1, 'quantity_sum' => 12, 'value_sum' => 60],
        );

        $row = app(StockDivergenceService::class)->forStore($this->store->id)['devices'][0];
        $this->assertSame(10.0, $row['value_delta']);
        $this->assertTrue($row['diverged']);
    }

    /**
     * Backward compatibility (.agents/AGENTS.md §11): a client shipped before
     * this change sends only batch_count and quantity_sum. Its value must read
     * as "not reported" rather than as zero, or the panel shows every old
     * device holding nothing.
     */
    public function test_a_client_that_sends_no_value_reports_null_not_zero(): void
    {
        $this->batch(10, 5);

        app(StockDivergenceService::class)->record(
            $this->store->id,
            'DRX-LEGACY',
            null,
            ['batch_count' => 1, 'quantity_sum' => 10],
        );

        $row = app(StockDivergenceService::class)->forStore($this->store->id)['devices'][0];
        $this->assertNull($row['device_value_sum']);
        $this->assertNull($row['value_delta']);
        $this->assertSame(50.0, $row['server_value_sum']);
        $this->assertFalse($row['diverged']);
    }

    /**
     * Value must never change the verdict: cost_price can legitimately differ
     * between a device and the server without the stock itself disagreeing.
     */
    public function test_a_value_only_gap_is_not_a_divergence(): void
    {
        $this->batch(10, 5);

        app(StockDivergenceService::class)->record(
            $this->store->id,
            'DRX-TEST3',
            null,
            ['batch_count' => 1, 'quantity_sum' => 10, 'value_sum' => 999],
        );

        $row = app(StockDivergenceService::class)->forStore($this->store->id)['devices'][0];
        $this->assertFalse($row['diverged']);
        $this->assertSame(949.0, $row['value_delta']);
    }
}
