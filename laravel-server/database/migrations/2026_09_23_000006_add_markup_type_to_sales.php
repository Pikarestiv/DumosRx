<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Server-side counterpart to the client's reseller-vs-store-markup split
 * (see client/lib/hooks/use-pos-payment.ts and
 * client/components/pos/pos-cart.tsx): distinguishes a real reseller/agent
 * sale (commission owed, subject to the redeem/store-claim decision) from
 * a store staff member pricing above normal for their own reasons (markup
 * goes straight to the store, pre-settled at checkout). DEFAULT 'reseller'
 * so every existing is_reseller_sale row keeps its current
 * pending-redemption behavior unchanged. Every checkout writes this
 * column (null when is_reseller_sale is false), so without it every sale
 * push fails with an unknown-column SQL error.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sales', function (Blueprint $table) {
            if (!Schema::hasColumn('sales', 'markup_type')) {
                $table->string('markup_type')->nullable()->default('reseller');
            }
        });
    }

    public function down(): void
    {
        Schema::table('sales', function (Blueprint $table) {
            $table->dropColumn('markup_type');
        });
    }
};
