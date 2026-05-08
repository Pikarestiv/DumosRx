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
        $tables = [
            'sales', 
            'customers', 
            'medicines', 
            'inventory', 
            'subscriptions', 
            'payment_transactions',
            'categories',
            'suppliers',
            'prescriptions'
        ];

        foreach ($tables as $tableName) {
            if (Schema::hasTable($tableName) && !Schema::hasColumn($tableName, 'user_id')) {
                Schema::table($tableName, function (Blueprint $table) {
                    // Use UUID if users table uses UUID, otherwise bigInteger
                    $table->foreignUuid('user_id')->nullable()->constrained('users')->onDelete('cascade');
                });
            }
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        $tables = [
            'sales', 
            'customers', 
            'medicines', 
            'inventory', 
            'subscriptions', 
            'payment_transactions',
            'categories',
            'suppliers',
            'prescriptions'
        ];

        foreach ($tables as $tableName) {
            if (Schema::hasTable($tableName) && Schema::hasColumn($tableName, 'user_id')) {
                Schema::table($tableName, function (Blueprint $table) use ($tableName) {
                    $table->dropForeign([$tableName . '_user_id_foreign']);
                    $table->dropColumn('user_id');
                });
            }
        }
    }
};
