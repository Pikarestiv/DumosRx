<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Server-side counterpart to the client's `stores.tax_number` column (see
 * client/lib/db/schema.ts and the ALTER TABLE in client/lib/db/core.ts,
 * added for the Tax Invoice receipt print variant): without this, any device
 * that ever writes to a store's `tax_number` field fails every subsequent
 * push for that store with "Unknown column" — the same class of bug the
 * fix_sync_schema_drift migration addressed. This field was missed when the
 * Tax Invoice feature shipped; flagged during the reseller-commission
 * feature's final review as a pre-existing, unrelated gap.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            if (!Schema::hasColumn('stores', 'tax_number')) {
                $table->string('tax_number')->nullable();
            }
        });
    }

    public function down(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            $table->dropColumn('tax_number');
        });
    }
};
