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
            $table->dropForeign('medicines_supplier_id_foreign');
            $table->dropColumn(['brand_name', 'supplier_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->string('brand_name')->nullable();
            $table->uuid('supplier_id')->nullable()->index();
            $table->foreign('supplier_id', 'medicines_supplier_id_foreign')->references('id')->on('suppliers')->onDelete('set null');
        });
    }
};
