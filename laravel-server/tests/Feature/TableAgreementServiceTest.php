<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use App\Services\Admin\TableAgreementService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Agreement was only ever measured for stock, so every other synced table
 * could diverge on every till and the panel still read "Agrees". See
 * docs/DEVICE_TABLE_AGREEMENT.md for the digest and its blind spots.
 */
class TableAgreementServiceTest extends TestCase
{
    use RefreshDatabase;

    private Store $store;

    private TableAgreementService $service;

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

        $this->service = app(TableAgreementService::class);
    }

    private function product(int $version = 1): string
    {
        $id = (string) Str::uuid();
        DB::table('products')->insert([
            'id' => $id,
            'name' => 'Product '.substr($id, 0, 8),
            'store_id' => $this->store->id,
            'selling_price' => 500,
            '_version' => $version,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return $id;
    }

    private function category(int $version = 1): string
    {
        $id = (string) Str::uuid();
        DB::table('categories')->insert([
            'id' => $id,
            'name' => 'Category '.substr($id, 0, 8),
            'store_id' => $this->store->id,
            '_version' => $version,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return $id;
    }

    /** @param array<string, array{int, int, int}> $tables table => [rows, version_sum, pending] */
    private function report(array $tables, string $deviceId = 'DRX-TILL-1'): void
    {
        $this->service->record($this->store->id, $deviceId, null, [
            'tables' => array_map(
                fn (string $table) => [
                    't' => $table,
                    'r' => $tables[$table][0],
                    'v' => $tables[$table][1],
                    'p' => $tables[$table][2] ?? 0,
                ],
                array_keys($tables),
            ),
        ]);
    }

    /** @return array<string, array<string, mixed>> table => row */
    private function tablesFor(string $deviceId = 'DRX-TILL-1'): array
    {
        $result = $this->service->forStore($this->store->id);
        $device = collect($result['devices'])->firstWhere('device_id', $deviceId);

        return collect($device['tables'] ?? [])->keyBy('table')->all();
    }

    public function test_a_device_disagreeing_on_one_table_reports_exactly_that_table(): void
    {
        $this->product();
        $this->product();
        $this->category();

        $this->report([
            'products' => [2, 2, 0],
            'categories' => [0, 0, 0],
        ]);

        $result = $this->service->forStore($this->store->id);

        $this->assertTrue($result['measured']);
        $this->assertSame(1, $result['diverged_devices']);

        $tables = $this->tablesFor();
        $this->assertSame('agrees', $tables['products']['verdict']);
        $this->assertSame('diverged', $tables['categories']['verdict']);
        $this->assertSame(-1, $tables['categories']['row_delta']);

        $device = collect($result['devices'])->firstWhere('device_id', 'DRX-TILL-1');
        $this->assertSame(['categories'], $device['diverged_tables']);
    }

    public function test_a_device_that_never_reported_reads_as_not_measured(): void
    {
        $this->product();

        $result = $this->service->forStore($this->store->id);

        $this->assertFalse($result['measured']);
        $this->assertSame([], $result['devices']);
        $this->assertSame(0, $result['diverged_devices']);
    }

    public function test_a_version_mismatch_at_an_equal_row_count_is_detected(): void
    {
        $this->product(3);

        $this->report(['products' => [1, 1, 0]]);

        $tables = $this->tablesFor();
        $this->assertSame('diverged', $tables['products']['verdict']);
        $this->assertSame(0, $tables['products']['row_delta']);
        $this->assertSame(-2, $tables['products']['version_delta']);
    }

    public function test_a_device_holding_no_copy_of_the_store_is_not_called_diverged(): void
    {
        $this->product();
        $this->category();

        $this->report([
            'products' => [0, 0, 0],
            'categories' => [0, 0, 0],
        ]);

        $result = $this->service->forStore($this->store->id);
        $device = collect($result['devices'])->firstWhere('device_id', 'DRX-TILL-1');

        $this->assertFalse($device['has_local_copy']);
        $this->assertSame(0, $result['diverged_devices']);
    }

    public function test_a_queued_edit_excuses_a_row_count_difference(): void
    {
        $this->product();

        $this->report(['products' => [2, 3, 1]]);

        $tables = $this->tablesFor();
        $this->assertSame('syncing', $tables['products']['verdict']);
        $this->assertSame(0, $this->service->forStore($this->store->id)['diverged_devices']);
    }

    public function test_a_snapshot_older_than_the_stale_window_stops_counting(): void
    {
        $this->product();
        $this->report(['products' => [9, 9, 0]]);

        DB::table('device_table_reports')->update(['reported_at' => now()->subDays(3)]);

        $result = $this->service->forStore($this->store->id);
        $device = collect($result['devices'])->firstWhere('device_id', 'DRX-TILL-1');

        $this->assertTrue($device['stale']);
        $this->assertSame(0, $result['diverged_devices']);
    }

    public function test_an_unknown_table_name_is_ignored_rather_than_queried(): void
    {
        $this->product();

        $this->service->record($this->store->id, 'DRX-TILL-1', null, [
            'tables' => [
                ['t' => 'products', 'r' => 1, 'v' => 1, 'p' => 0],
                ['t' => 'users; DROP TABLE products', 'r' => 5, 'v' => 5, 'p' => 0],
            ],
        ]);

        $tables = $this->tablesFor();
        $this->assertSame(['products'], array_keys($tables));
        $this->assertSame(1, DB::table('products')->count());
    }

    public function test_forget_drops_one_devices_snapshot(): void
    {
        $this->report(['products' => [0, 0, 0]], 'DRX-TILL-1');
        $this->report(['products' => [0, 0, 0]], 'DRX-TILL-2');

        $this->assertSame(1, $this->service->forget($this->store->id, 'DRX-TILL-1'));
        $this->assertSame(
            ['DRX-TILL-2'],
            collect($this->service->forStore($this->store->id)['devices'])->pluck('device_id')->all(),
        );
    }
}
