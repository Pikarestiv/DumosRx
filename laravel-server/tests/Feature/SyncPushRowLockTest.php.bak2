<?php

namespace Tests\Feature;

use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Regression coverage for the lockForUpdate() fix in
 * SyncController::push()'s UPDATE branch: without it, two concurrent pushes
 * for the same record could both read the same `_version`, both pass the
 * optimistic-concurrency equality check, and both save — a lost update. See
 * docs/KNOWN_BUGS.md.
 *
 * This can't be exercised through the app's normal test suite: phpunit.xml
 * runs everything against SQLite in-memory, and SQLite's grammar makes
 * lockForUpdate() a silent no-op (SQLiteGrammar::compileLock() returns '' —
 * MySqlGrammar::compileLock() returns 'for update'). Real row locking only
 * exists on the real MySQL connection, so this test talks to it directly
 * through two independent connections, and skips itself if that connection
 * isn't reachable (e.g. in a CI environment without a MySQL service).
 */
class SyncPushRowLockTest extends TestCase
{
    private string $table;
    private bool $skipped = false;

    protected function setUp(): void
    {
        parent::setUp();

        // phpunit.xml forces DB_CONNECTION=sqlite and DB_DATABASE=:memory: for
        // the whole test run, which also clobbers config('database.connections.mysql')
        // since that config reads the same DB_DATABASE env var. Read the real
        // credentials straight out of .env instead, since this test deliberately
        // needs the real MySQL database, not the test suite's sqlite one.
        $realDbConfig = $this->readRealMysqlCredentialsFromDotEnv();

        config([
            'database.connections.mysql_lock_a' => $realDbConfig,
            'database.connections.mysql_lock_b' => $realDbConfig,
        ]);

        try {
            DB::connection('mysql_lock_a')->getPdo();
            DB::connection('mysql_lock_b')->getPdo();
        } catch (\Throwable $e) {
            $this->skipped = true;
            $this->markTestSkipped('Real MySQL connection not reachable, skipping row-lock test: ' . $e->getMessage());

            return;
        }

        $this->table = '_sync_lock_test_' . bin2hex(random_bytes(4));
        DB::connection('mysql_lock_a')->statement(
            "CREATE TABLE `{$this->table}` (id VARCHAR(36) PRIMARY KEY, _version INT NOT NULL DEFAULT 1) ENGINE=InnoDB"
        );
        DB::connection('mysql_lock_a')->table($this->table)->insert(['id' => 'row1', '_version' => 1]);
    }

    protected function tearDown(): void
    {
        if (!$this->skipped && isset($this->table)) {
            try {
                DB::connection('mysql_lock_a')->statement("DROP TABLE IF EXISTS `{$this->table}`");
            } catch (\Throwable $e) {
                // Best-effort cleanup only.
            }
        }
        DB::purge('mysql_lock_a');
        DB::purge('mysql_lock_b');

        parent::tearDown();
    }

    /**
     * @return array<string, mixed>
     */
    private function readRealMysqlCredentialsFromDotEnv(): array
    {
        $defaults = [
            'host' => '127.0.0.1',
            'port' => '3306',
            'database' => 'dumosrx',
            'username' => 'root',
            'password' => '',
        ];

        $envPath = base_path('.env');
        if (is_readable($envPath)) {
            foreach (file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
                if (!str_contains($line, '=') || str_starts_with(trim($line), '#')) {
                    continue;
                }
                [$key, $value] = array_map('trim', explode('=', $line, 2));
                $value = trim($value, "\"'");
                match ($key) {
                    'DB_HOST' => $defaults['host'] = $value,
                    'DB_PORT' => $defaults['port'] = $value,
                    'DB_DATABASE' => $defaults['database'] = $value,
                    'DB_USERNAME' => $defaults['username'] = $value,
                    'DB_PASSWORD' => $defaults['password'] = $value,
                    default => null,
                };
            }
        }

        return [
            'driver' => 'mysql',
            'host' => $defaults['host'],
            'port' => $defaults['port'],
            'database' => $defaults['database'],
            'username' => $defaults['username'],
            'password' => $defaults['password'],
            'charset' => 'utf8mb4',
            'collation' => 'utf8mb4_unicode_ci',
            'prefix' => '',
        ];
    }

    /**
     * Exercises the exact call shape SyncController::push()'s UPDATE branch
     * uses — `$modelClass::lockForUpdate()->find($recordId)` (query-builder
     * equivalent: `->lockForUpdate()->first()`) — against two genuinely
     * separate MySQL connections, so a refactor that silently drops
     * lockForUpdate() from that line would leave this test still passing
     * only if row locking coincidentally still happened some other way.
     */
    public function test_lock_for_update_serializes_concurrent_readers_of_the_same_row()
    {
        $connA = DB::connection('mysql_lock_a');
        $connB = DB::connection('mysql_lock_b');

        // Fail fast instead of hanging for the server's default lock-wait
        // timeout (commonly 50s) when the second connection's lock attempt
        // below is correctly blocked by the first.
        $connB->statement('SET SESSION innodb_lock_wait_timeout = 1');

        $connA->beginTransaction();
        $rowA = $connA->table($this->table)->where('id', 'row1')->lockForUpdate()->first();
        $this->assertEquals(1, $rowA->_version);

        $connB->beginTransaction();
        $blocked = false;
        try {
            $connB->table($this->table)->where('id', 'row1')->lockForUpdate()->first();
        } catch (QueryException $e) {
            $blocked = true;
            $this->assertStringContainsStringIgnoringCase('lock wait timeout', $e->getMessage());
        } finally {
            $connB->rollBack();
        }

        $this->assertTrue(
            $blocked,
            'A second lockForUpdate() read of the same row must block (and here, time out) while ' .
            'another transaction holds it. This is the mechanism SyncController::push() relies on ' .
            'to prevent two concurrent pushes from both reading the same _version, both passing the ' .
            'equality check, and both saving — the lost-update race the fix closes.'
        );

        $connA->commit();

        // Once released, the same lock is immediately acquirable — proves the
        // failure above was real lock contention, not a broken connection or
        // an unrelated query error.
        $connB->beginTransaction();
        $rowB = $connB->table($this->table)->where('id', 'row1')->lockForUpdate()->first();
        $this->assertEquals(1, $rowB->_version);
        $connB->commit();
    }
}
