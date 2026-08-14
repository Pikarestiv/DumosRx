<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The client's local schema has deliberately provisioned notes/received_date
 * on stock_batches since (see client/lib/db/core.ts's syncColumns migration
 * list, alongside supplier_id/manufacture_date/etc which the server already
 * has) — but no server-side migration ever added them, so every push
 * touching a stock_batches row failed with an unknown-column error. Unlike
 * products.brand_name/supplier_id (deliberately removed by an earlier
 * migration — see 2026_07_23_182355_remove_brand_and_supplier_from_
 * products.php), there's no evidence these were ever meant to be dropped;
 * they were simply never added. Add them rather than keep stripping them
 * from the payload client-side.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stock_batches', function (Blueprint $table) {
            $table->date('received_date')->nullable()->after('expiry_date');
            $table->text('notes')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('stock_batches', function (Blueprint $table) {
            $table->dropColumn(['received_date', 'notes']);
        });
    }
};
