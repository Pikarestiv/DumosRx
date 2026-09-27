<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Server-side counterpart to the client's `audit_logs.occurrence_count`/
 * `last_occurred_at` columns (see client/lib/db/schema.ts and the ALTER
 * TABLE in client/lib/db/schema-migrations.ts). Client `audit_logs` syncs
 * to this `activity_logs` table (see SyncController::getModelForTable()).
 * logAction() (client core.ts) now coalesces a repeating dedupable action
 * (e.g. LOGIN_FAILED) into one row with a growing occurrence_count instead
 * of a fresh row per occurrence - without this column existing here too,
 * every such push would fail with "Unknown column", the same class of bug
 * 2026_09_23_000001_add_correlation_id_to_activity_logs.php fixed.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('activity_logs', function (Blueprint $table) {
            if (!Schema::hasColumn('activity_logs', 'occurrence_count')) {
                $table->unsignedInteger('occurrence_count')->default(1);
            }
            if (!Schema::hasColumn('activity_logs', 'last_occurred_at')) {
                $table->timestamp('last_occurred_at')->nullable();
            }
        });
    }

    public function down(): void
    {
        Schema::table('activity_logs', function (Blueprint $table) {
            $table->dropColumn(['occurrence_count', 'last_occurred_at']);
        });
    }
};
