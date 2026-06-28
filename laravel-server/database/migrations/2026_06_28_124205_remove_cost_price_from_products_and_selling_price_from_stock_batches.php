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
        Schema::table('products', function (Blueprint $table) {
            $table->dropColumn('cost_price');
        });

        Schema::table('stock_batches', function (Blueprint $table) {
            $table->dropColumn('selling_price');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->decimal('cost_price', 10, 2)->default(0)->after('pack_size');
        });

        Schema::table('stock_batches', function (Blueprint $table) {
            $table->decimal('selling_price', 10, 2)->nullable()->after('cost_price');
        });
    }
};
