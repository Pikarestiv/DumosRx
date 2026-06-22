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
        Schema::create('returns', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('sale_id')->constrained()->cascadeOnDelete();
            $table->foreignUuid('user_id')->constrained('users')->cascadeOnDelete();
            $table->text('reason')->nullable();
            $table->decimal('total_refunded', 10, 2)->default(0.00);
            $table->timestamps();
            $table->softDeletes();
            
            // Sync tracking columns
            $table->integer('_version')->default(1);
            $table->boolean('_synced')->default(0);
            $table->timestamp('_synced_at')->nullable();
            $table->boolean('_deleted')->default(0);
        });

        Schema::create('return_items', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('return_id')->constrained('returns')->cascadeOnDelete();
            $table->foreignUuid('medicine_id')->constrained()->cascadeOnDelete();
            $table->integer('quantity');
            $table->decimal('unit_price', 10, 2);
            $table->decimal('subtotal', 10, 2);
            $table->timestamps();
            $table->softDeletes();
            
            // Sync tracking columns
            $table->integer('_version')->default(1);
            $table->boolean('_synced')->default(0);
            $table->timestamp('_synced_at')->nullable();
            $table->boolean('_deleted')->default(0);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('return_items');
        Schema::dropIfExists('returns');
    }
};
