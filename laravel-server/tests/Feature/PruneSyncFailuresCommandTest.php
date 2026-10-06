<?php

namespace Tests\Feature;

use App\Models\SyncFailure;
use App\Models\SyncHealthDaily;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class PruneSyncFailuresCommandTest extends TestCase
{
    use RefreshDatabase;

    private function failureAgedDays(int $days): SyncFailure
    {
        $failure = SyncFailure::create([
            'table_name' => 'sales',
            'record_id' => 'r-'.uniqid(),
            'operation' => 'INSERT',
            'reason' => 'forbidden',
            'created_at' => now(),
        ]);

        DB::table('sync_failures')->where('id', $failure->id)
            ->update(['created_at' => now()->subDays($days)]);

        return $failure;
    }

    public function test_it_deletes_failures_older_than_the_retention_window(): void
    {
        $old = $this->failureAgedDays(91);

        $this->artisan('sync:prune-failures')->assertSuccessful();

        $this->assertDatabaseMissing('sync_failures', ['id' => $old->id]);
    }

    public function test_it_keeps_failures_inside_the_retention_window(): void
    {
        $recent = $this->failureAgedDays(89);

        $this->artisan('sync:prune-failures')->assertSuccessful();

        $this->assertDatabaseHas('sync_failures', ['id' => $recent->id]);
    }

    public function test_it_never_touches_the_daily_tally(): void
    {
        SyncHealthDaily::create([
            'store_id' => null,
            'date' => now()->subYears(2)->startOfDay(),
            'pushes' => 1,
            'changes_accepted' => 1,
            'changes_refused' => 0,
        ]);

        $this->artisan('sync:prune-failures')->assertSuccessful();

        $this->assertSame(1, SyncHealthDaily::count());
    }

    public function test_it_is_a_no_op_when_there_is_nothing_to_prune(): void
    {
        $this->artisan('sync:prune-failures')->assertSuccessful();

        $this->assertSame(0, SyncFailure::count());
    }
}
