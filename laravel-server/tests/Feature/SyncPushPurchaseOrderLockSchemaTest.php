<?php

namespace Tests\Feature;

use App\Services\Sync\PurchaseOrderLockFence;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\Feature\Concerns\PurchaseOrderLockFixture;
use Tests\TestCase;

/** The draft lock against a server whose migration has not run yet, and against a till whose clock runs ahead. */
class SyncPushPurchaseOrderLockSchemaTest extends TestCase
{
    use PurchaseOrderLockFixture;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PurchaseOrderLockFence::forgetSchema();
        $this->setUpLockFixture();
    }

    protected function tearDown(): void
    {
        PurchaseOrderLockFence::forgetSchema();
        parent::tearDown();
    }

    private function dropLockColumns(): void
    {
        Schema::table('purchase_orders', function ($table) {
            $table->dropColumn(PurchaseOrderLockFence::LOCK_COLUMNS);
        });
        PurchaseOrderLockFence::forgetSchema();
    }

    private function headerEdit(array $fields): array
    {
        return [[
            'id' => 1,
            'table_name' => 'purchase_orders',
            'operation' => 'UPDATE',
            'record_id' => 'po-1',
            'payload' => array_merge(['id' => 'po-1', '_version' => 1], $fields),
        ]];
    }

    public function test_line_edits_still_apply_on_a_server_deployed_before_its_lock_migration()
    {
        $this->dropLockColumns();

        $response = $this->pushFrom('DRX-OTHER', $this->lineEdit(7))->assertStatus(200);

        $this->assertSame([], $this->failedReasons($response));
        $this->assertEquals(70, DB::table('purchase_order_items')->where('id', 'poi-1')->value('quantity_ordered'));
    }

    public function test_a_new_tills_order_save_applies_without_its_lock_columns_on_a_server_missing_them()
    {
        $this->dropLockColumns();

        $response = $this->pushFrom('DRX-NEW', $this->headerEdit([
            'notes' => 'Call before delivery',
            'editing_device_id' => 'DRX-NEW',
            'editing_device_label' => 'Chrome on Android',
            'editing_user_id' => $this->owner->id,
            'editing_at' => now()->toISOString(),
        ]))->assertStatus(200);

        $this->assertSame([], $this->failedReasons($response));
        $this->assertSame('Call before delivery', DB::table('purchase_orders')->where('id', 'po-1')->value('notes'));
    }

    public function test_a_lock_stamped_by_a_till_whose_clock_runs_hours_ahead_still_goes_stale_after_ten_minutes()
    {
        $this->pushFrom('DRX-FAST', $this->headerEdit([
            'editing_device_id' => 'DRX-FAST',
            'editing_user_id' => $this->owner->id,
            'editing_at' => now()->addHours(5)->toISOString(),
            'updated_at' => now()->addHours(5)->toISOString(),
        ]))->assertStatus(200);

        $stored = DB::table('purchase_orders')->where('id', 'po-1')->value('editing_at');
        $this->assertFalse(\Carbon\Carbon::parse($stored)->isFuture());
        $this->assertSame(['draft_locked'], $this->failedReasons($this->pushFrom('DRX-OTHER', $this->lineEdit(7))));

        $this->travel(11)->minutes();

        $this->assertSame([], $this->failedReasons($this->pushFrom('DRX-OTHER', $this->lineEdit(8))));
        $this->assertEquals(80, DB::table('purchase_order_items')->where('id', 'poi-1')->value('quantity_ordered'));
    }
}
