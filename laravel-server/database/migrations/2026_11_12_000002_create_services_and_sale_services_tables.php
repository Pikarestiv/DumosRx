<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('services')) {
            Schema::create('services', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->foreignUuid('store_id')->nullable()->constrained()->nullOnDelete();
                $table->string('name');
                $table->string('code')->nullable();
                $table->text('description')->nullable();
                $table->string('category')->nullable();
                $table->decimal('price', 12, 2)->default(0.00);
                $table->boolean('is_active')->default(true);
                $table->timestamps();
                $table->softDeletes();

                $table->integer('_version')->default(1);
                $table->boolean('_synced')->default(0);
                $table->timestamp('_synced_at')->nullable();
                $table->boolean('_deleted')->default(0);

                $table->index('store_id');
                $table->index('name');
            });
        }

        if (! Schema::hasTable('sale_services')) {
            Schema::create('sale_services', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->foreignUuid('store_id')->nullable()->index();
                $table->foreignUuid('sale_id')->constrained()->cascadeOnDelete();
                $table->uuid('service_id')->nullable();
                $table->string('service_name');
                $table->integer('quantity')->default(1);
                $table->decimal('unit_price', 12, 2)->default(0.00);
                $table->decimal('total_price', 12, 2)->default(0.00);
                $table->text('notes')->nullable();
                $table->timestamps();
                $table->softDeletes();

                $table->integer('_version')->default(1);
                $table->boolean('_synced')->default(0);
                $table->timestamp('_synced_at')->nullable();
                $table->boolean('_deleted')->default(0);

                $table->index('sale_id');
                $table->index('service_id');
            });
        }

        if (! Schema::hasTable('return_services')) {
            Schema::create('return_services', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->foreignUuid('store_id')->nullable()->index();
                $table->foreignUuid('return_id')->constrained('returns')->cascadeOnDelete();
                $table->uuid('sale_service_id')->nullable();
                $table->integer('quantity')->default(1);
                $table->decimal('refund_amount', 12, 2)->default(0.00);
                $table->string('reason')->nullable();
                $table->timestamps();
                $table->softDeletes();

                $table->integer('_version')->default(1);
                $table->boolean('_synced')->default(0);
                $table->timestamp('_synced_at')->nullable();
                $table->boolean('_deleted')->default(0);

                $table->index('return_id');
                $table->index('sale_service_id');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('return_services');
        Schema::dropIfExists('sale_services');
        Schema::dropIfExists('services');
    }
};
