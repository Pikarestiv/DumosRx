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
        $tables = ['feedback', 'activity_logs', 'categories'];

        foreach ($tables as $table) {
            if (Schema::hasTable($table) && !Schema::hasColumn($table, '_synced_at')) {
                Schema::table($table, function (Blueprint $blueprint) {
                    $blueprint->timestamp('_synced_at')->nullable()->index();
                });
            }
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        $tables = ['feedback', 'activity_logs', 'categories'];

        foreach ($tables as $table) {
            if (Schema::hasTable($table) && Schema::hasColumn($table, '_synced_at')) {
                Schema::table($table, function (Blueprint $blueprint) {
                    $blueprint->dropColumn('_synced_at');
                });
            }
        }
    }
};
