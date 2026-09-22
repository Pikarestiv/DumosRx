<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // The exact replay bug this index prevents is what may have already
        // produced duplicate paystack_reference rows in production -- adding
        // the unique index outright would abort the migration with a
        // duplicate-entry error on any DB that was ever replayed. Query
        // builder (not Eloquent) is used throughout so soft-deleted
        // duplicates -- online_orders has softDeletes() and the unique index
        // applies regardless of deleted_at -- are included too. For every
        // group sharing a reference, keep the oldest row's reference intact
        // (it's the one genuine order) and null out the rest, so no order or
        // payment_status is deleted, only the now-untrustworthy reference.
        $duplicateReferences = DB::table('online_orders')
            ->whereNotNull('paystack_reference')
            ->where('paystack_reference', '!=', '')
            ->select('paystack_reference')
            ->groupBy('paystack_reference')
            ->havingRaw('COUNT(*) > 1')
            ->pluck('paystack_reference');

        foreach ($duplicateReferences as $reference) {
            $ids = DB::table('online_orders')
                ->where('paystack_reference', $reference)
                ->orderBy('created_at')
                ->orderBy('id')
                ->pluck('id');

            $idsToClear = $ids->slice(1); // keep the first (oldest), clear the rest
            if ($idsToClear->isNotEmpty()) {
                DB::table('online_orders')
                    ->whereIn('id', $idsToClear)
                    ->update(['paystack_reference' => null]);
            }
        }

        Schema::table('online_orders', function (Blueprint $table) {
            // Prevents a single verified Paystack reference from being
            // replayed into multiple "paid" orders. MySQL treats each NULL
            // as distinct under a unique index, so transfer/in_store orders
            // (which never set this column) are unaffected.
            $table->unique('paystack_reference');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('online_orders', function (Blueprint $table) {
            $table->dropUnique(['paystack_reference']);
        });
    }
};
