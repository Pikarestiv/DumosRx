<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Server-side counterpart to the client's `stock_movements.status` column
 * (see client/lib/db/schema.ts and the ALTER TABLE in
 * client/lib/db/schema-migrations.ts): set to "needs_review" on a
 * cross-store transfer's two rows when the initiating user isn't
 * admin-tier (a cashier requesting stock when the owner isn't around) - the
 * transfer still takes effect immediately either way, this just flags it
 * for the owner to check afterward. See client/lib/db/queries/stock-transfers.ts.
 * Without this migration, any device that writes to this column fails
 * every subsequent push for that row with "Unknown column" - the same
 * class of bug 2026_09_17_000000_add_tax_number_to_stores.php fixed.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stock_movements', function (Blueprint $table) {
            if (!Schema::hasColumn('stock_movements', 'status')) {
                $table->string('status')->nullable();
            }
        });
    }

    public function down(): void
    {
        Schema::table('stock_movements', function (Blueprint $table) {
            $table->dropColumn('status');
        });
    }
};
