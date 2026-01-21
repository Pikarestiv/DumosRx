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
        // Categories
        Schema::create('categories', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name', 100)->unique();
            $table->text('description')->nullable();
            $table->foreignUuid('parent_id')->nullable()->constrained('categories')->nullOnDelete();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        // Suppliers
        Schema::create('suppliers', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name', 200);
            $table->string('contact_person', 100)->nullable();
            $table->string('email')->nullable();
            $table->string('phone')->nullable();
            $table->text('address')->nullable();
            $table->string('city', 100)->nullable();
            $table->string('state', 100)->nullable();
            $table->string('country', 100)->default('Nigeria');
            $table->string('tax_id')->nullable();
            $table->integer('payment_terms')->default(30);
            $table->boolean('is_active')->default(true);
            $table->decimal('rating', 2, 1)->default(0.0);
            $table->timestamps();
        });

        // Medicines
        Schema::create('medicines', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name', 200);
            $table->string('generic_name', 200)->nullable();
            $table->string('brand_name', 200)->nullable();
            $table->foreignUuid('category_id')->nullable()->constrained()->nullOnDelete();
            $table->string('manufacturer')->nullable();
            $table->foreignUuid('supplier_id')->nullable()->constrained()->nullOnDelete();
            $table->string('nafdac_number')->nullable();
            $table->string('dosage_form')->nullable(); // tablet, syrup etc
            $table->string('strength')->nullable(); // 500mg
            $table->integer('pack_size')->default(1);
            $table->string('unit_of_measure')->default('piece');
            $table->text('description')->nullable();
            $table->text('indications')->nullable();
            $table->text('contraindications')->nullable();
            $table->text('side_effects')->nullable();
            $table->text('storage_conditions')->nullable();
            $table->boolean('requires_prescription')->default(false);
            $table->boolean('is_controlled')->default(false);
            $table->boolean('is_active')->default(true);
            $table->decimal('cost_price', 10, 2)->default(0.00);
            $table->decimal('selling_price', 10, 2)->default(0.00);
            $table->decimal('markup_percentage', 5, 2)->default(0.00);
            $table->string('barcode')->nullable()->index();
            $table->timestamps();

            // Full text index - syntax depends on DB driver, adding simple indexes for now
            // $table->index(['name', 'generic_name']);
        });

        // Inventory
        Schema::create('inventory', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('medicine_id')->constrained()->cascadeOnDelete();
            $table->string('batch_number');
            $table->integer('quantity_in_stock')->default(0);
            $table->integer('quantity_reserved')->default(0);
            $table->integer('reorder_level')->default(10);
            $table->integer('max_stock_level')->default(1000);
            $table->decimal('cost_price', 10, 2);
            $table->decimal('selling_price', 10, 2);
            $table->date('manufacture_date')->nullable();
            $table->date('expiry_date');
            $table->foreignUuid('supplier_id')->nullable()->constrained()->nullOnDelete();
            $table->string('location')->nullable(); // Shelf location
            $table->enum('status', ['active', 'expired', 'damaged', 'recalled'])->default('active');
            $table->timestamps();

            $table->unique(['medicine_id', 'batch_number']);
            $table->index('expiry_date');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('inventory');
        Schema::dropIfExists('medicines');
        Schema::dropIfExists('suppliers');
        Schema::dropIfExists('categories');
    }
};
