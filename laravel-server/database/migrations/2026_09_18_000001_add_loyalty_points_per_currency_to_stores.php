<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Server-side counterpart to making the loyalty earn rate configurable
 * (previously hardcoded as calculateEarnedPoints()'s 0.01 default - see
 * client/lib/utils/loyalty-calculator.ts). Every checkout now reads
 * stores.loyalty_points_per_currency to decide the base points-per-currency
 * rate before any tier multiplier, so without this column existing
 * server-side every subsequent settings push fails with "Unknown column".
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            if (!Schema::hasColumn('stores', 'loyalty_points_per_currency')) {
                $table->decimal('loyalty_points_per_currency', 6, 4)->default(0.01);
            }
        });
    }

    public function down(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            $table->dropColumn('loyalty_points_per_currency');
        });
    }
};
