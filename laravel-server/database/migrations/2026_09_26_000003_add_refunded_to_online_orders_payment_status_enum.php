<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * OnlineOrderController::refundOrFlag() refunds a cancelled paid order via
 * Paystack but had no status to record it with, so the store's own records
 * still read 'paid' and any revenue report summing paid online orders
 * overstated. online_orders is API-only (never in the client's local SQLite
 * schema), so there is no client-side half to this change.
 *
 * SQLite enforces an enum as a CHECK constraint, which the test database
 * would reject the new value against - and per this repo's own "ENUM for a
 * string status column is a footgun" note, the column becomes a plain string
 * there rather than a second list to keep in sync.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() === 'sqlite') {
            Schema::table('online_orders', function (Blueprint $table) {
                $table->string('payment_status')->default('pending')->change();
            });

            return;
        }

        DB::statement("ALTER TABLE online_orders MODIFY payment_status ENUM('pending','paid','failed','refunded') DEFAULT 'pending'");
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'sqlite') {
            return;
        }

        DB::statement("ALTER TABLE online_orders MODIFY payment_status ENUM('pending','paid','failed') DEFAULT 'pending'");
    }
};
