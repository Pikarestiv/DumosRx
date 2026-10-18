<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\SyncHealthDaily;
use App\Models\User;
use App\Services\Admin\AdminSyncHealthService;
use App\Services\Admin\DeviceQueueReportService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Delivery was only ever counted per HTTP attempt. See
 * docs/DEVICE_TABLE_AGREEMENT.md, "Delivery timing".
 */
class SyncDeliveryTimingTest extends TestCase
{
    use RefreshDatabase;

    private Store $store;

    private DeviceQueueReportService $service;

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

        $this->service = app(DeviceQueueReportService::class);
    }

    private function record(array $report, string $deviceId = 'DRX-TILL-1'): void
    {
        $this->service->record($this->store->id, $deviceId, null, $report);
    }

    public function test_the_oldest_unsynced_edits_age_is_stored_and_surfaced(): void
    {
        $this->record([
            'queue_depth' => 4,
            'oldest_queued_seconds' => 7200,
            'delivered_ages' => ['under_1m' => 3, 'under_1h' => 1],
        ]);

        $device = $this->service->forStore($this->store->id)['devices'][0];

        $this->assertSame(7200, $device['oldest_queued_seconds']);
        $this->assertSame(3, $device['delivered_ages']['under_1m']);
        $this->assertSame(1, $device['delivered_ages']['under_1h']);
        $this->assertSame(0, $device['delivered_ages']['over_1d']);
    }

    public function test_an_old_bundle_reporting_neither_reads_as_not_reported(): void
    {
        $this->record(['queue_depth' => 2, 'stuck' => []]);

        $device = $this->service->forStore($this->store->id)['devices'][0];

        $this->assertNull($device['oldest_queued_seconds']);
        $this->assertNull($device['delivered_ages']);
        $this->assertSame(2, $device['queue_depth']);
    }

    public function test_the_daily_tally_records_the_deepest_backlog_seen(): void
    {
        $this->record(['queue_depth' => 3]);
        $this->record(['queue_depth' => 11], 'DRX-TILL-2');
        $this->record(['queue_depth' => 5], 'DRX-TILL-3');

        $row = SyncHealthDaily::where('store_id', $this->store->id)->first();

        $this->assertSame(11, $row->changes_queued_peak);
    }

    public function test_the_peak_rides_on_the_existing_daily_series(): void
    {
        $this->record(['queue_depth' => 6]);

        $daily = app(AdminSyncHealthService::class)->storeHealth($this->store->id)['daily'];

        $this->assertSame(6, $daily[0]['queued_peak']);
    }

    public function test_a_report_with_no_queue_depth_does_not_create_a_tally_row(): void
    {
        $this->record(['stuck' => []]);

        $this->assertSame(0, SyncHealthDaily::where('store_id', $this->store->id)->count());
    }
}
