<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('audit_session_items', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('audit_session_id')->index();
            $table->uuid('product_id')->index();
            $table->decimal('system_quantity', 15, 2)->default(0);
            $table->decimal('counted_quantity', 15, 2)->nullable();
            $table->decimal('cost_price', 15, 2)->nullable();
            $table->decimal('counted_cost_price', 15, 2)->nullable();
            $table->decimal('selling_price', 15, 2)->nullable();
            $table->decimal('counted_selling_price', 15, 2)->nullable();
            $table->boolean('counted')->default(false)->index();
            $table->text('notes')->nullable();
            $table->timestamp('counted_at')->nullable();
            $table->timestamps();

            $table->foreign('audit_session_id')->references('id')->on('audit_sessions')->cascadeOnDelete();
            $table->foreign('product_id')->references('id')->on('products')->cascadeOnDelete();
            $table->unique(['audit_session_id', 'product_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('audit_session_items');
    }
};

