<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('sale_item_batches')) {
            Schema::create('sale_item_batches', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('sale_item_id');
                $table->uuid('stock_batch_id');
                $table->integer('quantity');
                $table->timestamps();
                $table->integer('_version')->default(1);
                $table->boolean('_synced')->default(0);
                $table->timestamp('_synced_at')->nullable();
                $table->boolean('_deleted')->default(0);
                $table->softDeletes();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('sale_item_batches');
    }
};
