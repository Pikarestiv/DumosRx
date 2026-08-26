<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The client's STORE_SCOPED_TABLES list (client/lib/db/core.ts) auto-injects
 * store_id into every insert for these tables, including "child" tables that
 * only need it to satisfy the client's own insert() helper; pull-side
 * scoping still derives them through their parent (see SyncController::pull).
 * Missing the column outright made every push for these tables fail with an
 * unknown-column error, which (since push runs as one transaction per batch)
 * blocked every other queued change in the same batch too.
 */
return new class extends Migration
{
    private array $tables = [
        'stock_batches',
        'sale_items',
        'sale_item_batches',
        'prescription_items',
        'return_items',
        'purchase_order_items',
    ];

    /**
     * Run the migrations.
     */
    public function up(): void
    {
        foreach ($this->tables as $table) {
            Schema::table($table, function (Blueprint $blueprint) {
                $blueprint->uuid('store_id')->nullable()->index();
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        foreach ($this->tables as $table) {
            Schema::table($table, function (Blueprint $blueprint) {
                $blueprint->dropColumn('store_id');
            });
        }
    }
};
