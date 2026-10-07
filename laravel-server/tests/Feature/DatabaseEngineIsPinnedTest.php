<?php

namespace Tests\Feature;

use Tests\TestCase;

/**
 * The mysql connection must name its storage engine explicitly.
 *
 * This is pinned by a test because getting it wrong is **invisible**. With
 * `'engine' => null`, `Schema::create` emits no `ENGINE=` clause and the
 * table takes the server's `default_storage_engine`. The production host
 * reports `MyISAM => DEFAULT`, so all 63 tables had been created as MyISAM — and
 * MyISAM does not reject transactions, it ignores them. `beginTransaction()`,
 * `rollBack()`, savepoints and `SELECT ... FOR UPDATE` all silently do
 * nothing, which makes `SyncController::push()`'s per-change isolation,
 * `SyncCommandService::pendingFor()`'s atomic claim and
 * `RegistersAccounts::register()`'s all-or-nothing signup into no-ops in
 * production while every SQLite-backed test keeps passing.
 *
 * Nothing else in this suite can catch that: the tests run on SQLite, which
 * honours transactions, so it is *more* capable than production here rather
 * than less.
 *
 * Both databases were converted to InnoDB on 2026-10-07; this test is what
 * stops a future table from quietly regressing to the host default again.
 * See docs/FIXED_BUGS.md A-179.
 */
class DatabaseEngineIsPinnedTest extends TestCase
{
    public function test_the_mysql_connection_pins_innodb_rather_than_inheriting_the_server_default(): void
    {
        $this->assertSame(
            'InnoDB',
            config('database.connections.mysql.engine'),
            'A null engine means every new table silently inherits the server default, which on the production host is MyISAM — no transactions, no row locks, no error.'
        );
    }
}
