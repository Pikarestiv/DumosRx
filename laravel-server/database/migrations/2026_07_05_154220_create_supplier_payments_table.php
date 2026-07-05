<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('supplier_payments', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('supplier_id');
            $table->uuid('po_id')->nullable();
            $table->decimal('amount', 12, 2);
            $table->timestamp('payment_date')->nullable();
            $table->string('payment_method')->nullable();
            $table->text('reference_note')->nullable();
            $table->integer('_version')->default(1);
            $table->boolean('_synced')->default(false);
            $table->boolean('_deleted')->default(false);
            $table->timestamp('_synced_at')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('supplier_payments');
    }
};
