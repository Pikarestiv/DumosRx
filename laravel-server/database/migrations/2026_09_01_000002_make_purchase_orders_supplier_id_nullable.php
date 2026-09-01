<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // The client's local SQLite schema has always allowed
        // purchase_orders.supplier_id to be null (see
        // client/lib/db/schema.ts — no NOT NULL constraint), and the app
        // permits creating a purchase order before a supplier is picked. The
        // server's column was NOT NULL, so any such purchase order has
        // failed to sync ever since with "Column 'supplier_id' cannot be
        // null" (SQLSTATE 23000), confirmed via a real sync failure log.
        // The FK (purchase_orders_supplier_id_foreign) uses NO ACTION on
        // delete, so making the column nullable doesn't change that
        // behavior — a NULL value simply never matches the constraint.
        Schema::table('purchase_orders', function (Blueprint $table) {
            $table->uuid('supplier_id')->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('purchase_orders', function (Blueprint $table) {
            $table->uuid('supplier_id')->nullable(false)->change();
        });
    }
};
