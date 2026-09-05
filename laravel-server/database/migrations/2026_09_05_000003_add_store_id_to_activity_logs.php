<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Corrects a mistake in the previous migration (fix_sync_schema_drift):
 * getModelForTable() maps the client's 'audit_logs' sync table name to
 * ActivityLog::class, but that model has no `$table` override, so Eloquent
 * resolves it to the real `activity_logs` table — a completely different,
 * actively-used table from the `audit_logs` one that migration touched
 * (which appears to be unused legacy cruft; nothing references it via any
 * model). The previous migration's `Schema::hasColumn($table, 'store_id')`
 * checks were keyed by the client's sync table-name string, not by what the
 * model actually resolves to, so it silently fixed the wrong table.
 * Confirmed live: a real pull request against this app's own local MySQL
 * database (a client-forwarded Sentry report) threw exactly "Unknown column
 * 'store_id'" against `activity_logs`, immediately after the previous
 * migration had supposedly fixed this.
 *
 * Following that up with a permanent schema-parity test (SyncSchemaParityTest,
 * which resolves through getModelForTable() rather than the client's
 * table-name string) turned up more: activity_logs was also missing
 * `table_name`, `record_id`, `details`, and `_version` — the actual
 * structured shape of what the client calls "audit_logs" (this app's
 * Activity Log feature: "what table, what record, what happened"), not
 * just store_id. activity_logs' pre-existing shape (`action`,
 * `description`, `properties`) is a different, older, generic
 * action-logging concept that happens to share this sync mapping. Without
 * these, the Activity Log feature's actual content has never synced to the
 * cloud correctly, even before store_id was the specific blocker.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('activity_logs', function (Blueprint $table) {
            if (!Schema::hasColumn('activity_logs', 'store_id')) {
                $table->uuid('store_id')->nullable()->index();
            }
            if (!Schema::hasColumn('activity_logs', 'table_name')) {
                $table->string('table_name')->nullable();
            }
            if (!Schema::hasColumn('activity_logs', 'record_id')) {
                $table->string('record_id')->nullable();
            }
            if (!Schema::hasColumn('activity_logs', 'details')) {
                $table->text('details')->nullable();
            }
            if (!Schema::hasColumn('activity_logs', '_version')) {
                $table->integer('_version')->default(1);
            }
        });

        if (DB::getDriverName() !== 'sqlite') {
            DB::statement("
                UPDATE `activity_logs` t
                JOIN `users` u ON u.id = t.user_id
                LEFT JOIN `stores` owned ON owned.user_id = u.id
                SET t.store_id = COALESCE(u.store_id, owned.id)
                WHERE t.store_id IS NULL
            ");
        }
    }

    public function down(): void
    {
        Schema::table('activity_logs', function (Blueprint $table) {
            $table->dropColumn(['store_id', 'table_name', 'record_id', 'details', '_version']);
        });
    }
};
