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
        Schema::create('requested_products', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('product_name');
            $table->string('requested_by_customer')->nullable();
            $table->integer('request_count')->default(1);
            $table->string('status')->default('pending'); // pending, ordered
            
            // Sync Engine Requirements
            $table->integer('_version')->default(1);
            $table->boolean('_synced')->default(true);
            $table->boolean('_deleted')->default(false);
            $table->timestamp('_synced_at')->nullable();
            $table->uuid('store_id')->nullable();

            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('requested_products');
    }
};
