<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sync_health_daily', function (Blueprint $table) {
            $table->unsignedInteger('changes_conflicted')->default(0)->after('changes_refused');
        });
    }

    public function down(): void
    {
        Schema::table('sync_health_daily', function (Blueprint $table) {
            $table->dropColumn('changes_conflicted');
        });
    }
};
