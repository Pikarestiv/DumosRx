<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Per-device stock fingerprints. Both the device's numbers and the server's
 * are snapshotted at report time rather than recomputed on read, so a
 * historical row cannot change meaning later.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('device_stock_reports', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('store_id');
            $table->string('device_id', 191);
            $table->uuid('user_id')->nullable();

            $table->unsignedInteger('device_batch_count');
            $table->decimal('device_quantity_sum', 18, 3);
            $table->unsignedInteger('server_batch_count');
            $table->decimal('server_quantity_sum', 18, 3);

            $table->timestamp('reported_at');
            $table->timestamps();

            $table->unique(['store_id', 'device_id']);
            $table->index(['store_id', 'reported_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('device_stock_reports');
    }
};
