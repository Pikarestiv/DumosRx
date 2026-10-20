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

        // Twice: one reading cannot tell "behind" from a push in flight.
        $this->report(['products' => [2, 2, 0], 'categories' => [0, 0, 0]]);
        $this->report(['products' => [2, 2, 0], 'categories' => [0, 0, 0]]);

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

    /**
     * One reading cannot tell this apart from a push whose own UPDATEs the
     * server has already accepted, so detection takes two.
     */
    public function test_a_version_mismatch_at_an_equal_row_count_is_detected(): void
    {
        $this->product(3);

        $this->report(['products' => [1, 1, 0]]);
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

    /**
     * One queued INSERT is one extra row at `_version` 1, so it accounts for
     * exactly one of row delta and one of version delta — the server assigns
     * precisely one version per accepted change.
     */
    public function test_a_queued_edit_excuses_a_row_count_difference(): void
    {
        $this->product();

        $this->report(['products' => [2, 2, 1]]);

        $tables = $this->tablesFor();
        $this->assertSame('syncing', $tables['products']['verdict']);
        $this->assertSame(0, $this->service->forStore($this->store->id)['diverged_devices']);
    }

    /** The queue depth is a budget, not a blanket excuse. */
    public function test_drift_larger_than_the_queue_depth_is_not_excused(): void
    {
        $this->product();

        $this->report(['products' => [4, 4, 1]]);

        $this->assertSame('diverged', $this->tablesFor()['products']['verdict']);
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

    public function test_a_device_behind_on_one_report_and_caught_up_on_the_next_is_not_diverged(): void
    {
        $this->product(3);
        $this->product(3);

        $this->report(['products' => [2, 4, 0]]);

        $tables = $this->tablesFor();
        $this->assertSame('behind', $tables['products']['verdict']);
        $this->assertSame(0, $this->service->forStore($this->store->id)['diverged_devices']);

        $this->report(['products' => [2, 6, 0]]);

        $this->assertSame('agrees', $this->tablesFor()['products']['verdict']);
        $this->assertSame(0, $this->service->forStore($this->store->id)['diverged_devices']);
    }

    public function test_a_table_behind_on_two_consecutive_reports_is_promoted_to_diverged(): void
    {
        $this->product(3);

        $this->report(['products' => [1, 1, 0]]);
        $this->assertSame('behind', $this->tablesFor()['products']['verdict']);

        $this->report(['products' => [1, 1, 0]]);

        $tables = $this->tablesFor();
        $this->assertSame('diverged', $tables['products']['verdict']);

        $result = $this->service->forStore($this->store->id);
        $this->assertSame(1, $result['diverged_devices']);
        $this->assertSame(
            ['products'],
            collect($result['devices'])->firstWhere('device_id', 'DRX-TILL-1')['diverged_tables'],
        );
    }

    /** The promotion must read THIS device's own previous snapshot. */
    public function test_another_devices_behind_reading_does_not_promote_this_one(): void
    {
        $this->product(3);

        $this->report(['products' => [1, 1, 0]], 'DRX-TILL-2');
        $this->report(['products' => [1, 1, 0]], 'DRX-TILL-2');
        $this->report(['products' => [1, 1, 0]], 'DRX-TILL-1');

        $this->assertSame('behind', $this->tablesFor('DRX-TILL-1')['products']['verdict']);
    }

    public function test_the_version_bump_of_this_pushs_own_updates_reads_as_syncing(): void
    {
        $this->product(4);
        $this->product(4);

        $this->report(['products' => [2, 6, 2]]);

        $tables = $this->tablesFor();
        $this->assertSame('syncing', $tables['products']['verdict']);
        $this->assertSame(-2, $tables['products']['version_delta']);
    }

    /**
     * It compared two different physical tables: the pull delivers from
     * `activity_logs`, while the digest counted the unused legacy
     * `audit_logs`. A large false delta, and a real activity-log divergence
     * was undetectable at the same time.
     */
    public function test_audit_logs_is_not_compared_at_all(): void
    {
        $this->product();

        $this->service->record($this->store->id, 'DRX-TILL-1', null, [
            'tables' => [
                ['t' => 'products', 'r' => 1, 'v' => 1, 'p' => 0],
                ['t' => 'audit_logs', 'r' => 4200, 'v' => 4200, 'p' => 0],
            ],
        ]);

        $this->assertSame(['products'], array_keys($this->tablesFor()));
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

    /**
     * A-294: surfaced alongside the per-table verdicts so a "diverges" on
     * products/categories can be told apart from this known, explained
     * cause. SQLite enforces the FK the migration declares, production does
     * not (A-292), so the orphan needs checks off to insert at all — see
     * UnresolvedReferenceServiceTest for why that means stepping outside
     * this test's own wrapping transaction.
     */
    public function test_unresolvable_category_products_is_counted_alongside_the_devices(): void
    {
        $connection = DB::connection();
        $connection->commit();
        DB::statement('PRAGMA foreign_keys = OFF');
        $productId = (string) Str::uuid();
        $ownerId = $this->store->user_id;

        try {
            DB::table('products')->insert([
                'id' => $productId,
                'name' => 'Orphan Category Product',
                'store_id' => $this->store->id,
                'category_id' => (string) Str::uuid(),
                'selling_price' => 500,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            $this->assertSame(1, $this->service->forStore($this->store->id)['unresolvable_category_products']);
        } finally {
            // Committed past this test's own setUp() data too, not just the
            // row above, so it needs cleaning up here rather than relying on
            // RefreshDatabase's rollback (see UnresolvedReferenceServiceTest).
            DB::table('products')->where('id', $productId)->delete();
            DB::table('stores')->where('id', $this->store->id)->delete();
            DB::table('users')->where('id', $ownerId)->delete();
            DB::statement('PRAGMA foreign_keys = ON');
            $connection->beginTransaction();
        }
    }
}
