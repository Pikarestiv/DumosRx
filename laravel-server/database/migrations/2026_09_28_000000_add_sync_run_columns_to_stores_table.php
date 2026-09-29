<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            $table->string('last_sync_run_id', 64)->nullable()->after('last_sync_at');
            $table->timestamp('last_sync_run_started_at')->nullable()->after('last_sync_run_id');
        });
    }

    public function down(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            $table->dropColumn(['last_sync_run_id', 'last_sync_run_started_at']);
        });
    }
};
