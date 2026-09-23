<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Server-side counterpart to the client's `stores.receipt_logo_position`
 * column (see client/lib/db/schema.ts and the ALTER TABLE in
 * client/lib/db/schema-migrations.ts): controls whether a receipt's logo
 * renders above the store name (default) or beside it. Without this, any
 * device that writes to it fails every subsequent push for that store with
 * "Unknown column" - the same class of bug 2026_09_17_000000 fixed for
 * tax_number.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            if (!Schema::hasColumn('stores', 'receipt_logo_position')) {
                $table->string('receipt_logo_position')->default('above');
            }
        });
    }

    public function down(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            $table->dropColumn('receipt_logo_position');
        });
    }
};
