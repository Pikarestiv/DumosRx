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
        // information_schema.TABLE_CONSTRAINTS is MySQL-only; invalid SQL on
        // SQLite (used for the test suite). SQLite doesn't enforce FK
        // constraints the same way MySQL does, so there's nothing to
        // introspect/drop there; skip straight to the idempotent column drop.
        if (DB::getDriverName() !== 'sqlite') {
            // Introspect existing FKs via information_schema (Laravel 11 compatible, no Doctrine DBAL).
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
        }

        // Only drop columns that actually exist (idempotent).
        $existing = Schema::getColumnListing('products');
        $wanted = ['brand_name', 'supplier_id'];

        // SQLite defines foreign keys inline in the CREATE TABLE statement
        // rather than as separately-droppable constraints, so its native
        // DROP COLUMN refuses on a column referenced by one, regardless of
        // the foreign_keys pragma, which only controls runtime enforcement,
        // not this schema-validity check. Test DBs are rebuilt from scratch
        // every run, so leaving supplier_id in place there is harmless;
        // nothing depends on its absence.
        if (DB::getDriverName() === 'sqlite') {
            $wanted = ['brand_name'];
        }

        $toDrop = array_intersect($wanted, $existing);

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
