<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * `stock_movements.movement_type` was created as a MySQL ENUM
 * (2024_01_20_000006_create_stock_movements_orders_tables.php) restricted
 * to ['purchase', 'sale', 'adjustment', 'transfer', 'return', 'expired',
 * 'damaged'] - but the client has never actually sent 'transfer'; stock
 * transfers write 'transfer_out'/'transfer_in' (see
 * client/lib/db/queries/stock-transfers.ts), which aren't in that list.
 * Every transfer sync push has been silently failing in production with
 * "Data truncated for column 'movement_type'" since the transfer feature
 * shipped - surfaced more now that cashiers can also initiate transfers
 * (higher volume), but it predates that change.
 *
 * Converts to a plain VARCHAR rather than adding the two missing enum
 * values: the client treats this as a free-form string with no fixed set
 * (see the type list above already being incomplete), so a MySQL ENUM here
 * is a recurring footgun - the next new movement type the client
 * introduces would hit the exact same silent-failure class of bug again.
 */
return new class extends Migration
{
    public function up(): void
    {
        // SQLite (the test suite's driver - see phpunit.xml) has no real
        // ENUM/column-type distinction to migrate away from; movement_type
        // there is already effectively a free-form string.
        if (DB::getDriverName() !== 'sqlite') {
            DB::statement("ALTER TABLE stock_movements MODIFY movement_type VARCHAR(50) NOT NULL");
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() !== 'sqlite') {
            DB::statement("ALTER TABLE stock_movements MODIFY movement_type ENUM('purchase', 'sale', 'adjustment', 'transfer', 'return', 'expired', 'damaged') NOT NULL");
        }
    }
};
