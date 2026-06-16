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
        if (DB::connection()->getDriverName() === 'mysql') {
            DB::statement("ALTER TABLE coupons MODIFY COLUMN type ENUM('discount_percent', 'discount_amount', 'trial_extension') NOT NULL");
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (DB::connection()->getDriverName() === 'mysql') {
            DB::statement("ALTER TABLE coupons MODIFY COLUMN type ENUM('discount_percent', 'trial_extension') NOT NULL");
        }
    }
};
