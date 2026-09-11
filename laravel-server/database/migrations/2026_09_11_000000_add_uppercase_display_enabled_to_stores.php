<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Server-side counterpart to the client's `stores.uppercase_display_enabled`
 * column (see client/lib/db/schema.ts and the ALTER TABLE in
 * client/lib/db/core.ts): without this, any device that ever writes to a
 * store's `uppercase_display_enabled` field (defaulting to true, so this
 * happens the moment any store record syncs) fails every subsequent push for
 * that store with "Unknown column" — the same class of bug the
 * fix_sync_schema_drift migration above this one addressed.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            if (!Schema::hasColumn('stores', 'uppercase_display_enabled')) {
                $table->boolean('uppercase_display_enabled')->default(true);
            }
        });
    }

    public function down(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            $table->dropColumn('uppercase_display_enabled');
        });
    }
};
