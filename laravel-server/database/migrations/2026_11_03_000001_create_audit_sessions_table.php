<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('audit_sessions', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('store_id')->index();
            $table->uuid('created_by')->index();
            $table->string('name')->nullable();
            $table->text('notes')->nullable();
            $table->string('status', 32)->default('in_progress')->index();
            $table->string('active_till_id')->nullable()->index();
            $table->string('active_till_name')->nullable();
            $table->uuid('active_user_id')->nullable()->index();
            $table->unsignedInteger('lease_version')->default(1);
            $table->timestamp('lease_expires_at')->nullable()->index();
            $table->unsignedInteger('total_items_count')->default(0);
            $table->unsignedInteger('counted_items_count')->default(0);
            $table->string('submitted_stock_audit_id')->nullable()->index();
            $table->timestamp('started_at')->useCurrent();
            $table->timestamp('completed_at')->nullable();
            $table->timestamp('last_synced_at')->nullable();
            $table->timestamps();

            $table->foreign('store_id')->references('id')->on('stores')->cascadeOnDelete();
            $table->foreign('created_by')->references('id')->on('users')->cascadeOnDelete();
            $table->foreign('active_user_id')->references('id')->on('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('audit_sessions');
    }
};
