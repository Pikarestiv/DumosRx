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
        // 1. Add _synced_at column and index to missing synced tables
        $missingSyncTables = ['inventories', 'activity_logs', 'categories'];

        foreach ($missingSyncTables as $table) {
            if (Schema::hasTable($table) && !Schema::hasColumn($table, '_synced_at')) {
                Schema::table($table, function (Blueprint $table) {
                    $table->timestamp('_synced_at')->nullable()->index();
                });
            }
        }

        // 2. Add index on updated_at for all synced tables to optimize pull queries
        $syncedTables = [
            'medicines',
            'customers',
            'suppliers',
            'sales',
            'sale_items',
            'users',
            'inventories',
            'activity_logs',
            'categories'
        ];

        foreach ($syncedTables as $table) {
            if (Schema::hasTable($table)) {
                $indexes = Schema::getIndexes($table);
                $indexName = "{$table}_updated_at_index";
                $hasIndex = collect($indexes)->contains(fn ($index) => $index['name'] === $indexName);

                if (!$hasIndex) {
                    Schema::table($table, function (Blueprint $table) use ($indexName) {
                        $table->index('updated_at', $indexName);
                    });
                }
            }
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        $missingSyncTables = ['inventories', 'activity_logs', 'categories'];

        foreach ($missingSyncTables as $table) {
            if (Schema::hasTable($table) && Schema::hasColumn($table, '_synced_at')) {
                Schema::table($table, function (Blueprint $table) {
                    $table->dropIndex(['_synced_at']);
                    $table->dropColumn('_synced_at');
                });
            }
        }

        $syncedTables = [
            'medicines',
            'customers',
            'suppliers',
            'sales',
            'sale_items',
            'users',
            'inventories',
            'activity_logs',
            'categories'
        ];

        foreach ($syncedTables as $table) {
            if (Schema::hasTable($table)) {
                $indexes = Schema::getIndexes($table);
                $indexName = "{$table}_updated_at_index";
                $hasIndex = collect($indexes)->contains(fn ($index) => $index['name'] === $indexName);

                if ($hasIndex) {
                    Schema::table($table, function (Blueprint $table) use ($indexName) {
                        $table->dropIndex($indexName);
                    });
                }
            }
        }
    }
};
