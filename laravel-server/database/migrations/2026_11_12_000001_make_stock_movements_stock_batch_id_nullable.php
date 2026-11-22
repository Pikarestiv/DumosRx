<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() === 'mysql') {
            DB::statement('ALTER TABLE stock_movements MODIFY stock_batch_id CHAR(36) NULL');
        } else {
            Schema::table('stock_movements', function (Blueprint $table) {
                $table->uuid('stock_batch_id')->nullable()->change();
            });
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'mysql') {
            DB::statement('ALTER TABLE stock_movements MODIFY stock_batch_id CHAR(36) NOT NULL');
        } else {
            Schema::table('stock_movements', function (Blueprint $table) {
                $table->uuid('stock_batch_id')->nullable(false)->change();
            });
        }
    }
};
