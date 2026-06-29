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
        Schema::table('sales', function (Blueprint $table) {
            if (!Schema::hasColumn('sales', 'discount_type')) {
                $table->string('discount_type')->default('fixed')->after('discount_amount');
            }
            if (!Schema::hasColumn('sales', 'discount_total')) {
                $table->decimal('discount_total', 10, 2)->default(0.00)->after('subtotal');
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('sales', function (Blueprint $table) {
            if (Schema::hasColumn('sales', 'discount_type')) {
                $table->dropColumn('discount_type');
            }
            if (Schema::hasColumn('sales', 'discount_total')) {
                $table->dropColumn('discount_total');
            }
        });
    }
};
