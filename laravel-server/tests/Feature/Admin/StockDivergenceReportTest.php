<?php

namespace Tests\Feature\Admin;

use App\Models\DeviceStockReport;
use App\Models\Store;
use App\Models\User;
use App\Models\UserDevice;
use App\Services\Admin\StockDivergenceService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Phase 1 of the stuck-data work: which devices disagree with the server
 * about stock, and by how much, before anybody counts shelves.
 *
 * The server derives quantity from stock_movements and never trusts a pushed
 * one; the client never accepts a pulled one. Neither side had ever compared
 * them, so a divergence was invisible until a physical audit found it.
 */
class StockDivergenceReportTest extends TestCase
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
            'name' => 'Divergence Store',
            'device_id' => 'DESKTOP-ONE',
            'currency' => 'NGN',
        ]);
    }

    private function service(): StockDivergenceService
    {
        return app(StockDivergenceService::class);
    }

    private function seedServerStock(int $batches, float $each): void
    {
        $productId = (string) Str::uuid();
        DB::table('products')->insert([
            'id' => $productId, 'store_id' => $this->store->id, 'name' => 'P',
            'created_at' => now(), 'updated_at' => now(),
        ]);

        for ($i = 0; $i < $batches; $i++) {
            DB::table('stock_batches')->insert([
                'id' => (string) Str::uuid(), 'product_id' => $productId,
                'quantity' => $each, 'batch_number' => 'B'.$i,
                'created_at' => now(), 'updated_at' => now(),
            ]);
        }
    }

    public function test_it_records_both_sides_of_the_comparison(): void
    {
        $this->seedServerStock(3, 10);

        $this->service()->record($this->store->id, 'DESKTOP-ONE', $this->owner->id, [
            'batch_count' => 3,
            'quantity_sum' => 28,
        ]);

        $row = DeviceStockReport::first();

        // Compared as numbers: decimal formatting differs between SQLite
        // (tests) and MySQL (production), and the value is what matters.
        $this->assertSame(3, $row->device_batch_count);
        $this->assertSame(28.0, (float) $row->device_quantity_sum);
        $this->assertSame(3, $row->server_batch_count);
        $this->assertSame(30.0, (float) $row->server_quantity_sum);
    }

    public function test_a_device_reporting_the_same_numbers_shows_no_divergence(): void
    {
        $this->seedServerStock(2, 5);

        $this->service()->record($this->store->id, 'DESKTOP-ONE', $this->owner->id, [
            'batch_count' => 2,
            'quantity_sum' => 10,
        ]);

        $report = $this->service()->forStore($this->store->id);

        $this->assertCount(1, $report['devices']);
        $this->assertFalse($report['devices'][0]['diverged']);
        $this->assertSame(0.0, $report['devices'][0]['quantity_delta']);
    }

    public function test_a_light_device_is_reported_with_a_negative_delta(): void
    {
        $this->seedServerStock(3, 10);

        $this->service()->record($this->store->id, 'DESKTOP-ONE', $this->owner->id, [
            'batch_count' => 2,
            'quantity_sum' => 20,
        ]);

        $device = $this->service()->forStore($this->store->id)['devices'][0];

        $this->assertTrue($device['diverged']);
        $this->assertSame(-10.0, $device['quantity_delta']);
        $this->assertSame(-1, $device['batch_delta']);
    }

    /** Two devices of one store disagreeing is the whole point. */
    public function test_each_device_is_tracked_separately(): void
    {
        $this->seedServerStock(2, 10);

        $this->service()->record($this->store->id, 'DESKTOP-ONE', $this->owner->id, [
            'batch_count' => 2, 'quantity_sum' => 20,
        ]);
        $this->service()->record($this->store->id, 'LAPTOP-TWO', $this->owner->id, [
            'batch_count' => 2, 'quantity_sum' => 14,
        ]);

        $devices = collect($this->service()->forStore($this->store->id)['devices'])
            ->keyBy('device_id');

        $this->assertFalse($devices['DESKTOP-ONE']['diverged']);
        $this->assertTrue($devices['LAPTOP-TWO']['diverged']);
    }

    public function test_a_second_report_replaces_the_first_for_that_device(): void
    {
        $this->seedServerStock(2, 10);

        $this->service()->record($this->store->id, 'DESKTOP-ONE', $this->owner->id, [
            'batch_count' => 1, 'quantity_sum' => 5,
        ]);
        $this->service()->record($this->store->id, 'DESKTOP-ONE', $this->owner->id, [
            'batch_count' => 2, 'quantity_sum' => 20,
        ]);

        $this->assertSame(1, DeviceStockReport::count());
        $this->assertFalse($this->service()->forStore($this->store->id)['devices'][0]['diverged']);
    }

    /**
     * Phase 1's rule, in the place this feature would most easily break it:
     * a store nobody has reported for has not been measured, and saying
     * "no divergence" would be a claim nobody has earned.
     */
    public function test_a_store_with_no_reports_says_so_rather_than_claiming_agreement(): void
    {
        $report = $this->service()->forStore($this->store->id);

        $this->assertSame([], $report['devices']);
        $this->assertFalse($report['measured']);
    }

    public function test_a_store_with_reports_is_marked_measured(): void
    {
        $this->seedServerStock(1, 1);
        $this->service()->record($this->store->id, 'DESKTOP-ONE', $this->owner->id, [
            'batch_count' => 1, 'quantity_sum' => 1,
        ]);

        $this->assertTrue($this->service()->forStore($this->store->id)['measured']);
    }

    public function test_a_devices_human_label_is_resolved_within_the_store(): void
    {
        $this->seedServerStock(1, 1);

        UserDevice::create([
            'id' => (string) Str::uuid(),
            'user_id' => $this->owner->id,
            'store_id' => $this->store->id,
            'device_id' => 'DESKTOP-ONE',
            'device_label' => 'Chrome on Windows',
        ]);

        $this->service()->record($this->store->id, 'DESKTOP-ONE', $this->owner->id, [
            'batch_count' => 1, 'quantity_sum' => 1,
        ]);
        $this->service()->record($this->store->id, 'DESKTOP-TWO', $this->owner->id, [
            'batch_count' => 1, 'quantity_sum' => 1,
        ]);

        $labels = collect($this->service()->forStore($this->store->id)['devices'])
            ->pluck('device_label', 'device_id');

        $this->assertSame('Chrome on Windows', $labels['DESKTOP-ONE']);
        $this->assertNull($labels['DESKTOP-TWO']);
    }

    public function test_the_most_recently_updated_row_supplies_a_shared_devices_label(): void
    {
        $this->seedServerStock(1, 1);

        $other = User::create([
            'first_name' => 'Staff', 'last_name' => 'Test',
            'email' => 'staff-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'), 'role' => 'sales_staff',
            'store_id' => $this->store->id,
        ]);

        $rows = [
            [$this->owner, 'Firefox on Linux', '2026-01-01 00:00:00'],
            [$other, 'Chrome on Windows', '2026-06-01 00:00:00'],
        ];

        foreach ($rows as [$user, $label, $updatedAt]) {
            $device = UserDevice::create([
                'id' => (string) Str::uuid(),
                'user_id' => $user->id,
                'store_id' => $this->store->id,
                'device_id' => 'DESKTOP-ONE',
                'device_label' => $label,
            ]);

            // Eloquent overwrites updated_at on create, which would leave the
            // two rows tied and the assertion decided by insertion order.
            DB::table('user_devices')->where('id', $device->id)
                ->update(['updated_at' => $updatedAt]);
        }

        $this->service()->record($this->store->id, 'DESKTOP-ONE', $this->owner->id, [
            'batch_count' => 1, 'quantity_sum' => 1,
        ]);

        $devices = $this->service()->forStore($this->store->id)['devices'];

        $this->assertSame('Chrome on Windows', $devices[0]['device_label']);
    }

    private function makeAdmin(string $role): User
    {
        return User::create([
            'first_name' => 'Platform', 'last_name' => 'Tester',
            'email' => $role.'-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'), 'role' => $role,
        ]);
    }

    public function test_the_endpoint_is_readable_with_view_platform_health(): void
    {
        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);
        $this->seed(\Database\Seeders\RolesAndPermissionsSeeder::class);

        $this->seedServerStock(1, 4);
        $this->service()->record($this->store->id, 'DESKTOP-ONE', $this->owner->id, [
            'batch_count' => 1, 'quantity_sum' => 2,
        ]);

        $this->actingAs($this->makeAdmin('super_admin'))
            ->getJson("/api/v1/admin/stores/{$this->store->id}/stock-divergence")
            ->assertOk()
            ->assertJsonPath('measured', true)
            ->assertJsonPath('diverged_devices', 1)
            ->assertJsonPath('devices.0.quantity_delta', -2);
    }

    public function test_a_store_owner_cannot_read_another_stores_divergence(): void
    {
        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);
        $this->seed(\Database\Seeders\RolesAndPermissionsSeeder::class);

        $this->actingAs($this->owner)
            ->getJson("/api/v1/admin/stores/{$this->store->id}/stock-divergence")
            ->assertStatus(403);
    }
}
