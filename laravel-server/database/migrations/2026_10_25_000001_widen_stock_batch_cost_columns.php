<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/** A-271: decimal(10,2) refuses a cost of 100,000,000 or more for ever. MySQL rebuilds the table per MODIFY, so stock_movements gets one. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stock_batches', function (Blueprint $table) {
            $table->decimal('cost_price', 15, 2)->default(0)->change();
        });
        if (DB::getDriverName() === 'mysql') {
            DB::statement('ALTER TABLE stock_movements MODIFY unit_cost DECIMAL(15,2) NULL, MODIFY total_cost DECIMAL(15,2) NULL');
        } else {
            Schema::table('stock_movements', function (Blueprint $table) {
                $table->decimal('unit_cost', 15, 2)->nullable()->change();
                $table->decimal('total_cost', 15, 2)->nullable()->change();
            });
        }
        Schema::table('sale_items', function (Blueprint $table) {
            $table->decimal('cost_price', 15, 2)->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('stock_batches', function (Blueprint $table) {
            $table->decimal('cost_price', 10, 2)->default(0)->change();
        });
        Schema::table('stock_movements', function (Blueprint $table) {
            $table->decimal('unit_cost', 10, 2)->nullable()->change();
            $table->decimal('total_cost', 10, 2)->nullable()->change();
        });
        Schema::table('sale_items', function (Blueprint $table) {
            $table->decimal('cost_price', 10, 2)->nullable()->change();
        });
    }
};
