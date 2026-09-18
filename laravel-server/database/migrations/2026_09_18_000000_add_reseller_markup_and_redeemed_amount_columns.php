<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Server-side counterpart to the client's "Claim Full Markup" reseller
 * option (see client/lib/hooks/use-redeem-reseller-commission-mutation.ts):
 * a reseller sale can now be redeemed either for its usual percentage-based
 * `reseller_commission_amount`, or for the sale's entire
 * `reseller_markup_amount`. `reseller_commission_redeemed_amount` snapshots
 * whichever one was actually paid out, and `reseller_commission_claim_type`
 * records which option was used, so profit reporting can subtract exactly
 * what left the store without re-deriving it later.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sales', function (Blueprint $table) {
            if (!Schema::hasColumn('sales', 'reseller_markup_amount')) {
                $table->decimal('reseller_markup_amount', 10, 2)->default(0);
            }
            if (!Schema::hasColumn('sales', 'reseller_commission_redeemed_amount')) {
                $table->decimal('reseller_commission_redeemed_amount', 10, 2)->default(0);
            }
            if (!Schema::hasColumn('sales', 'reseller_commission_claim_type')) {
                $table->string('reseller_commission_claim_type')->nullable();
            }
        });
    }

    public function down(): void
    {
        Schema::table('sales', function (Blueprint $table) {
            $table->dropColumn([
                'reseller_markup_amount',
                'reseller_commission_redeemed_amount',
                'reseller_commission_claim_type',
            ]);
        });
    }
};
