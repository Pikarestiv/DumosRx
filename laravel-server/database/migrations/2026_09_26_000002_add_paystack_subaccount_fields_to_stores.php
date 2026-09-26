<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Client-side counterpart: client/lib/db/schema.ts and the ALTER TABLE in
 * client/lib/db/schema-migrations.ts's `stores` entry. See
 * docs/superpowers/specs/2026-09-26-storefront-paystack-subaccounts-design.md.
 *
 * paystack_account_number_last4 is deliberately the only account-number
 * fragment stored - the full number is only ever in flight during the
 * create-subaccount call, never persisted.
 *
 * paystack_fee_dirty_at mirrors storefront_dirty_at: stamped when the global
 * platform fee changes, cleared once this store's subaccount has been
 * updated to match (see SyncSubaccountFeeRates, Task 6).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            if (!Schema::hasColumn('stores', 'paystack_subaccount_code')) {
                $table->string('paystack_subaccount_code')->nullable();
            }
            if (!Schema::hasColumn('stores', 'paystack_subaccount_country')) {
                $table->string('paystack_subaccount_country')->nullable();
            }
            if (!Schema::hasColumn('stores', 'paystack_bank_code')) {
                $table->string('paystack_bank_code')->nullable();
            }
            if (!Schema::hasColumn('stores', 'paystack_account_number_last4')) {
                $table->string('paystack_account_number_last4', 4)->nullable();
            }
            if (!Schema::hasColumn('stores', 'paystack_fee_dirty_at')) {
                $table->timestamp('paystack_fee_dirty_at')->nullable();
            }
        });
    }

    public function down(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            $table->dropColumn([
                'paystack_subaccount_code',
                'paystack_subaccount_country',
                'paystack_bank_code',
                'paystack_account_number_last4',
                'paystack_fee_dirty_at',
            ]);
        });
    }
};
