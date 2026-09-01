<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // The client's local SQLite schema has always had purchase_orders.type
        // (TEXT DEFAULT 'standard' — see client/lib/db/schema.ts), but no
        // server migration ever added it here. Every purchase order pushed
        // from a client has failed to sync ever since with "Unknown column
        // 'type'" (SQLSTATE 42S22), confirmed via a real sync failure log
        // predating this fix.
        Schema::table('purchase_orders', function (Blueprint $table) {
            if (!Schema::hasColumn('purchase_orders', 'type')) {
                $table->string('type')->default('standard')->after('status');
            }
        });
    }

    public function down(): void
    {
        Schema::table('purchase_orders', function (Blueprint $table) {
            $table->dropColumn('type');
        });
    }
};
