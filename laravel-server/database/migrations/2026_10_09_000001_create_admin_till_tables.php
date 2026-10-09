<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Read-only on-till inspection credentials and sessions. See
 * docs/superpowers/specs/2026-10-09-on-till-admin-inspection-design.md.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('admin_till_codes', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('admin_id');
            $table->string('code_hash');
            $table->string('label', 64)->nullable();
            $table->timestamp('last_used_at')->nullable();
            $table->timestamp('revoked_at')->nullable();
            $table->timestamps();

            $table->index(['admin_id', 'revoked_at']);
        });

        Schema::create('admin_till_sessions', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('admin_id');
            $table->uuid('store_id')->nullable();
            // 64, not 191: the index budget on the production server is 1000
            // bytes under utf8mb4 and sync_commands already hit that ceiling.
            $table->string('device_id', 64);
            $table->timestamp('started_at');
            $table->timestamp('expires_at');
            $table->timestamp('ended_at')->nullable();
            $table->string('end_reason', 24)->nullable();
            $table->timestamps();

            $table->index(['admin_id', 'ended_at']);
            $table->index('expires_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('admin_till_sessions');
        Schema::dropIfExists('admin_till_codes');
    }
};
