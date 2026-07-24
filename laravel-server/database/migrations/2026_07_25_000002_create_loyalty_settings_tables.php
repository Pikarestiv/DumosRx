<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('loyalty_tiers')) {
            Schema::create('loyalty_tiers', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('user_id')->nullable();
                $table->string('name');
                $table->decimal('min_spend', 12, 2)->default(0);
                $table->decimal('points_multiplier', 6, 2)->default(1);
                $table->text('benefits')->nullable();
                $table->string('color')->default('bg-gray-400');
                $table->integer('sort_order')->default(0);
                $table->timestamps();
                $table->integer('_version')->default(1);
                $table->boolean('_synced')->default(0);
                $table->timestamp('_synced_at')->nullable();
                $table->boolean('_deleted')->default(0);
                $table->softDeletes();
            });
        }

        if (!Schema::hasTable('loyalty_redemption_options')) {
            Schema::create('loyalty_redemption_options', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('user_id')->nullable();
                $table->string('label');
                $table->decimal('points_cost', 10, 2)->default(0);
                $table->text('description')->nullable();
                $table->string('icon_key')->default('tag');
                $table->boolean('is_active')->default(true);
                $table->integer('sort_order')->default(0);
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
        Schema::dropIfExists('loyalty_redemption_options');
        Schema::dropIfExists('loyalty_tiers');
    }
};
