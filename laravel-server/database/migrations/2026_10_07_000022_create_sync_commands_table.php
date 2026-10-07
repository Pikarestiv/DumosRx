<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Operator intents a device acts on during its next sync. Deliberately a
 * queue rather than an RPC: the device is offline-first and may not sync for
 * hours, so every command is eventually-consistent by construction and the
 * UI has to distinguish issued from applied.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sync_commands', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('store_id');
            $table->string('device_id', 191)->nullable();
            $table->string('action', 32);
            $table->string('table_name', 64)->nullable();
            $table->string('record_id', 64)->nullable();

            $table->uuid('issued_by')->nullable();
            $table->string('status', 24)->default('pending');
            $table->text('result')->nullable();

            $table->timestamp('issued_at');
            $table->timestamp('acted_at')->nullable();
            $table->timestamps();

            $table->index(['store_id', 'device_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sync_commands');
    }
};
