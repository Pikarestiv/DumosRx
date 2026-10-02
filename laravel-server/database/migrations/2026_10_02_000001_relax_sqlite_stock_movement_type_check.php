<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * 2026_09_23_000005_widen_stock_movements_movement_type assumed SQLite had
 * nothing to migrate because it has no real ENUM type. It does: Laravel
 * compiles `enum()` to a `CHECK (... in (...))` constraint there, so the
 * test database still rejects every movement type added since 2024 —
 * 'transfer_in'/'transfer_out' and now 'sync_reconciliation' — while
 * production MySQL accepts them. That gap meant the test suite could never
 * exercise the very types the earlier migration shipped to fix.
 *
 * Rebuilds the column as a plain VARCHAR on SQLite only; MySQL was already
 * converted by that migration and needs no second ALTER.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() !== 'sqlite') {
            return;
        }

        Schema::table('stock_movements', function (Blueprint $table) {
            $table->string('movement_type', 50)->change();
        });
    }

    public function down(): void
    {
        // Irreversible by design: restoring the CHECK would re-reject rows
        // that are legitimately in the table by now.
    }
};
