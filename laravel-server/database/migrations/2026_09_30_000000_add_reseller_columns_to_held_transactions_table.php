<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Server-side counterpart to `held_transactions.is_reseller_sale` /
 * `markup_type` on the client (client/lib/db/schema.ts): a held reseller sale
 * used to come back from recall as an ordinary sale at catalog prices, losing
 * the markup and the agent's commission. Both columns are now written on every
 * hold, so without them each held-transaction push fails with an
 * unknown-column SQL error. Mirrors sales.is_reseller_sale/markup_type, except
 * markup_type has no default here: a held sale that was never a reseller sale
 * carries null.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('held_transactions', function (Blueprint $table) {
            if (!Schema::hasColumn('held_transactions', 'is_reseller_sale')) {
                $table->boolean('is_reseller_sale')->default(false);
            }
            if (!Schema::hasColumn('held_transactions', 'markup_type')) {
                $table->string('markup_type')->nullable();
            }
        });
    }

    public function down(): void
    {
        Schema::table('held_transactions', function (Blueprint $table) {
            $table->dropColumn(['is_reseller_sale', 'markup_type']);
        });
    }
};
