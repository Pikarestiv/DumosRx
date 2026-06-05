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
        // Update users table
        DB::table('users')
            ->where('role', 'pharmacist')
            ->update(['role' => 'specialist']);
            
        DB::table('users')
            ->where('role', 'pharmacy_owner')
            ->update(['role' => 'store_owner']);

        // Update roles table
        DB::table('roles')
            ->where('slug', 'pharmacist')
            ->update([
                'slug' => 'specialist',
                'name' => 'Specialist / Senior Staff',
                'description' => 'Specialist staff or clinician'
            ]);
            
        DB::table('roles')
            ->where('slug', 'pharmacy_owner')
            ->update([
                'slug' => 'store_owner',
                'name' => 'Store Owner',
                'description' => 'Store owner with full permissions'
            ]);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // Revert users table
        DB::table('users')
            ->where('role', 'specialist')
            ->update(['role' => 'pharmacist']);
            
        DB::table('users')
            ->where('role', 'store_owner')
            ->update(['role' => 'pharmacy_owner']);

        // Revert roles table
        DB::table('roles')
            ->where('slug', 'specialist')
            ->update([
                'slug' => 'pharmacist',
                'name' => 'Pharmacist',
                'description' => 'Clinical staff'
            ]);
            
        DB::table('roles')
            ->where('slug', 'store_owner')
            ->update([
                'slug' => 'pharmacy_owner',
                'name' => 'Pharmacy Owner',
                'description' => 'Pharmacy owner'
            ]);
    }
};
