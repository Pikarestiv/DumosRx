<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // Introspect existing FKs via information_schema (Laravel 11 compatible — no Doctrine DBAL).
        $existingFks = collect(
            DB::select(
                "SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
                 WHERE TABLE_SCHEMA = DATABASE()
                   AND TABLE_NAME = 'products'
                   AND CONSTRAINT_TYPE = 'FOREIGN KEY'"
            )
        )->pluck('CONSTRAINT_NAME')->toArray();

        // The FK was named after the old table ('medicines') in some envs; 'products' in others.
        $fkToDrop = null;
        foreach (['medicines_supplier_id_foreign', 'products_supplier_id_foreign'] as $candidate) {
            if (in_array($candidate, $existingFks)) {
                $fkToDrop = $candidate;
                break;
            }
        }

        if ($fkToDrop) {
            Schema::table('products', function (Blueprint $table) use ($fkToDrop) {
                $table->dropForeign($fkToDrop);
            });
        }

        // Only drop columns that actually exist (idempotent).
        $existing = Schema::getColumnListing('products');
        $toDrop = array_intersect(['brand_name', 'supplier_id'], $existing);

        if (!empty($toDrop)) {
            Schema::table('products', function (Blueprint $table) use ($toDrop) {
                $table->dropColumn(array_values($toDrop));
            });
        }
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
