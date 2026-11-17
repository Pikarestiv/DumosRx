<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sync_failures', function (Blueprint $table) {
            $table->string('device_id')->nullable()->after('user_id');
            $table->index(['store_id', 'device_id']);
        });
    }

    public function down(): void
    {
        Schema::table('sync_failures', function (Blueprint $table) {
            $table->dropIndex(['store_id', 'device_id']);
            $table->dropColumn('device_id');
        });
    }
};
