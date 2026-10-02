<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * `AppServiceProvider::boot()` sets `Schema::defaultStringLength(191)`
 * globally (an old-MySQL/utf8mb4 index-prefix compatibility shim), so the
 * unspecified-length `$table->string('fingerprint')->index()` in
 * 2026_09_27_000002_add_dedup_columns_to_feedback_table.php silently became
 * VARCHAR(191) instead of Laravel's native 255 default. The client's
 * `MAX_FINGERPRINT_LENGTH` (client/lib/utils/error-truncation.ts) has always
 * assumed 255, so any fingerprint landing between 192 and 255 characters
 * fails the insert with "Data too long for column 'fingerprint'" - found
 * live via a real failed sync push. Widens the column to match the
 * client's existing assumption rather than shrinking the client's cap,
 * since fingerprint entropy matters for crash-dedup accuracy.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('feedback', function (Blueprint $table) {
            $table->string('fingerprint', 255)->nullable()->change();
        });
    }

    /**
     * Not data-safe if a real row has since grown past 191 characters: under
     * the default `STRICT_TRANS_TABLES` sql_mode this fails loudly ("Data
     * truncated for column"), but under a non-strict mode it would silently
     * truncate. Conventionally present rather than something to run blind.
     */
    public function down(): void
    {
        Schema::table('feedback', function (Blueprint $table) {
            $table->string('fingerprint', 191)->nullable()->change();
        });
    }
};
