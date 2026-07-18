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
        Schema::table('expenses', function (Blueprint $table) {
            if (!Schema::hasColumn('expenses', 'user_id')) {
                $table->uuid('user_id')->nullable()->after('store_id');
            }
        });

        Schema::table('prescriptions', function (Blueprint $table) {
            if (!Schema::hasColumn('prescriptions', 'user_id')) {
                $table->uuid('user_id')->nullable()->after('store_id');
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('expenses', function (Blueprint $table) {
            $table->dropColumn('user_id');
        });

        Schema::table('prescriptions', function (Blueprint $table) {
            $table->dropColumn('user_id');
        });
    }
};
