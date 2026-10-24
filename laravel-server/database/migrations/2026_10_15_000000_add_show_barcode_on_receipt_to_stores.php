<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Server-side counterpart to the client's `stores.show_barcode_on_receipt`
 * column (see client/lib/db/schema.ts and the ALTER TABLE in
 * client/lib/db/schema-migrations.ts): lets a store print its receipts
 * without the bottom barcode. Without this, any device that writes to it
 * fails every subsequent push for that store with "Unknown column" - the
 * same class of bug 2026_09_23_000000 fixed for receipt_logo_position.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            if (! Schema::hasColumn('stores', 'show_barcode_on_receipt')) {
                $table->boolean('show_barcode_on_receipt')->default(true);
            }
        });
    }

    public function down(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            $table->dropColumn('show_barcode_on_receipt');
        });
    }
};
