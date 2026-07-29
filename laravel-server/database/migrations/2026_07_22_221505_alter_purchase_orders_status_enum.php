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
        // MySQL's MODIFY COLUMN syntax isn't valid SQL on SQLite (used for
        // the test suite), which broke every Feature test that migrates
        // fresh. SQLite has no real ENUM/MODIFY concept anyway, so the
        // portable Schema builder path is equivalent there.
        if (DB::getDriverName() === 'sqlite') {
            Schema::table('purchase_orders', function (Blueprint $table) {
                $table->string('status')->default('pending')->change();
            });
            return;
        }

        DB::statement("ALTER TABLE purchase_orders MODIFY COLUMN status VARCHAR(255) DEFAULT 'pending'");
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (DB::getDriverName() === 'sqlite') {
            Schema::table('purchase_orders', function (Blueprint $table) {
                $table->string('status')->default('pending')->change();
            });
            return;
        }

        DB::statement("ALTER TABLE purchase_orders MODIFY COLUMN status ENUM('pending', 'approved', 'ordered', 'received', 'cancelled') DEFAULT 'pending'");
    }
};
