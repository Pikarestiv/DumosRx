<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Per-table agreement between one device and the cloud. Stock already had
 * `device_stock_reports`; every other synced table had no instrument at all.
 * One row per device, replaced on each report, with both sides frozen in a
 * bounded JSON column so a historical snapshot never changes meaning.
 * See docs/DEVICE_TABLE_AGREEMENT.md.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('device_table_reports', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('store_id');
            $table->string('device_id', 191);
            $table->uuid('user_id')->nullable();

            $table->unsignedSmallInteger('diverged_count')->default(0);
            $table->json('tables')->nullable();

            $table->timestamp('reported_at');
            $table->timestamps();

            $table->unique(['store_id', 'device_id']);
            $table->index(['store_id', 'diverged_count']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('device_table_reports');
    }
};
