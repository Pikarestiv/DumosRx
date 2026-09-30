<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * PG-2: the reconciliation sweep alerts an operator about money that arrived
 * with no order to show for it. This column is the "already told someone"
 * stamp that keeps an hourly sweep from re-mailing the same intent forever.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('storefront_payment_intents', function (Blueprint $table) {
            $table->timestamp('reconciliation_alerted_at')->nullable()->after('consumed_at');
        });
    }

    public function down(): void
    {
        Schema::table('storefront_payment_intents', function (Blueprint $table) {
            $table->dropColumn('reconciliation_alerted_at');
        });
    }
};
