<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Server-side counterpart to the client's `audit_logs.correlation_id`
 * column (see client/lib/db/schema.ts and the ALTER TABLE in
 * client/lib/db/schema-migrations.ts). Client `audit_logs` syncs to this
 * `activity_logs` table (see SyncController::getModelForTable()). Ties
 * every row one multi-step client operation writes (e.g. everything a
 * single sale touches) together so the Activity Log can collapse them into
 * one entry. Without this, any device that writes to it fails every
 * subsequent push for that row with "Unknown column" - the same class of
 * bug 2026_09_17_000000_add_tax_number_to_stores.php fixed.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('activity_logs', function (Blueprint $table) {
            if (!Schema::hasColumn('activity_logs', 'correlation_id')) {
                $table->string('correlation_id')->nullable()->index();
            }
        });
    }

    public function down(): void
    {
        Schema::table('activity_logs', function (Blueprint $table) {
            $table->dropColumn('correlation_id');
        });
    }
};
