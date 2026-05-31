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
        Schema::table('stores', function (Blueprint $table) {
            $table->string('store_slug')->nullable()->unique()->after('name');
        });

        Schema::table('medicines', function (Blueprint $table) {
            $table->boolean('show_online')->default(false)->after('is_active');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('medicines', function (Blueprint $table) {
            $table->dropColumn('show_online');
        });

        Schema::table('stores', function (Blueprint $table) {
            $table->dropColumn('store_slug');
        });
    }
};
