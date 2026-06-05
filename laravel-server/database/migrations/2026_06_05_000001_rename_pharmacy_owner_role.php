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
        // Rename roles for existing users
        DB::table('users')
            ->where('role', 'pharmacy_owner')
            ->update(['role' => 'store_owner']);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        DB::table('users')
            ->where('role', 'store_owner')
            ->update(['role' => 'pharmacy_owner']);
    }
};
