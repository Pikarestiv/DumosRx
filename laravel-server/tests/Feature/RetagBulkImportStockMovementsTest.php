<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\Store;
use App\Models\StockBatch;
use App\Models\StockMovement;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Rows written by product-import.ts before commit 3b7ce8b8 carry
 * reference_type "stock_audit" instead of "import", so the Adjustments
 * ledger's reference_type exclusion misses them (the client's reason-string
 * fallback also covers this, but the migration cleans the stored bytes).
 */
class RetagBulkImportStockMovementsTest extends TestCase
{
    use RefreshDatabase;

    protected User $owner;
    protected Store $store;
    protected Product $product;
    protected StockBatch $batch;

    protected function setUp(): void
    {
        parent::setUp();

        $this->owner = User::create([
            'first_name' => 'Owner', 'last_name' => 'A',
            'email' => 'owner@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $this->store = Store::create([
            'user_id' => $this->owner->id,
            'name' => 'Store A',
            'store_slug' => 'store-a',
            'device_id' => 'WEB-A',
        ]);

        $this->product = Product::create([
            'name' => 'Panadol', 'selling_price' => 100,
            'user_id' => $this->owner->id, 'is_active' => true,
        ]);

        $this->batch = StockBatch::create([
            'product_id' => $this->product->id, 'user_id' => $this->owner->id,
            'batch_number' => 'B-1', 'quantity' => 5, 'cost_price' => 40,
        ]);
    }

    #[Test]
    public function retags_a_legacy_bulk_import_row_and_bumps_updated_at()
    {
        $movement = StockMovement::create([
            'product_id' => $this->product->id,
            'stock_batch_id' => $this->batch->id,
            'movement_type' => 'adjustment',
            'quantity' => 5,
            'reason' => 'Bulk import stock update',
            'reference_type' => 'stock_audit',
            'performed_by' => $this->owner->id,
        ]);
        $originalUpdatedAt = $movement->updated_at;

        $this->travel(1)->minutes();
        $this->runMigration();

        $movement->refresh();
        $this->assertSame('import', $movement->reference_type);
        $this->assertTrue($movement->updated_at->gt($originalUpdatedAt));
    }

    #[Test]
    public function retags_a_legacy_row_whose_reason_carries_a_trailing_note()
    {
        $movement = StockMovement::create([
            'product_id' => $this->product->id,
            'stock_batch_id' => $this->batch->id,
            'movement_type' => 'adjustment',
            'quantity' => 5,
            'reason' => 'Bulk import stock update — restock CSV',
            'reference_type' => 'stock_audit',
            'performed_by' => $this->owner->id,
        ]);

        $this->runMigration();

        $this->assertSame('import', $movement->refresh()->reference_type);
    }

    #[Test]
    public function leaves_a_genuine_cycle_count_untouched()
    {
        $movement = StockMovement::create([
            'product_id' => $this->product->id,
            'stock_batch_id' => $this->batch->id,
            'movement_type' => 'adjustment',
            'quantity' => -2,
            'reason' => 'Cycle count adjustment',
            'reference_type' => 'stock_audit',
            'performed_by' => $this->owner->id,
        ]);

        $this->runMigration();

        $this->assertSame('stock_audit', $movement->refresh()->reference_type);
    }

    #[Test]
    public function leaves_a_sale_or_purchase_movement_untouched()
    {
        $movement = StockMovement::create([
            'product_id' => $this->product->id,
            'stock_batch_id' => $this->batch->id,
            'movement_type' => 'purchase',
            'quantity' => 10,
            'reason' => 'Bulk import - opening stock',
            'reference_type' => 'import',
            'performed_by' => $this->owner->id,
        ]);

        $this->runMigration();

        $this->assertSame('import', $movement->refresh()->reference_type);
    }

    private function runMigration(): void
    {
        (require base_path('database/migrations/2026_09_29_000003_retag_bulk_import_stock_movements.php'))->up();
    }
}
