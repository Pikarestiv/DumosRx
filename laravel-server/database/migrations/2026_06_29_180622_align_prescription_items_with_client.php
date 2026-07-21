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
        if (\Illuminate\Support\Facades\DB::getDriverName() !== 'sqlite') {
            try {
                \Illuminate\Support\Facades\DB::statement('ALTER TABLE prescription_items DROP FOREIGN KEY prescription_items_medicine_id_foreign');
            } catch (\Exception $e) {}

            try {
                \Illuminate\Support\Facades\DB::statement('ALTER TABLE prescription_items DROP FOREIGN KEY prescription_items_product_id_foreign');
            } catch (\Exception $e) {}
        }

        Schema::table('prescription_items', function (Blueprint $table) {
            if (Schema::hasColumn('prescription_items', 'product_id') && \Illuminate\Support\Facades\DB::getDriverName() !== 'sqlite') {
                $table->dropColumn('product_id');
            }
            if (Schema::hasColumn('prescription_items', 'quantity_prescribed') && \Illuminate\Support\Facades\DB::getDriverName() !== 'sqlite') {
                $table->dropColumn('quantity_prescribed');
            }
            if (Schema::hasColumn('prescription_items', 'quantity_dispensed') && \Illuminate\Support\Facades\DB::getDriverName() !== 'sqlite') {
                $table->dropColumn('quantity_dispensed');
            }
            if (Schema::hasColumn('prescription_items', 'status') && \Illuminate\Support\Facades\DB::getDriverName() !== 'sqlite') {
                $table->dropColumn('status');
            }

            if (!Schema::hasColumn('prescription_items', 'product_name')) {
                $table->string('product_name')->nullable();
            }
            if (!Schema::hasColumn('prescription_items', 'strength')) {
                $table->string('strength')->nullable();
            }
            if (!Schema::hasColumn('prescription_items', 'quantity')) {
                $table->integer('quantity')->default(1);
            }
            if (!Schema::hasColumn('prescription_items', 'instructions')) {
                $table->text('instructions')->nullable();
            }
            if (!Schema::hasColumn('prescription_items', 'cost')) {
                $table->decimal('cost', 10, 2)->default(0);
            }
        });

        Schema::enableForeignKeyConstraints();
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('prescription_items', function (Blueprint $table) {
            $table->uuid('product_id')->nullable();
            $table->integer('quantity_prescribed')->default(0);
            $table->integer('quantity_dispensed')->default(0);
            $table->string('status')->default('pending');

            $table->dropColumn('product_name');
            $table->dropColumn('strength');
            $table->dropColumn('quantity');
            $table->dropColumn('instructions');
            $table->dropColumn('cost');
        });
    }
};
