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
        Schema::table('prescription_items', function (Blueprint $table) {
            $table->integer('refills_authorized')->default(0);
            $table->integer('refills_used')->default(0);
            $table->integer('refill_interval_days')->default(30);
            $table->string('next_refill_date')->nullable();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('prescription_items', function (Blueprint $table) {
            $table->dropColumn([
                'refills_authorized',
                'refills_used',
                'refill_interval_days',
                'next_refill_date'
            ]);
        });
    }
};
