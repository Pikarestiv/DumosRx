<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // Rename foreign keys in sale_items
        if (Schema::hasColumn('sale_items', 'inventory_id')) {
            Schema::table('sale_items', function (Blueprint $table) {
                $table->renameColumn('inventory_id', 'stock_batch_id');
            });
        }

        // Rename foreign keys in stock_movements
        if (Schema::hasColumn('stock_movements', 'inventory_id')) {
            Schema::table('stock_movements', function (Blueprint $table) {
                $table->renameColumn('inventory_id', 'stock_batch_id');
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasColumn('stock_movements', 'stock_batch_id')) {
            Schema::table('stock_movements', function (Blueprint $table) {
                $table->renameColumn('stock_batch_id', 'inventory_id');
            });
        }

        if (Schema::hasColumn('sale_items', 'stock_batch_id')) {
            Schema::table('sale_items', function (Blueprint $table) {
                $table->renameColumn('stock_batch_id', 'inventory_id');
            });
        }
    }
};
