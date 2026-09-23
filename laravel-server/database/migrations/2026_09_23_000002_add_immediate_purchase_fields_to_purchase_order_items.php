<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Server-side counterpart to the client's new `purchase_order_items`
 * columns (see client/lib/db/schema.ts and the ALTER TABLE in
 * client/lib/db/schema-migrations.ts): an Immediate Purchase's per-line
 * selling price, cost override, and lot number, previously only ever
 * consumed transiently at receiving time and never persisted - so saving
 * an in-progress Immediate Purchase as a draft silently discarded them.
 * `expiry_date` already exists on this table from the original 2024
 * migration, so it isn't added again here. Without this migration, any
 * device that writes to these new columns fails every subsequent push for
 * that row with "Unknown column" - the same class of bug
 * 2026_09_17_000000_add_tax_number_to_stores.php fixed.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('purchase_order_items', function (Blueprint $table) {
            if (!Schema::hasColumn('purchase_order_items', 'selling_price')) {
                $table->decimal('selling_price', 12, 2)->nullable();
            }
            if (!Schema::hasColumn('purchase_order_items', 'cost_price_override')) {
                $table->decimal('cost_price_override', 12, 2)->nullable();
            }
            if (!Schema::hasColumn('purchase_order_items', 'lot_number')) {
                $table->string('lot_number')->nullable();
            }
        });
    }

    public function down(): void
    {
        Schema::table('purchase_order_items', function (Blueprint $table) {
            $table->dropColumn(['selling_price', 'cost_price_override', 'lot_number']);
        });
    }
};
