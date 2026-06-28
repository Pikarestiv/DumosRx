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
        // Check if old tables still exist before renaming
        if (Schema::hasTable('medicines')) {
            Schema::rename('medicines', 'products');
        }
        
        if (Schema::hasTable('inventories')) {
            Schema::rename('inventories', 'stock_batches');
        }

        // Rename foreign keys in stock_batches
        if (Schema::hasColumn('stock_batches', 'medicine_id')) {
            Schema::table('stock_batches', function (Blueprint $table) {
                $table->renameColumn('medicine_id', 'product_id');
            });
        }

        // Rename foreign keys in stock_movements
        if (Schema::hasColumn('stock_movements', 'medicine_id')) {
            Schema::table('stock_movements', function (Blueprint $table) {
                $table->renameColumn('medicine_id', 'product_id');
            });
        }

        // Rename foreign keys in purchase_order_items
        if (Schema::hasColumn('purchase_order_items', 'medicine_id')) {
            Schema::table('purchase_order_items', function (Blueprint $table) {
                $table->renameColumn('medicine_id', 'product_id');
            });
        }

        // Rename foreign keys in prescriptions
        if (Schema::hasColumn('prescriptions', 'substituted_medicine_id')) {
            Schema::table('prescriptions', function (Blueprint $table) {
                $table->renameColumn('substituted_medicine_id', 'substituted_product_id');
            });
        }

        // Rename foreign keys in prescription_items
        if (Schema::hasColumn('prescription_items', 'medicine_id')) {
            Schema::table('prescription_items', function (Blueprint $table) {
                $table->renameColumn('medicine_id', 'product_id');
            });
        }

        // Rename foreign keys in sale_items
        if (Schema::hasColumn('sale_items', 'medicine_id')) {
            Schema::table('sale_items', function (Blueprint $table) {
                $table->renameColumn('medicine_id', 'product_id');
            });
        }

        // Rename foreign keys in return_items
        if (Schema::hasColumn('return_items', 'medicine_id')) {
            Schema::table('return_items', function (Blueprint $table) {
                $table->renameColumn('medicine_id', 'product_id');
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasColumn('return_items', 'product_id')) {
            Schema::table('return_items', function (Blueprint $table) {
                $table->renameColumn('product_id', 'medicine_id');
            });
        }

        if (Schema::hasColumn('sale_items', 'product_id')) {
            Schema::table('sale_items', function (Blueprint $table) {
                $table->renameColumn('product_id', 'medicine_id');
            });
        }

        if (Schema::hasColumn('prescription_items', 'product_id')) {
            Schema::table('prescription_items', function (Blueprint $table) {
                $table->renameColumn('product_id', 'medicine_id');
            });
        }

        if (Schema::hasColumn('prescriptions', 'substituted_product_id')) {
            Schema::table('prescriptions', function (Blueprint $table) {
                $table->renameColumn('substituted_product_id', 'substituted_medicine_id');
            });
        }

        if (Schema::hasColumn('purchase_order_items', 'product_id')) {
            Schema::table('purchase_order_items', function (Blueprint $table) {
                $table->renameColumn('product_id', 'medicine_id');
            });
        }

        if (Schema::hasColumn('stock_movements', 'product_id')) {
            Schema::table('stock_movements', function (Blueprint $table) {
                $table->renameColumn('product_id', 'medicine_id');
            });
        }

        if (Schema::hasColumn('stock_batches', 'product_id')) {
            Schema::table('stock_batches', function (Blueprint $table) {
                $table->renameColumn('product_id', 'medicine_id');
            });
        }

        if (Schema::hasTable('stock_batches')) {
            Schema::rename('stock_batches', 'inventories');
        }
        
        if (Schema::hasTable('products')) {
            Schema::rename('products', 'medicines');
        }
    }
};
