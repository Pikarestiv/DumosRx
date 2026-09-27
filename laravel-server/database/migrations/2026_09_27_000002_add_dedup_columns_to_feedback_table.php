<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Server-side counterpart to the client's `feedback.fingerprint`/
 * `occurrence_count`/`last_occurred_at` columns (see client/lib/db/
 * schema.ts and the ALTER TABLE in client/lib/db/schema-migrations.ts).
 * captureError() (client lib/utils/error-logger.ts) now coalesces a
 * repeating crash/error report into one row with a growing
 * occurrence_count instead of a fresh row per occurrence - without these
 * columns existing here too, every such sync push would fail with
 * "Unknown column".
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('feedback', function (Blueprint $table) {
            if (!Schema::hasColumn('feedback', 'fingerprint')) {
                $table->string('fingerprint')->nullable()->index();
            }
            if (!Schema::hasColumn('feedback', 'occurrence_count')) {
                $table->unsignedInteger('occurrence_count')->default(1);
            }
            if (!Schema::hasColumn('feedback', 'last_occurred_at')) {
                $table->timestamp('last_occurred_at')->nullable();
            }
        });
    }

    public function down(): void
    {
        Schema::table('feedback', function (Blueprint $table) {
            $table->dropColumn(['fingerprint', 'occurrence_count', 'last_occurred_at']);
        });
    }
};
