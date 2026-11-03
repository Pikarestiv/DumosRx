<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('storefront_prescriptions', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('storefront_id')->nullable();
            $table->uuid('store_id');
            $table->string('prescription_number')->unique();
            $table->string('customer_name');
            $table->string('customer_phone');
            $table->string('file_path');
            $table->text('notes')->nullable();
            $table->enum('status', ['pending', 'reviewed', 'quoted', 'dispensed', 'rejected'])->default('pending');
            $table->timestamps();
            $table->softDeletes();

            $table->foreign('storefront_id')->references('id')->on('storefronts')->nullOnDelete();
            $table->foreign('store_id')->references('id')->on('stores')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('storefront_prescriptions');
    }
};

