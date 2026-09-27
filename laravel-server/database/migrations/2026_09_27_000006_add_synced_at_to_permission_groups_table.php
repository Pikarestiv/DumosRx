<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The original create_permission_groups_table migration omitted
 * `_synced_at`, present on the client's copy of this table
 * (client/lib/db/schema.ts) - caught by SyncSchemaParityTest, which
 * exists precisely to catch a client/server column mismatch like this
 * one before it reaches production (see that test's own doc comment,
 * citing the activity_logs.store_id incident this class of bug already
 * caused once). SyncController::stampSyncedAt() checks Schema::hasColumn()
 * before writing to it, so this was never a hard crash, just a silently
 * dropped column - IGNORED_COLUMNS in that test only exempts
 * `_synced`/`_deleted` (pure client-local bookkeeping), not this one.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('permission_groups', function (Blueprint $table) {
            $table->timestamp('_synced_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('permission_groups', function (Blueprint $table) {
            $table->dropColumn('_synced_at');
        });
    }
};
