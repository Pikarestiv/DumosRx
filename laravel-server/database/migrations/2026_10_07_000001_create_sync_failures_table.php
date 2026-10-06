<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sync_failures', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('store_id')->nullable();
            $table->uuid('user_id')->nullable();
            $table->string('table_name');
            $table->string('record_id')->nullable();
            $table->string('operation', 16)->nullable();
            $table->string('reason');
            $table->timestamp('created_at')->nullable();

            $table->index(['store_id', 'created_at']);
            $table->index(['reason', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sync_failures');
    }
};
