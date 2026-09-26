<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Server-side counterpart to the client's new
 * `purchase_order_items.quantity_received` column (see
 * client/lib/db/schema.ts and the ALTER TABLE in
 * client/lib/db/schema-migrations.ts). Purchase-order receiving used to be
 * all-or-nothing: any submitted quantity flipped the whole PO to
 * "received" and the undelivered balance had no path back into the system.
 * Tracking cumulative received quantity per line is what lets a PO sit in
 * the new `partially_received` status and be received again against its
 * outstanding balance.
 *
 * Stored in the same unit as `quantity_ordered` (base units), since
 * SyncController::push() converts the client's bulk quantities down by
 * units_per_bulk on the way in. Without this migration, any device that
 * writes to the new column fails every subsequent push for that row with
 * "Unknown column" - the same class of bug
 * 2026_09_23_000002_add_immediate_purchase_fields_to_purchase_order_items.php
 * fixed.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('purchase_order_items', function (Blueprint $table) {
            if (!Schema::hasColumn('purchase_order_items', 'quantity_received')) {
                $table->integer('quantity_received')->default(0);
            }
        });
    }

    public function down(): void
    {
        Schema::table('purchase_order_items', function (Blueprint $table) {
            $table->dropColumn('quantity_received');
        });
    }
};
