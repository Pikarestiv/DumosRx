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
        if (Schema::hasColumn('stock_batches', 'quantity_in_stock')) {
            Schema::table('stock_batches', function (Blueprint $table) {
                $table->renameColumn('quantity_in_stock', 'quantity');
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasColumn('stock_batches', 'quantity')) {
            Schema::table('stock_batches', function (Blueprint $table) {
                $table->renameColumn('quantity', 'quantity_in_stock');
            });
        }
    }
};
