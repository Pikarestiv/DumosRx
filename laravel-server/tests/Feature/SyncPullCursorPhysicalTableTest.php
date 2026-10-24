<?php

namespace Tests\Feature;

use App\Http\Controllers\Api\App\SyncController;
use App\Models\ActivityLog;
use App\Services\Admin\Concerns\CountsSyncedTableRows;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use ReflectionClass;
use ReflectionMethod;
use Tests\TestCase;

/**
 * A-289: a client sync table name is not always a physical table name.
 * `audit_logs` is the known case — the client's local table, which
 * getModelForTable() resolves onto ActivityLog and therefore the physical
 * `activity_logs`, while an unused legacy physical `audit_logs` also exists.
 * Anything that hands the sync name to Schema:: or DB::table() reads the
 * wrong table.
 */
class SyncPullCursorPhysicalTableTest extends TestCase
{
    use RefreshDatabase;

    private function applyPullCursor($query, string $table, string $lastSynced): void
    {
        $method = new ReflectionMethod(SyncController::class, 'applyPullCursor');
        $method->setAccessible(true);
        $method->invoke(new SyncController, $query, $table, $lastSynced);
    }

    public function test_the_pull_cursor_probes_the_model_s_physical_table_not_the_sync_name(): void
    {
        $this->assertTrue(
            Schema::hasTable('audit_logs'),
            'The legacy physical audit_logs table is what makes this mistake invisible; without it there is nothing to assert.',
        );

        Schema::table('audit_logs', function ($table) {
            $table->dropColumn('_synced_at');
        });

        $this->assertTrue(Schema::hasColumn('activity_logs', '_synced_at'));

        $query = ActivityLog::query();
        $this->applyPullCursor($query, 'audit_logs', '2026-10-01 00:00:00');

        $this->assertStringContainsString(
            '_synced_at',
            $query->toSql(),
            'The cursor probed the physical audit_logs table instead of the ActivityLog model table, so every activity-log row updated without its _synced_at moving is skipped by the incremental pull.',
        );
    }

    public function test_every_agreement_table_name_is_also_its_own_physical_table(): void
    {
        $controller = new SyncController;
        $tables = (new ReflectionClass(CountsSyncedTableRows::class))
            ->getConstant('AGREEMENT_TABLES');

        $this->assertNotEmpty($tables);

        $mismatched = [];

        foreach ($tables as $table) {
            $modelClass = $controller->getModelForTable($table);

            if (! $modelClass) {
                $mismatched[] = "{$table}: getModelForTable() resolves nothing, so the cloud side counts a table the pull never delivers";

                continue;
            }

            $physical = (new $modelClass)->getTable();

            if ($physical !== $table) {
                $mismatched[] = "{$table} -> {$physical}: counted via DB::table('{$table}') but delivered from '{$physical}'";
            }
        }

        $this->assertEmpty(
            $mismatched,
            "CountsSyncedTableRows uses the sync name as a physical name, so an entry whose names differ compares two different tables (A-289):\n".implode("\n", $mismatched),
        );
    }
}
