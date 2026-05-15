<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            // Drop foreign key if exists (robust check)
            $conn = Schema::getConnection();
            $dbName = $conn->getDatabaseName();
            $exists = collect(DB::select("
                SELECT CONSTRAINT_NAME 
                FROM information_schema.TABLE_CONSTRAINTS 
                WHERE CONSTRAINT_SCHEMA = ? 
                AND TABLE_NAME = 'stores' 
                AND CONSTRAINT_NAME = 'stores_user_id_foreign' 
                AND CONSTRAINT_TYPE = 'FOREIGN KEY'
            ", [$dbName]))->isNotEmpty();

            if ($exists) {
                $table->dropForeign(['user_id']);
            }
            
            // Change user_id to UUID
            $table->uuid('user_id')->change();
            
            // Re-add constraint
            $table->foreign('user_id')->references('id')->on('users')->onDelete('cascade');
        });
    }

    public function down(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            $conn = Schema::getConnection();
            $dbName = $conn->getDatabaseName();
            $exists = collect(DB::select("
                SELECT CONSTRAINT_NAME 
                FROM information_schema.TABLE_CONSTRAINTS 
                WHERE CONSTRAINT_SCHEMA = ? 
                AND TABLE_NAME = 'stores' 
                AND CONSTRAINT_NAME = 'stores_user_id_foreign' 
                AND CONSTRAINT_TYPE = 'FOREIGN KEY'
            ", [$dbName]))->isNotEmpty();

            if ($exists) {
                $table->dropForeign(['user_id']);
            }
            $table->unsignedBigInteger('user_id')->change();
            $table->foreign('user_id')->references('id')->on('users')->onDelete('cascade');
        });
    }
};
