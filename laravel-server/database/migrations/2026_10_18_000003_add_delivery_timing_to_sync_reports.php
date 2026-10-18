<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Eventual delivery per edit, rather than success per HTTP attempt. Every
 * column is nullable or zero-defaulted and nothing backfills existing rows:
 * a bundle that reports none of this leaves them null, which the panel reads
 * as "not reported" rather than as "delivered instantly".
 * See docs/DEVICE_TABLE_AGREEMENT.md.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('device_queue_reports', function (Blueprint $table) {
            $table->unsignedInteger('oldest_queued_seconds')->nullable()->after('stuck_count');
            $table->json('delivered_ages')->nullable()->after('oldest_queued_seconds');
        });

        Schema::table('sync_health_daily', function (Blueprint $table) {
            $table->unsignedInteger('changes_queued_peak')->default(0)->after('changes_conflicted');
        });
    }

    public function down(): void
    {
        Schema::table('device_queue_reports', function (Blueprint $table) {
            $table->dropColumn(['oldest_queued_seconds', 'delivered_ages']);
        });

        Schema::table('sync_health_daily', function (Blueprint $table) {
            $table->dropColumn('changes_queued_peak');
        });
    }
};
