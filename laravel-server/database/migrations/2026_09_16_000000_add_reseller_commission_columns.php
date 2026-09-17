<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Server-side counterpart to the client's reseller-commission feature (see
 * client/lib/db/schema.ts and the ALTER TABLE statements in
 * client/lib/db/core.ts): the client added
 * `stores.reseller_commission_percentage` and, on `sales`,
 * `is_reseller_sale`, `reseller_commission_percentage`,
 * `reseller_commission_amount`, `reseller_commission_redeemed`,
 * `reseller_commission_redeemed_at`, and `reseller_commission_redeemed_by`.
 * Every checkout now writes all 3 `sales` fields (0-valued when the reseller
 * toggle is off) and every Settings save writes the `stores` field, so
 * without these columns existing server-side every subsequent push for that
 * store/sale fails permanently with "Unknown column" — the same class of bug
 * fix_sync_schema_drift and add_uppercase_display_enabled_to_stores above
 * this one addressed.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            if (!Schema::hasColumn('stores', 'reseller_commission_percentage')) {
                $table->decimal('reseller_commission_percentage', 5, 2)->default(0);
            }
        });

        Schema::table('sales', function (Blueprint $table) {
            if (!Schema::hasColumn('sales', 'is_reseller_sale')) {
                $table->boolean('is_reseller_sale')->default(false);
            }
            if (!Schema::hasColumn('sales', 'reseller_commission_percentage')) {
                $table->decimal('reseller_commission_percentage', 5, 2)->default(0);
            }
            if (!Schema::hasColumn('sales', 'reseller_commission_amount')) {
                $table->decimal('reseller_commission_amount', 10, 2)->default(0);
            }
            if (!Schema::hasColumn('sales', 'reseller_commission_redeemed')) {
                $table->boolean('reseller_commission_redeemed')->default(false);
            }
            if (!Schema::hasColumn('sales', 'reseller_commission_redeemed_at')) {
                $table->timestamp('reseller_commission_redeemed_at')->nullable();
            }
            if (!Schema::hasColumn('sales', 'reseller_commission_redeemed_by')) {
                $table->string('reseller_commission_redeemed_by')->nullable();
            }
        });
    }

    public function down(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            $table->dropColumn('reseller_commission_percentage');
        });

        Schema::table('sales', function (Blueprint $table) {
            $table->dropColumn([
                'is_reseller_sale',
                'reseller_commission_percentage',
                'reseller_commission_amount',
                'reseller_commission_redeemed',
                'reseller_commission_redeemed_at',
                'reseller_commission_redeemed_by',
            ]);
        });
    }
};
