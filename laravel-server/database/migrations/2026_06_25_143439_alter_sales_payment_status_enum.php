<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (DB::getDriverName() !== 'sqlite') {
            DB::statement("ALTER TABLE sales MODIFY COLUMN payment_status ENUM('pending', 'completed', 'failed', 'refunded', 'partially_refunded') DEFAULT 'completed'");
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (DB::getDriverName() !== 'sqlite') {
            DB::statement("ALTER TABLE sales MODIFY COLUMN payment_status ENUM('pending', 'completed', 'failed', 'refunded') DEFAULT 'completed'");
        }
    }
};
