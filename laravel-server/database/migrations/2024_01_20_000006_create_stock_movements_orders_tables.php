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
        // Stock Movements
        Schema::create('stock_movements', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('inventory_id')->constrained();
            $table->foreignUuid('medicine_id')->constrained();
            $table->enum('movement_type', ['purchase', 'sale', 'adjustment', 'transfer', 'return', 'expired', 'damaged']);
            $table->integer('quantity'); // + or -
            $table->decimal('unit_cost', 10, 2)->nullable();
            $table->decimal('total_cost', 10, 2)->nullable();
            $table->uuid('reference_id')->nullable(); // sale_id or po_id
            $table->string('reference_type')->nullable(); // 'sale', 'purchase_order'
            $table->text('reason')->nullable();
            $table->foreignUuid('performed_by')->constrained('users');
            $table->timestamp('movement_date')->useCurrent();
            $table->timestamps();
        });

        // Purchase Orders
        Schema::create('purchase_orders', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('order_number', 50)->unique();
            $table->foreignUuid('supplier_id')->constrained();
            $table->foreignUuid('ordered_by')->constrained('users');
            $table->enum('status', ['pending', 'approved', 'ordered', 'received', 'cancelled'])->default('pending');
            $table->date('order_date')->useCurrent();
            $table->date('expected_delivery_date')->nullable();
            $table->date('actual_delivery_date')->nullable();
            $table->decimal('subtotal', 12, 2)->default(0.00);
            $table->decimal('tax_amount', 12, 2)->default(0.00);
            $table->decimal('total_amount', 12, 2)->default(0.00);
            $table->text('notes')->nullable();
            $table->timestamps();
        });

        // Purchase Order Items
        Schema::create('purchase_order_items', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('purchase_order_id')->constrained()->cascadeOnDelete();
            $table->foreignUuid('medicine_id')->constrained();
            $table->integer('quantity_ordered');
            $table->integer('quantity_received')->default(0);
            $table->decimal('unit_cost', 10, 2);
            $table->decimal('total_cost', 10, 2);
            $table->string('batch_number')->nullable();
            $table->date('expiry_date')->nullable();
            $table->enum('status', ['pending', 'received', 'partial', 'cancelled'])->default('pending');
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('purchase_order_items');
        Schema::dropIfExists('purchase_orders');
        Schema::dropIfExists('stock_movements');
    }
};
