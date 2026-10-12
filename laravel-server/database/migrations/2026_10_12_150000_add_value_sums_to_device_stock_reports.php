<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Nullable: see laravel-server/AGENTS.md for why, and when to retire it. */
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
