<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * What each device says is sitting in its own `_sync_queue`. The server has
 * never seen a stuck row — that is what being stuck means — so "what is
 * stuck" was only ever inferred. One row per device, replaced on each
 * report; stuck items live in a bounded JSON column carrying metadata only,
 * never payloads.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('device_queue_reports', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('store_id');
            $table->string('device_id', 191);
            $table->uuid('user_id')->nullable();

            $table->unsignedInteger('queue_depth')->default(0);
            $table->unsignedInteger('stuck_count')->default(0);
            $table->json('stuck_items')->nullable();

            $table->timestamp('reported_at');
            $table->timestamps();

            $table->unique(['store_id', 'device_id']);
            $table->index(['store_id', 'stuck_count']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('device_queue_reports');
    }
};
