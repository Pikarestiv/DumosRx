<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Server-side counterpart to two new store-level admin toggles, both off by
 * default:
 * - staff_can_request_transfers (client/components/pos/pos-layout-header.tsx):
 *   whether non-admin staff can use the POS header's "Request stock from
 *   another store" button. Admin-tier roles can always request transfers
 *   regardless of this setting.
 * - markup_sales_enabled (client/lib/hooks/use-feature-gate.ts's
 *   isMarkupSalesEnabled): gates the POS cart's entire "Reseller sale" row
 *   behind an explicit owner opt-in, on top of the existing plan-tier
 *   check.
 * Both are written via updateStoreProfile the first time an owner opens
 * the relevant settings card, so without this migration the first save
 * fails with an unknown-column SQL error.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            if (!Schema::hasColumn('stores', 'staff_can_request_transfers')) {
                $table->boolean('staff_can_request_transfers')->default(false);
            }
            if (!Schema::hasColumn('stores', 'markup_sales_enabled')) {
                $table->boolean('markup_sales_enabled')->default(false);
            }
        });
    }

    public function down(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            $table->dropColumn(['staff_can_request_transfers', 'markup_sales_enabled']);
        });
    }
};
