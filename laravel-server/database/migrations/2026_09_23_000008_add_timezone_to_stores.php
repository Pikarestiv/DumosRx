<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Server-side "today" bucketing (SaleController::dailySales,
 * DashboardService, SendAdminDailySummary, EndOfDaySummaryMail) used
 * whereDate('created_at', ...) against created_at timestamps stored in UTC
 * (config('app.timezone') === 'UTC'), so a sale rung late at night in any
 * timezone ahead of UTC could land on the wrong day server-side. This adds
 * a per-store IANA timezone identifier (default 'UTC', so existing/unset
 * stores keep today's behavior) that those call sites now use to compute
 * day boundaries in the store's own local time before querying.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            if (!Schema::hasColumn('stores', 'timezone')) {
                $table->string('timezone')->default('UTC');
            }
        });
    }

    public function down(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            $table->dropColumn(['timezone']);
        });
    }
};
