<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Add _synced_at to the tables that were missing from the original
     * 2026_01_21_160000_add_synced_at_to_tables.php migration.
     * Covers: stock_movements, purchase_orders, purchase_order_items.
     */
    public function up(): void
    {
        $tables = ['stock_movements', 'purchase_orders', 'purchase_order_items'];

        foreach ($tables as $table) {
            if (Schema::hasTable($table) && !Schema::hasColumn($table, '_synced_at')) {
                Schema::table($table, function (Blueprint $blueprint) {
                    $blueprint->timestamp('_synced_at')->nullable()->index();
                });
            }
        }
    }

    public function down(): void
    {
        $tables = ['stock_movements', 'purchase_orders', 'purchase_order_items'];

        foreach ($tables as $table) {
            if (Schema::hasTable($table) && Schema::hasColumn($table, '_synced_at')) {
                Schema::table($table, function (Blueprint $blueprint) {
                    $blueprint->dropColumn('_synced_at');
                });
            }
        }
    }
};
