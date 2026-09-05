<?php

namespace Tests\Feature;

use App\Http\Controllers\Api\App\SyncController;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * Direct schema-parity check between the client's local database
 * (client/lib/db/schema.ts) and whatever table SyncController::
 * getModelForTable() actually resolves each sync table name to.
 *
 * This exists because end-to-end push/pull tests weren't enough to catch
 * this class of bug reliably: SQLite (used for this test suite) was found
 * to silently tolerate `SELECT ... WHERE nonexistent_column = ?` in this
 * app's setup — no error, just zero matching rows — while the real MySQL
 * server correctly throws "Unknown column" for the exact same query. A
 * live pull request against a genuinely missing column
 * (activity_logs.store_id, added to the wrong physical table by an earlier
 * fix — see add_store_id_to_activity_logs migration) passed every
 * push/pull-based regression test in this suite and then failed instantly
 * against real MySQL. A direct column-listing comparison doesn't depend on
 * a query actually erroring to catch the gap, and resolving through
 * getModelForTable() (not just the client's table-name string) is what
 * catches a table-name/physical-table mismatch like this one.
 */
class SyncSchemaParityTest extends TestCase
{
    use RefreshDatabase;

    /** Client-local bookkeeping columns never sent to the server. */
    private const IGNORED_COLUMNS = ['_synced', '_deleted'];

    /**
     * Parsed once per test run from the actual client source, not
     * hand-copied, so this test can't silently drift out of sync with it
     * the same way the server schema itself did.
     */
    private function clientTableColumns(): array
    {
        $path = base_path('../client/lib/db/schema.ts');
        $this->assertFileExists($path, 'client/lib/db/schema.ts not found relative to laravel-server — repo layout may have changed.');
        $content = file_get_contents($path);

        preg_match_all('/CREATE TABLE IF NOT EXISTS (\w+) \((.*?)\n\);/s', $content, $matches, PREG_SET_ORDER);

        $tables = [];
        foreach ($matches as $match) {
            [, $table, $body] = $match;
            $columns = [];
            foreach (explode("\n", $body) as $line) {
                $line = rtrim(trim($line), ',');
                if ($line === '' || preg_match('/^(PRIMARY KEY|FOREIGN KEY|UNIQUE|CHECK|CONSTRAINT)/i', $line)) {
                    continue;
                }
                $columns[] = strtok($line, " \t");
            }
            $tables[$table] = $columns;
        }

        return $tables;
    }

    public function test_every_client_table_and_column_the_server_claims_to_sync_actually_exists()
    {
        $controller = new SyncController();
        $clientTables = $this->clientTableColumns();
        $this->assertNotEmpty($clientTables, 'Failed to parse any tables from schema.ts — check the parsing regex against the current file format.');

        $problems = [];

        foreach ($clientTables as $table => $columns) {
            if (in_array($table, ['_sync_queue', '_sync_state'], true)) {
                continue; // client-only bookkeeping, never synced
            }

            $modelClass = $controller->getModelForTable($table);
            if (!$modelClass) {
                // Not every client table is expected to sync (e.g. purely
                // local caches) — getModelForTable() being the single
                // source of truth for "does this table sync at all" is
                // itself covered by SyncSchemaDriftTest's silent-drop
                // regression tests, not this one.
                continue;
            }

            $realTable = (new $modelClass())->getTable();

            if (!Schema::hasTable($realTable)) {
                $problems[] = "$table -> $realTable: table does not exist";
                continue;
            }

            $serverColumns = Schema::getColumnListing($realTable);
            foreach ($columns as $column) {
                if (in_array($column, self::IGNORED_COLUMNS, true)) {
                    continue;
                }
                if (!in_array($column, $serverColumns, true)) {
                    $problems[] = "$table.$column -> $realTable.$column: column does not exist";
                }
            }
        }

        $this->assertEmpty(
            $problems,
            "Client sends these but the server can't store them (resolved through getModelForTable(), not just the table-name string):\n" . implode("\n", $problems)
        );
    }
}
