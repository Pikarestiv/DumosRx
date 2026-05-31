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
        Schema::table('payment_accounts', function (Blueprint $table) {
            $table->uuid('user_id')->nullable()->after('id')->index();
            $table->uuid('store_id')->nullable()->after('user_id')->index();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('payment_accounts', function (Blueprint $table) {
            $table->dropColumn(['user_id', 'store_id']);
        });
    }
};
