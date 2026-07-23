<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('purchase_orders', function (Blueprint $table) {
            DB::statement("ALTER TABLE purchase_orders MODIFY COLUMN status VARCHAR(255) DEFAULT 'pending'");
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('purchase_orders', function (Blueprint $table) {
            DB::statement("ALTER TABLE purchase_orders MODIFY COLUMN status ENUM('pending', 'approved', 'ordered', 'received', 'cancelled') DEFAULT 'pending'");
        });
    }
};
