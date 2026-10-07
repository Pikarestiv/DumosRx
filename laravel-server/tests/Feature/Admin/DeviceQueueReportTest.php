<?php

namespace Tests\Feature\Admin;

use App\Models\DeviceQueueReport;
use App\Models\Store;
use App\Models\User;
use App\Services\Admin\DeviceQueueReportService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Phase 3 of the stuck-data work. `_sync_queue` is client-only, so the server
 * has never seen a stuck row and "what is stuck" could only be inferred from
 * refusals it happened to witness. Devices now report their own queue state.
 *
 * Metadata only — table, record id, attempts, canonicalised reason. No
 * payloads: the raw `last_error` embeds the failing SQL and its bindings
 * (customer names, amounts), which is exactly what SyncFailureRecorder
 * already refuses to store.
 */
class DeviceQueueReportTest extends TestCase
{
    use RefreshDatabase;

    private Store $store;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();

        $this->owner = User::create([
            'first_name' => 'Owner', 'last_name' => 'Test',
            'email' => 'owner-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'), 'role' => 'store_owner',
        ]);

        $this->store = Store::create([
            'user_id' => $this->owner->id,
            'name' => 'Queue Store',
            'device_id' => 'DESKTOP-ONE',
            'currency' => 'NGN',
        ]);
    }

    private function service(): DeviceQueueReportService
    {
        return app(DeviceQueueReportService::class);
    }

    public function test_it_stores_what_a_device_reports(): void
    {
        $this->service()->record($this->store->id, 'DESKTOP-ONE', $this->owner->id, [
            'queue_depth' => 7,
            'stuck' => [
                ['table_name' => 'sales', 'record_id' => 'r1', 'attempts' => 6, 'reason' => 'forbidden'],
            ],
        ]);

        $row = DeviceQueueReport::first();

        $this->assertSame(7, $row->queue_depth);
        $this->assertSame(1, $row->stuck_count);
        $this->assertSame('sales', $row->stuck_items[0]['table_name']);
        $this->assertSame(6, $row->stuck_items[0]['attempts']);
    }

    /**
     * The raw last_error embeds the failing SQL and its bindings. Only the
     * canonical slug is stored, exactly as SyncFailureRecorder does.
     */
    public function test_a_raw_driver_error_is_canonicalised_before_storage(): void
    {
        $this->service()->record($this->store->id, 'DESKTOP-ONE', $this->owner->id, [
            'queue_depth' => 1,
            'stuck' => [[
                'table_name' => 'sales',
                'record_id' => 'r1',
                'attempts' => 5,
                'reason' => "SQLSTATE[22001]: String data: INSERT INTO sales (customer_name) VALUES ('Ada Okonkwo')",
            ]],
        ]);

        $stored = DeviceQueueReport::first()->stuck_items[0]['reason'];

        $this->assertSame('server_error', $stored);
        $this->assertStringNotContainsString('Ada Okonkwo', json_encode(DeviceQueueReport::first()->stuck_items));
    }

    public function test_a_known_reason_survives_canonicalisation(): void
    {
        $this->service()->record($this->store->id, 'DESKTOP-ONE', $this->owner->id, [
            'queue_depth' => 1,
            'stuck' => [['table_name' => 'sales', 'record_id' => 'r1', 'attempts' => 5, 'reason' => 'sync_disabled']],
        ]);

        $this->assertSame('sync_disabled', DeviceQueueReport::first()->stuck_items[0]['reason']);
    }

    /** A sync request must not grow with a device's backlog. */
    public function test_the_stored_stuck_list_is_capped(): void
    {
        $stuck = [];
        for ($i = 0; $i < 120; $i++) {
            $stuck[] = ['table_name' => 'sales', 'record_id' => "r{$i}", 'attempts' => 5, 'reason' => 'forbidden'];
        }

        $this->service()->record($this->store->id, 'DESKTOP-ONE', $this->owner->id, [
            'queue_depth' => 500,
            'stuck' => $stuck,
        ]);

        $row = DeviceQueueReport::first();

        $this->assertLessThanOrEqual(50, count($row->stuck_items));
        // The true count is still reported, so a cap cannot understate the problem.
        $this->assertSame(120, $row->stuck_count);
    }

    public function test_a_later_report_replaces_the_earlier_one_for_that_device(): void
    {
        $this->service()->record($this->store->id, 'DESKTOP-ONE', $this->owner->id, ['queue_depth' => 9, 'stuck' => []]);
        $this->service()->record($this->store->id, 'DESKTOP-ONE', $this->owner->id, ['queue_depth' => 2, 'stuck' => []]);

        $this->assertSame(1, DeviceQueueReport::count());
        $this->assertSame(2, DeviceQueueReport::first()->queue_depth);
    }

    public function test_each_device_is_tracked_separately(): void
    {
        $this->service()->record($this->store->id, 'DESKTOP-ONE', $this->owner->id, ['queue_depth' => 0, 'stuck' => []]);
        $this->service()->record($this->store->id, 'LAPTOP-TWO', $this->owner->id, [
            'queue_depth' => 4,
            'stuck' => [['table_name' => 'stock_movements', 'record_id' => 'r9', 'attempts' => 5, 'reason' => 'forbidden']],
        ]);

        $report = $this->service()->forStore($this->store->id);

        $this->assertTrue($report['measured']);
        $this->assertSame(1, $report['devices_with_stuck_items']);
        $this->assertCount(2, $report['devices']);
    }

    /** Phase 1's rule: never claim health for something nobody measured. */
    public function test_a_store_with_no_reports_is_not_claimed_to_be_clear(): void
    {
        $report = $this->service()->forStore($this->store->id);

        $this->assertFalse($report['measured']);
        $this->assertSame([], $report['devices']);
    }
}
