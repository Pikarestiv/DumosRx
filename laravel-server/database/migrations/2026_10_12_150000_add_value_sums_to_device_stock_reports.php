<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Nullable on purpose: a client shipped before the fingerprint carried a value
 * sends none, and rows written before this migration have none. NULL means
 * "not reported", which the panel renders as such rather than as zero stock.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('device_stock_reports', function (Blueprint $table) {
            $table->decimal('device_value_sum', 18, 2)->nullable()->after('device_quantity_sum');
            $table->decimal('server_value_sum', 18, 2)->nullable()->after('server_quantity_sum');
        });
    }

    public function down(): void
    {
        Schema::table('device_stock_reports', function (Blueprint $table) {
            $table->dropColumn(['device_value_sum', 'server_value_sum']);
        });
    }
};
