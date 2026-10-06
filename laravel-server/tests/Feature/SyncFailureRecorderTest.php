<?php

namespace Tests\Feature;

use App\Models\SyncFailure;
use App\Models\SyncHealthDaily;
use App\Services\Sync\SyncFailureRecorder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class SyncFailureRecorderTest extends TestCase
{
    use RefreshDatabase;

    private const STORE = '11111111-1111-1111-1111-111111111111';

    private function recorder(): SyncFailureRecorder
    {
        return app(SyncFailureRecorder::class);
    }

    public function test_it_records_one_row_per_refused_change_with_its_operation(): void
    {
        $changes = [
            ['table_name' => 'sales', 'record_id' => 'sale-1', 'operation' => 'INSERT'],
            ['table_name' => 'customers', 'record_id' => 'cust-1', 'operation' => 'UPDATE'],
        ];
        $failed = [
            ['id' => null, 'table_name' => 'sales', 'record_id' => 'sale-1', 'reason' => 'permission_denied'],
            ['id' => null, 'table_name' => 'customers', 'record_id' => 'cust-1', 'reason' => 'forbidden'],
        ];

        $this->recorder()->recordPushOutcome($failed, $changes, self::STORE, null, 5);

        $this->assertSame(2, SyncFailure::count());
        $this->assertDatabaseHas('sync_failures', [
            'record_id' => 'sale-1',
            'reason' => 'permission_denied',
            'operation' => 'INSERT',
            'table_name' => 'sales',
        ]);
        $this->assertDatabaseHas('sync_failures', [
            'record_id' => 'cust-1',
            'reason' => 'forbidden',
            'operation' => 'UPDATE',
        ]);
    }

    /**
     * If the recorder returns early on an empty $failed, every successful push
     * goes uncounted and the success rate is dead on arrival -- the exact bug
     * this phase exists to fix.
     */
    public function test_a_push_with_no_refusals_still_counts_toward_the_daily_tally(): void
    {
        $this->recorder()->recordPushOutcome([], [], self::STORE, null, 12);

        $row = SyncHealthDaily::first();

        $this->assertNotNull($row);
        $this->assertSame(1, $row->pushes);
        $this->assertSame(12, $row->changes_accepted);
        $this->assertSame(0, $row->changes_refused);
    }

    public function test_it_accumulates_across_pushes_on_the_same_date(): void
    {
        $this->recorder()->recordPushOutcome([], [], self::STORE, null, 3);
        $this->recorder()->recordPushOutcome(
            [['id' => null, 'table_name' => 'sales', 'record_id' => 'r1', 'reason' => 'forbidden']],
            [['table_name' => 'sales', 'record_id' => 'r1', 'operation' => 'INSERT']],
            self::STORE,
            null,
            2
        );

        $this->assertSame(1, SyncHealthDaily::count());

        $row = SyncHealthDaily::first();
        $this->assertSame(2, $row->pushes);
        $this->assertSame(5, $row->changes_accepted);
        $this->assertSame(1, $row->changes_refused);
    }

    public function test_it_starts_a_new_row_on_the_next_date(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-10-07 10:00:00'));
        $this->recorder()->recordPushOutcome([], [], self::STORE, null, 1);

        Carbon::setTestNow(Carbon::parse('2026-10-08 10:00:00'));
        $this->recorder()->recordPushOutcome([], [], self::STORE, null, 1);

        Carbon::setTestNow();

        $this->assertSame(2, SyncHealthDaily::count());
    }

    /**
     * §7: this host's MySQL clock runs ~4 hours behind UTC, so a bucket taken
     * from the database would misfile the last four hours of every UTC day.
     */
    public function test_the_daily_bucket_comes_from_the_application_clock_not_the_database(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-10-07 22:30:00'));

        $this->recorder()->recordPushOutcome([], [], self::STORE, null, 1);

        Carbon::setTestNow();

        $this->assertSame('2026-10-07', SyncHealthDaily::first()->date->toDateString());
    }

    public function test_it_records_a_refusal_that_happened_before_the_store_could_be_resolved(): void
    {
        $this->recorder()->recordPushOutcome(
            [['id' => null, 'table_name' => 'sales', 'record_id' => 'r1', 'reason' => 'forbidden']],
            [['table_name' => 'sales', 'record_id' => 'r1', 'operation' => 'INSERT']],
            null,
            null,
            0
        );

        $this->assertDatabaseHas('sync_failures', ['record_id' => 'r1', 'store_id' => null]);
    }

    public function test_it_tolerates_a_failed_entry_with_no_matching_change(): void
    {
        $this->recorder()->recordPushOutcome(
            [['id' => null, 'table_name' => 'sales', 'record_id' => 'r1', 'reason' => 'forbidden']],
            [],
            self::STORE,
            null,
            0
        );

        $this->assertDatabaseHas('sync_failures', ['record_id' => 'r1', 'operation' => null]);
    }

    /**
     * Change entries carry no `id` in real client pushes (see
     * SyncPushSessionScopedRefusalTest), so correlating the operation on `id`
     * would record null for virtually every refusal in production.
     */
    public function test_it_resolves_the_operation_without_relying_on_a_change_id(): void
    {
        $this->recorder()->recordPushOutcome(
            [['table_name' => 'stock_batches', 'record_id' => 'batch-7', 'reason' => 'forbidden']],
            [['table_name' => 'stock_batches', 'record_id' => 'batch-7', 'operation' => 'DELETE', 'payload' => []]],
            self::STORE,
            null,
            0
        );

        $this->assertDatabaseHas('sync_failures', [
            'record_id' => 'batch-7',
            'operation' => 'DELETE',
        ]);
    }
}
