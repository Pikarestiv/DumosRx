<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('permission_user', function (Blueprint $table) {
            $table->boolean('granted')->default(true)->after('permission_id');
            $table->unique(['user_id', 'permission_id']);
        });
    }

    public function down(): void
    {
        Schema::table('permission_user', function (Blueprint $table) {
            $table->dropUnique(['user_id', 'permission_id']);
            $table->dropColumn('granted');
        });
    }
};
