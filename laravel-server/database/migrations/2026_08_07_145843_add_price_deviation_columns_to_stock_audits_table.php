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
        Schema::table('stock_audits', function (Blueprint $table) {
            $table->decimal('expected_cost_price', 12, 2)->nullable();
            $table->decimal('actual_cost_price', 12, 2)->nullable();
            $table->decimal('cost_price_difference', 12, 2)->nullable();
            $table->decimal('expected_selling_price', 12, 2)->nullable();
            $table->decimal('actual_selling_price', 12, 2)->nullable();
            $table->decimal('selling_price_difference', 12, 2)->nullable();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('stock_audits', function (Blueprint $table) {
            $table->dropColumn([
                'expected_cost_price',
                'actual_cost_price',
                'cost_price_difference',
                'expected_selling_price',
                'actual_selling_price',
                'selling_price_difference',
            ]);
        });
    }
};
