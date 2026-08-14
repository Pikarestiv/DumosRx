<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * The client actively uses 'partial' as a real payment_status (POS credit
 * sales with only some of the total collected — see
 * components/pos/transaction-details-dialog.tsx and
 * lib/db/queries/customers.ts), but the server's enum never had a matching
 * value, so every such sale failed to sync with "Data truncated for column
 * 'payment_status'". 'pending' isn't an equivalent substitute — it means no
 * payment was made at all, not that payment is partially collected.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement("ALTER TABLE sales MODIFY payment_status ENUM('pending','partial','completed','failed','refunded','partially_refunded') DEFAULT 'completed'");
    }

    public function down(): void
    {
        DB::statement("ALTER TABLE sales MODIFY payment_status ENUM('pending','completed','failed','refunded','partially_refunded') DEFAULT 'completed'");
    }
};
